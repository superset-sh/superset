import { isStrictProfile } from "@superset/shared/deployment-profile";
import {
	type CreateBatchOptions,
	type CreateBatchRequestOptions,
	type CreateBatchResponse,
	type CreateEmailOptions,
	type CreateEmailRequestOptions,
	type CreateEmailResponse,
	Resend,
} from "resend";

import { env } from "../env";

let client: Resend | null = null;

function getResend(): Resend {
	if (client) return client;
	if (!env.RESEND_API_KEY) {
		throw new Error(
			"Resend not configured — set RESEND_API_KEY (or use Mailpit/console for local dev)",
		);
	}
	client = new Resend(env.RESEND_API_KEY);
	return client;
}

function formatRecipients(to: CreateEmailOptions["to"]): string {
	return Array.isArray(to) ? to.join(",") : to;
}

function logConsoleEmail(email: CreateEmailOptions) {
	console.log(
		`[email:console] to=${formatRecipients(email.to)} subject=${email.subject}`,
	);
}

export async function sendEmail(
	email: CreateEmailOptions,
	options?: CreateEmailRequestOptions,
): Promise<CreateEmailResponse> {
	if (!env.RESEND_API_KEY && !isStrictProfile()) {
		logConsoleEmail(email);
		return { data: { id: "console-dev" }, error: null };
	}
	return getResend().emails.send(email, options);
}

export async function sendBatchEmails(
	emails: CreateBatchOptions,
	options?: CreateBatchRequestOptions,
): Promise<CreateBatchResponse> {
	if (!env.RESEND_API_KEY && !isStrictProfile()) {
		for (const email of emails) logConsoleEmail(email);
		return {
			data: {
				data: emails.map((_, index) => ({ id: `console-dev-${index}` })),
			},
			error: null,
		};
	}
	return getResend().batch.send(emails, options);
}
