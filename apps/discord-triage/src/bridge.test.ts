import { describe, expect, test } from "bun:test";

process.env.DISCORD_BOT_TOKEN ??= "test";
process.env.DISCORD_CHANNEL_IDS ??= "1";
process.env.LINEAR_FILING_ENABLED = "false";

const { replyText } = await import("./bridge");
const { verifyWebhook } = await import("./resend");
const { store } = await import("./store");

describe("replyText", () => {
	test("drops the quoted history under an 'On ... wrote:' line", () => {
		const text =
			"Thanks, try restarting the host.\n\nOn Sat, 22 Aug 2026 at 17:38, Discord Bridge Test <x@y> wrote:\n\n> original report\n";
		expect(replyText(text)).toBe("Thanks, try restarting the host.");
	});

	test("drops a trailing block of quoted lines", () => {
		expect(replyText("Reply here\n\n> quoted\n> more\n")).toBe("Reply here");
	});

	test("keeps a quote that is followed by more reply text", () => {
		const text = "> you said X\n\nYes, and also Y.";
		expect(replyText(text)).toBe(text);
	});
});

describe("verifyWebhook", () => {
	const secret = `whsec_${Buffer.from("topsecret").toString("base64")}`;
	const body = '{"type":"email.received"}';
	const sign = (id: string, ts: string) =>
		new Bun.CryptoHasher("sha256", Buffer.from("topsecret"))
			.update(`${id}.${ts}.${body}`)
			.digest("base64");

	test("accepts a valid svix signature", () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const headers = new Headers({
			"svix-id": "msg_1",
			"svix-timestamp": ts,
			"svix-signature": `v1,${sign("msg_1", ts)}`,
		});
		expect(verifyWebhook(headers, body, secret)).toBe(true);
	});

	test("rejects a tampered body and a stale timestamp", () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const headers = new Headers({
			"svix-id": "msg_1",
			"svix-timestamp": ts,
			"svix-signature": `v1,${sign("msg_1", ts)}`,
		});
		expect(verifyWebhook(headers, `${body} `, secret)).toBe(false);
		const old = String(Math.floor(Date.now() / 1000) - 3600);
		const stale = new Headers({
			"svix-id": "msg_1",
			"svix-timestamp": old,
			"svix-signature": `v1,${sign("msg_1", old)}`,
		});
		expect(verifyWebhook(stale, body, secret)).toBe(false);
	});
});

describe("store", () => {
	test("maps every known Message-ID back to its Discord thread", () => {
		store.createThread({
			discordThreadId: "t1",
			discordUserId: "u1",
			subject: "App crashes on launch",
			rootMessageId: "<root@ses>",
			lastMessageId: "<root@ses>",
		});
		store.rememberMessageId("<plain-reply@mtasv.net>", "t1");
		expect(store.getThread("t1")?.lastMessageId).toBe(
			"<plain-reply@mtasv.net>",
		);
		expect(
			store.findThreadByMessageIds(["<unknown>", "<plain-reply@mtasv.net>"])
				?.discordThreadId,
		).toBe("t1");
		expect(store.markInboundProcessed("e1")).toBe(true);
		expect(store.markInboundProcessed("e1")).toBe(false);
		store.unmarkInboundProcessed("e1");
		expect(store.markInboundProcessed("e1")).toBe(true);
	});
});
