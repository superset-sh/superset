import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { render } from "@react-email/render-native";
import nodemailer from "nodemailer";
import addressparser from "nodemailer/lib/addressparser";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import {
	type CreateBatchOptions,
	type CreateBatchRequestOptions,
	type CreateEmailOptions,
	type CreateEmailRequestOptions,
	Resend,
	type SendEventOptions,
	type SendEventResponseSuccess,
} from "resend";

export interface EmailSenderOptions {
	SMTP_URL?: string;
	EMAIL_FROM?: string;
	RESEND_API_KEY?: string;
}

type DeliveryResult<T> =
	| { data: T; error: null }
	| { data: null; error: { name: string; message: string } };
type LifecycleResult =
	| DeliveryResult<SendEventResponseSuccess>
	| {
			data: null;
			error: null;
			skipped: "smtp_lifecycle_unavailable";
	  };

export interface EmailSender {
	emails: {
		send(
			email: CreateEmailOptions,
			options?: CreateEmailRequestOptions,
		): Promise<DeliveryResult<{ id: string }>>;
	};
	batch: {
		send(
			emails: CreateBatchOptions,
			options?: CreateBatchRequestOptions,
		): Promise<DeliveryResult<{ data: { id: string }[] }>>;
	};
	events: { send(event: SendEventOptions): Promise<LifecycleResult> };
	campaigns: Resend | null;
}

class UnsupportedSmtpFeature extends Error {}
class PartialSmtpDelivery extends Error {}
let loggedLifecycleSkip = false;

function failure(error: unknown) {
	return {
		data: null,
		error: {
			name:
				error instanceof PartialSmtpDelivery
					? "smtp_partial_delivery"
					: error instanceof UnsupportedSmtpFeature
						? "validation_error"
						: "smtp_error",
			message:
				error instanceof PartialSmtpDelivery
					? "SMTP message partially delivered; accepted recipients cannot be rolled back"
					: error instanceof UnsupportedSmtpFeature
						? error.message
						: "SMTP delivery failed; a batch may have partially delivered",
		},
	};
}

function validMailbox(address: string) {
	const at = address.lastIndexOf("@");
	if (at < 1 || at === address.length - 1) return false;
	const local = address.slice(0, at);
	const domain = address.slice(at + 1);
	if (
		!/^[^<>()[\]\\.,;:\s@"]+(?:\.[^<>()[\]\\.,;:\s@"]+)*$/u.test(local) &&
		!/^"(?:[^"\\\r\n]|\\[ -~])*"$/u.test(local)
	)
		return false;
	if (domain.startsWith("[") && domain.endsWith("]"))
		return isIP(domain.slice(1, -1).replace(/^IPv6:/i, "")) !== 0;
	const ascii = domainToASCII(domain);
	return (
		!!ascii &&
		ascii.length <= 253 &&
		/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/i.test(
			ascii,
		)
	);
}

function validateAddresses(
	value: string | string[] | undefined,
	required = false,
	singular = false,
) {
	const inputs = Array.isArray(value) ? value : [value ?? ""];
	if (
		inputs.some((input) =>
			Array.from(input).some((character) => {
				const code = character.charCodeAt(0);
				return (code < 32 && code !== 9) || code === 127;
			}),
		)
	)
		throw new UnsupportedSmtpFeature(
			"SMTP address fields must not contain control characters",
		);
	const parsed = inputs.flatMap((input) =>
		input.trim() ? addressparser(input, { flatten: true }) : [],
	);
	if (
		(required && !parsed.length) ||
		(singular && parsed.length !== 1) ||
		parsed.some((entry) => !entry.address)
	)
		throw new UnsupportedSmtpFeature("SMTP requires valid mailbox addresses");
	const envelope = new MailComposer({ to: parsed }).compile().getEnvelope();
	if (envelope.to.some((address) => !validMailbox(address)))
		throw new UnsupportedSmtpFeature("SMTP requires valid mailbox addresses");
}

async function prepare(
	email: CreateEmailOptions | CreateBatchOptions[number],
	from?: string,
): Promise<Mail.Options> {
	if (
		email.template ||
		email.scheduledAt ||
		email.topicId != null ||
		email.tags?.length
	) {
		throw new UnsupportedSmtpFeature(
			"SMTP does not support Resend templates, scheduling, topics or tags",
		);
	}
	validateAddresses(from || email.from, true, true);
	validateAddresses(email.to, true);
	validateAddresses(email.cc);
	validateAddresses(email.bcc);
	validateAddresses(email.replyTo);
	if (
		email.subject == null ||
		(email.react == null && email.html == null && email.text == null)
	)
		throw new UnsupportedSmtpFeature(
			"SMTP requires a subject and message body",
		);
	const attachments = await Promise.all(
		(("attachments" in email ? email.attachments : undefined) ?? []).map(
			async (attachment): Promise<Mail.Attachment> => {
				if (attachment.content == null && !attachment.path)
					throw new UnsupportedSmtpFeature(
						"SMTP attachments require content or a hosted HTTP(S) path",
					);
				let content =
					typeof attachment.content === "string"
						? Buffer.from(attachment.content, "base64")
						: attachment.content;
				if (attachment.path) {
					let url: URL;
					try {
						url = new URL(attachment.path);
					} catch {
						throw new UnsupportedSmtpFeature(
							"SMTP attachment paths must use HTTP(S)",
						);
					}
					if (url.protocol !== "http:" && url.protocol !== "https:")
						throw new UnsupportedSmtpFeature(
							"SMTP attachment paths must use HTTP(S)",
						);
					const response = await fetch(url, {
						signal: AbortSignal.timeout(10_000),
					});
					if (!response.ok)
						throw new Error("Hosted SMTP attachment unavailable");
					content = Buffer.from(await response.arrayBuffer());
				}
				return {
					filename: attachment.filename,
					content,
					contentType: attachment.contentType,
					cid: attachment.contentId,
				};
			},
		),
	);
	const html = email.react != null ? await render(email.react) : email.html;
	const prepared: Mail.Options = {
		from: from || email.from,
		to: email.to,
		cc: email.cc,
		bcc: email.bcc,
		replyTo: email.replyTo,
		subject: email.subject,
		headers: email.headers,
		text: email.text,
		html,
		attachments,
		disableFileAccess: true,
		disableUrlAccess: true,
	};
	const envelope = new MailComposer(prepared).compile().getEnvelope();
	if (
		typeof envelope.from !== "string" ||
		!validMailbox(envelope.from) ||
		!envelope.to.length ||
		envelope.to.some((address) => !validMailbox(address))
	)
		throw new UnsupportedSmtpFeature(
			"SMTP requires a valid sender and recipient envelope",
		);
	return prepared;
}

function checkRequestOptions(options?: CreateEmailRequestOptions) {
	if (options && Object.keys(options).length)
		throw new UnsupportedSmtpFeature(
			"SMTP does not support Resend request options or idempotency",
		);
}

export function createEmailSender(options: EmailSenderOptions): EmailSender {
	if (!options.SMTP_URL) {
		const resend = new Resend(options.RESEND_API_KEY);
		return {
			emails: {
				send: (email, requestOptions) =>
					resend.emails.send(email, requestOptions),
			},
			batch: {
				send: (emails, requestOptions) =>
					resend.batch.send(emails, requestOptions),
			},
			events: resend.events,
			campaigns: resend,
		};
	}
	let url: URL;
	try {
		url = new URL(options.SMTP_URL);
	} catch {
		throw new Error("SMTP_URL must use smtp:// or smtps://");
	}
	if (url.protocol !== "smtp:" && url.protocol !== "smtps:")
		throw new Error("SMTP_URL must use smtp:// or smtps://");
	if (!url.hostname) throw new Error("SMTP_URL must include a host");
	if (url.search || url.hash || (url.pathname && url.pathname !== "/"))
		throw new Error(
			"SMTP_URL must contain only SMTP connection credentials, host and port",
		);
	let user: string;
	let pass: string;
	try {
		user = decodeURIComponent(url.username);
		pass = decodeURIComponent(url.password);
	} catch {
		throw new Error("SMTP_URL contains invalid credentials encoding");
	}
	const transport = nodemailer.createTransport({
		host: url.hostname.replace(/^\[|\]$/g, ""),
		port: url.port ? Number(url.port) : url.protocol === "smtps:" ? 465 : 587,
		secure: url.protocol === "smtps:",
		auth: user ? { user, pass } : undefined,
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 30_000,
		logger: false,
		debug: false,
		disableFileAccess: true,
		disableUrlAccess: true,
	});
	return {
		emails: {
			async send(email, requestOptions) {
				try {
					checkRequestOptions(requestOptions);
					const sent = await transport.sendMail(
						await prepare(email, options.EMAIL_FROM),
					);
					if (sent.rejected.length) throw new PartialSmtpDelivery();
					return { data: { id: sent.messageId }, error: null };
				} catch (error) {
					return failure(error);
				}
			},
		},
		batch: {
			async send(emails, requestOptions) {
				try {
					checkRequestOptions(requestOptions);
					const prepared = await Promise.all(
						emails.map((email) => prepare(email, options.EMAIL_FROM)),
					);
					const data: { id: string }[] = [];
					for (const email of prepared) {
						const sent = await transport.sendMail(email);
						if (sent.rejected.length) throw new PartialSmtpDelivery();
						data.push({ id: sent.messageId });
					}
					return { data: { data }, error: null };
				} catch (error) {
					return failure(error);
				}
			},
		},
		events: {
			async send() {
				if (!loggedLifecycleSkip) {
					console.info(
						"[email] SMTP lifecycle events are skipped; Resend campaigns are unavailable",
					);
					loggedLifecycleSkip = true;
				}
				return {
					data: null,
					error: null,
					skipped: "smtp_lifecycle_unavailable",
				};
			},
		},
		campaigns: null,
	};
}
