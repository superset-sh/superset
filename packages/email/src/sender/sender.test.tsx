import { afterEach, expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { createElement } from "react";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function sink(rejectMessage = 0, rejectRecipient?: string) {
	const messages: { envelope: string[]; mime: string }[] = [];
	const commands: string[] = [];
	const sockets = new Set<Socket>();
	let attempts = 0;
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.write("220 localhost test sink\r\n");
		let pending = "";
		let data: string[] | undefined;
		let envelope: string[] = [];
		socket.on("data", (chunk) => {
			pending += chunk.toString();
			while (pending.includes("\r\n")) {
				const end = pending.indexOf("\r\n");
				const line = pending.slice(0, end);
				if (!data) commands.push(line);
				pending = pending.slice(end + 2);
				if (data) {
					if (line !== ".") {
						data.push(line.startsWith("..") ? line.slice(1) : line);
						continue;
					}
					attempts++;
					if (attempts === rejectMessage)
						socket.write("550 rejected fixture\r\n");
					else {
						messages.push({ envelope, mime: data.join("\r\n") });
						socket.write("250 queued fixture\r\n");
					}
					data = undefined;
				} else if (/^(EHLO|HELO)/.test(line)) socket.write("250 localhost\r\n");
				else if (line.startsWith("MAIL FROM:")) {
					envelope = [line];
					socket.write("250 ok\r\n");
				} else if (line.startsWith("RCPT TO:")) {
					if (rejectRecipient && line.includes(rejectRecipient))
						socket.write("550 rejected recipient fixture\r\n");
					else {
						envelope.push(line);
						socket.write("250 ok\r\n");
					}
				} else if (line === "DATA") {
					data = [];
					socket.write("354 send data\r\n");
				} else if (line === "QUIT") socket.end("221 bye\r\n");
				else socket.write("250 ok\r\n");
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw Error("No sink port");
	cleanups.push(() => {
		for (const socket of sockets) socket.destroy();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	});
	return { url: `smtp://127.0.0.1:${address.port}`, messages, commands };
}

async function sender(options: {
	SMTP_URL?: string;
	EMAIL_FROM?: string;
	RESEND_API_KEY?: string;
}) {
	const implementation = await import("./sender").catch(() => undefined);
	expect(implementation?.createEmailSender).toBeDefined();
	if (!implementation) throw Error("Email sender missing");
	return implementation.createEmailSender(options);
}
const email = {
	from: "Cloud <cloud@example.test>",
	to: "to@example.test",
	subject: "Fixture",
	text: "Plain fixture",
};

test("SMTP delivers recipient envelope and MIME using the configured sender", async () => {
	const smtp = await sink();
	const client = await sender({
		SMTP_URL: smtp.url,
		EMAIL_FROM: "Self Host <sender@example.test>",
	});
	const result = await client.emails.send({
		...email,
		cc: ["cc@example.test"],
		bcc: "hidden@example.test",
		replyTo: "reply@example.test",
		headers: { "X-Fixture": "owned-sink" },
		html: "<p>HTML fixture</p>",
	});
	expect(result.error).toBeNull();
	expect(result.data?.id).toBeTruthy();
	expect(smtp.messages).toHaveLength(1);
	expect(smtp.messages[0]?.envelope).toEqual([
		"MAIL FROM:<sender@example.test>",
		"RCPT TO:<to@example.test>",
		"RCPT TO:<cc@example.test>",
		"RCPT TO:<hidden@example.test>",
	]);
	const mime = smtp.messages[0]?.mime ?? "";
	for (const fragment of [
		"From: Self Host <sender@example.test>",
		"Reply-To: reply@example.test",
		"X-Fixture: owned-sink",
		"Plain fixture",
		"<p>HTML fixture</p>",
	])
		expect(mime).toContain(fragment);
	expect(mime).not.toContain("Bcc:");
});

test("SMTP renders React and preserves base64, Buffer and CID attachments", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.emails.send({
		...email,
		react: createElement("p", null, "React fixture"),
		attachments: [
			{
				filename: "base64.txt",
				content: "YmFzZTY0IGZpeHR1cmU=",
				contentType: "text/plain",
			},
			{
				filename: "inline.txt",
				content: Buffer.from("buffer fixture"),
				contentId: "fixture-cid",
				contentType: "text/plain",
			},
		],
	});
	expect(result.error).toBeNull();
	const mime = smtp.messages[0]?.mime ?? "";
	for (const fragment of [
		"React fixture",
		"YmFzZTY0IGZpeHR1cmU=",
		"YnVmZmVyIGZpeHR1cmU=",
		"Content-ID: <fixture-cid>",
		"text/plain",
	])
		expect(mime).toContain(fragment);
	expect(mime).not.toContain("WW1GelpUWTBJR1pwZUhSMWNtVT0=");
});

test("SMTP refuses unsupported provider features and file attachments before delivery", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	for (const extra of [
		{ scheduledAt: "2030-01-01T00:00:00Z" },
		{ tags: [{ name: "kind", value: "fixture" }] },
		{ topicId: "topic" },
		{ attachments: [{ path: "/etc/passwd" }] },
		{ attachments: [{ path: "file:///etc/passwd" }] },
	]) {
		const result = await client.emails.send({ ...email, ...extra });
		expect(result.error).toBeTruthy();
	}
	const template = await client.emails.send({
		from: email.from,
		to: email.to,
		subject: email.subject,
		template: { id: "template" },
	});
	expect(template.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
});

test("SMTP prevalidates and renders the entire batch before delivery", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const validation = await client.batch.send([
		email,
		{ ...email, scheduledAt: "2030-01-01T00:00:00Z" },
	]);
	expect(validation.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
	const originalError = console.error;
	console.error = () => {};
	cleanups.push(() => {
		console.error = originalError;
	});
	function Broken(): never {
		throw Error("render fixture");
	}
	const rendering = await client.batch.send([
		email,
		{ ...email, react: createElement(Broken) },
	]);
	expect(rendering.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
});

test("SMTP reports delivery failure and leaves partial batch delivery visible at the boundary", async () => {
	const smtp = await sink(2);
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.batch.send([
		email,
		{ ...email, to: "second@example.test" },
	]);
	expect(result.error).toBeTruthy();
	expect(result.data).toBeNull();
	expect(smtp.messages).toHaveLength(1);
});

test("SMTP lifecycle events are explicitly skipped without network delivery or recipient logs", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	expect(client.campaigns).toBeNull();
	const logs: unknown[][] = [];
	const original = console.info;
	console.info = (...args: unknown[]) => logs.push(args);
	cleanups.push(() => {
		console.info = original;
	});
	for (let i = 0; i < 2; i++) {
		const result = await client.events.send({
			event: "user.welcome",
			email: "private@example.test",
		});
		expect("skipped" in result && result.skipped).toBe(
			"smtp_lifecycle_unavailable",
		);
		expect(result.error).toBeNull();
	}
	expect(logs).toHaveLength(1);
	expect(JSON.stringify(logs)).not.toContain("private@example.test");
	expect(smtp.messages).toHaveLength(0);
});

test("default sender retains genuine Resend HTTP payloads and provider errors", async () => {
	const originalError = console.error;
	console.error = () => {};
	cleanups.push(() => {
		console.error = originalError;
	});
	const original = globalThis.fetch;
	const requests: { url: string; body: unknown; key: string | null }[] = [];
	globalThis.fetch = Object.assign(
		async (input: Request | string | URL, init?: RequestInit) => {
			requests.push({
				url: String(input),
				body: JSON.parse(String(init?.body)),
				key: new Headers(init?.headers).get("authorization"),
			});
			return Response.json(
				{ name: "validation_error", message: "fixture provider failure" },
				{ status: 422 },
			);
		},
		{ preconnect: original.preconnect },
	);
	cleanups.push(() => {
		globalThis.fetch = original;
	});
	const client = await sender({ RESEND_API_KEY: "re_owned_fixture" });
	expect(client.campaigns).not.toBeNull();
	const result = await client.emails.send({
		...email,
		scheduledAt: "2030-01-01T00:00:00Z",
		tags: [{ name: "kind", value: "fixture" }],
	});
	expect(result.error?.message).toBe("fixture provider failure");
	expect(requests).toEqual([
		{
			url: "https://api.resend.com/emails",
			body: {
				from: email.from,
				to: email.to,
				subject: email.subject,
				text: email.text,
				scheduled_at: "2030-01-01T00:00:00Z",
				tags: [{ name: "kind", value: "fixture" }],
			},
			key: "Bearer re_owned_fixture",
		},
	]);
});

test("sender rejects non-SMTP transports without exposing credentials", async () => {
	const implementation = await import("./sender").catch(() => undefined);
	expect(implementation?.createEmailSender).toBeDefined();
	if (!implementation) return;
	expect(() =>
		implementation.createEmailSender({
			SMTP_URL: "https://private:secret@example.test",
		}),
	).toThrow("SMTP_URL must use smtp:// or smtps://");
});

test("SMTP rejects missing recipients in a later batch item before sending the first", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.batch.send([email, { ...email, to: [] }]);
	expect(result.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
});

test("SMTP fetches hosted HTTP attachments before batch delivery and reports failures", async () => {
	const smtp = await sink();
	const http = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			return new URL(request.url).pathname === "/ok"
				? new Response("hosted fixture")
				: new Response("missing", { status: 404 });
		},
	});
	cleanups.push(() => {
		http.stop(true);
	});
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.emails.send({
		...email,
		attachments: [{ filename: "hosted.txt", path: `${http.url}ok` }],
	});
	expect(result.error).toBeNull();
	expect(smtp.messages[0]?.mime).toContain("aG9zdGVkIGZpeHR1cmU=");
	const invalid = {
		...email,
		attachments: [{ filename: "missing.txt", path: `${http.url}missing` }],
	};
	const batch = await client.batch.send([email, invalid]);
	expect(batch.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(1);
});

test("SMTP rejects provider request options instead of silently ignoring idempotency", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.emails.send(email, { idempotencyKey: "fixture" });
	expect(result.error).toBeTruthy();
	const batch = await client.batch.send([email], {
		batchValidation: "permissive",
	});
	expect(batch.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
});

test("SMTP renders an existing invitation template into a complete MIME body", async () => {
	const previousUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
	process.env.NEXT_PUBLIC_MARKETING_URL = "http://marketing.example.test";
	cleanups.push(() => {
		if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_MARKETING_URL;
		else process.env.NEXT_PUBLIC_MARKETING_URL = previousUrl;
	});
	const { OrganizationInvitationEmail } = await import(
		"../emails/team/invitation"
	);
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.emails.send({
		...email,
		react: createElement(OrganizationInvitationEmail, {
			organizationName: "Owned Fixture",
			inviterName: "Fixture Inviter",
			inviterEmail: "inviter@example.test",
			inviteLink: "http://app.example.test/invite/owned-fixture",
			role: "member",
			inviteeName: "Fixture Recipient",
			expiresAt: new Date("2030-01-01T00:00:00Z"),
		}),
	});
	expect(result.error).toBeNull();
	const mime = smtp.messages[0]?.mime ?? "";
	expect(
		mime.replaceAll(/=\r\n/g, "").replaceAll(/<!--.*?-->/gs, ""),
	).toContain("Join Owned Fixture on Superset");
	expect(
		mime.replaceAll(/=\r\n/g, "").replaceAll(/<!--.*?-->/gs, ""),
	).toContain("http://app.example.test/invite/owned-fixture");
});

for (const mode of ["single", "batch"] as const) {
	test(`SMTP ${mode} reports recipient rejection after partial delivery`, async () => {
		const smtp = await sink(0, "rejected@example.test");
		const client = await sender({ SMTP_URL: smtp.url });
		const message = {
			...email,
			to: "rejected@example.test",
			cc: "accepted@example.test",
		};
		const result =
			mode === "single"
				? await client.emails.send(message)
				: await client.batch.send([message, email]);
		expect(result.error).toBeTruthy();
		expect(result.error?.message).toContain("partially delivered");
		expect(JSON.stringify(result)).not.toContain("rejected@example.test");
		expect(JSON.stringify(result)).not.toContain("recipient fixture");
		expect(smtp.messages).toHaveLength(1);
		expect(smtp.messages[0]?.envelope).toEqual([
			"MAIL FROM:<cloud@example.test>",
			"RCPT TO:<accepted@example.test>",
		]);
	});
}

for (const [field, invalid] of [
	["from", "not-an-email"],
	["to", "not-an-email"],
	["to", "valid@example.test, not-an-email"],
	["to", ["valid@example.test", "not-an-email"]],
	["cc", "not-an-email"],
	["bcc", ["valid@example.test", "not-an-email"]],
	["replyTo", "not-an-email"],
] as const) {
	test(`SMTP preflight rejects malformed ${field} before batch delivery (${JSON.stringify(invalid)})`, async () => {
		const smtp = await sink();
		const client = await sender({ SMTP_URL: smtp.url });
		const result = await client.batch.send([
			email,
			{ ...email, [field]: invalid },
		]);
		expect(result.error).toBeTruthy();
		expect(smtp.messages).toHaveLength(0);
		expect(smtp.commands).toHaveLength(0);
	});
}

test("SMTP preflight rejects malformed configured sender without a null envelope delivery", async () => {
	const smtp = await sink();
	const client = await sender({
		SMTP_URL: smtp.url,
		EMAIL_FROM: "not-an-email",
	});
	const result = await client.emails.send(email);
	expect(result.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
	expect(smtp.commands).toHaveLength(0);
});

test("SMTP preflight rejects a missing attachment source while explicit empty contents remain valid", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const missing = { ...email, attachments: [{ filename: "missing.txt" }] };
	const result = await client.batch.send([email, missing]);
	expect(result.error).toBeTruthy();
	expect(smtp.messages).toHaveLength(0);
	expect(smtp.commands).toHaveLength(0);
	const empty = await client.emails.send({
		...email,
		attachments: [
			{ filename: "empty-base64.txt", content: "" },
			{ filename: "empty-buffer.txt", content: Buffer.alloc(0) },
		],
	});
	expect(empty.error).toBeNull();
	expect(smtp.messages).toHaveLength(1);
});

test("SMTP rejects URLs without a host before choosing any transport target", async () => {
	const { createEmailSender } = await import("./sender");
	for (const SMTP_URL of ["smtp://", "smtp:///", "smtps://"])
		expect(() => createEmailSender({ SMTP_URL })).toThrow(
			"SMTP_URL must include a host",
		);
});

test("SMTP retains display names, comma-separated lists, Unicode and empty optional address fields", async () => {
	const smtp = await sink();
	const client = await sender({ SMTP_URL: smtp.url });
	const result = await client.emails.send({
		...email,
		from: '"Sender, Team" <sender@例子.测试>',
		to: [
			'"Recipient, One" <first@example.test>, Second <second@example.test>',
			"用户@例子.测试",
		],
		cc: "",
		bcc: [],
		replyTo: '"Reply, Team" <reply@example.test>',
	});
	expect(result.error).toBeNull();
	expect(smtp.messages[0]?.envelope).toEqual([
		"MAIL FROM:<sender@xn--fsqu00a.xn--0zwm56d>",
		"RCPT TO:<first@example.test>",
		"RCPT TO:<second@example.test>",
		"RCPT TO:<用户@例子.测试>",
	]);
	expect(smtp.messages[0]?.mime).toContain(
		'Reply-To: "Reply, Team" <reply@example.test>',
	);
});
