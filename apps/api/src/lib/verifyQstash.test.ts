import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import * as queueModule from "@superset/shared/self-host-queue";
import { Client } from "@upstash/qstash";

const secret = "owned-native-consumer-secret-0123456789";
const currentKey = "owned-current-qstash-signing-key";
const nextKey = "owned-next-qstash-signing-key";
const fixtureEnv = {
	NODE_ENV: "production",
	NEXT_PUBLIC_API_URL: "https://api.example.test",
	QSTASH_CURRENT_SIGNING_KEY: currentKey,
	QSTASH_NEXT_SIGNING_KEY: nextKey,
};
mock.module("@/env", () => ({ env: fixtureEnv }));
const { verifyQstashRequest } = await import("./verifyQstash");
const originals = {
	flag: process.env.SELF_HOST_QUEUE,
	secret: process.env.SELF_HOST_QUEUE_SECRET,
};
afterEach(() => {
	for (const [name, value] of Object.entries({
		SELF_HOST_QUEUE: originals.flag,
		SELF_HOST_QUEUE_SECRET: originals.secret,
	})) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	fixtureEnv.NODE_ENV = "production";
});
function signature(body: string, path: string, key = currentKey) {
	const header = Buffer.from(
		JSON.stringify({ alg: "HS256", typ: "JWT" }),
	).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			iss: "Upstash",
			sub: `${fixtureEnv.NEXT_PUBLIC_API_URL}${path}`,
			body: createHash("sha256").update(body).digest("base64url"),
			exp: Math.floor(Date.now() / 1000) + 60,
		}),
	).toString("base64url");
	const input = `${header}.${payload}`;
	return `${input}.${createHmac("sha256", key).update(input).digest("base64url")}`;
}
test("native consumer authentication precedes the development bypass and refuses forged or cloud-only credentials", async () => {
	process.env.SELF_HOST_QUEUE = "1";
	process.env.SELF_HOST_QUEUE_SECRET = secret;
	fixtureEnv.NODE_ENV = "development";
	const path = "/api/ingest/jobs/enforce-retention",
		body = '{"owned":true}';
	for (const headers of [
		new Headers(),
		new Headers({ "x-self-host-queue": "forged" }),
		new Headers({ "upstash-signature": signature(body, path) }),
	]) {
		const rejected = await verifyQstashRequest(
			new Request(`http://internal${path}`, { headers }),
			body,
			path,
		);
		expect(rejected?.status).toBe(401);
	}
	expect(
		await verifyQstashRequest(
			new Request(`http://internal${path}`, {
				headers: { "x-self-host-queue": secret },
			}),
			body,
			path,
		),
	).toBeNull();
	process.env.SELF_HOST_QUEUE_SECRET = "short";
	expect(
		(
			await verifyQstashRequest(
				new Request(`http://internal${path}`, {
					headers: { "x-self-host-queue": "short" },
				}),
				body,
				path,
			)
		)?.status,
	).toBe(401);
});
test("cloud consumers retain genuine current and next key, exact URL and body verification and existing development bypass", async () => {
	process.env.SELF_HOST_QUEUE = "0";
	process.env.SELF_HOST_QUEUE_SECRET = secret;
	const path = "/api/files/jobs/sweep",
		body = '{"owned":true}';
	const logging = spyOn(console, "error").mockImplementation(() => {});
	try {
		for (const key of [currentKey, nextKey])
			expect(
				await verifyQstashRequest(
					new Request(`http://internal${path}`, {
						headers: { "upstash-signature": signature(body, path, key) },
					}),
					body,
					path,
				),
			).toBeNull();
		for (const [headers, changedBody, changedPath] of [
			[new Headers({ "x-self-host-queue": secret }), body, path],
			[
				new Headers({ "upstash-signature": signature(body, path) }),
				'{"changed":true}',
				path,
			],
			[
				new Headers({ "upstash-signature": signature(body, path) }),
				body,
				"/api/account/jobs/purge-expired-deletions",
			],
		] as const)
			expect(
				(
					await verifyQstashRequest(
						new Request("http://internal/owned", { headers }),
						changedBody,
						changedPath,
					)
				)?.status,
			).toBe(401);
		fixtureEnv.NODE_ENV = "development";
		expect(
			await verifyQstashRequest(
				new Request("http://internal/owned"),
				body,
				path,
			),
		).toBeNull();
	} finally {
		logging.mockRestore();
	}
});
test("cloud queue factory returns the genuine SDK and preserves supplied token, base URL and publication body", async () => {
	process.env.SELF_HOST_QUEUE = "0";
	const requests: { url: string; headers: Headers; body: string }[] = [];
	const network = spyOn(globalThis, "fetch").mockImplementation(
		async (input, init) => {
			requests.push({
				url: String(input),
				headers: new Headers(init?.headers),
				body: String(init?.body),
			});
			return Response.json({ messageId: "owned-cloud" });
		},
	);
	try {
		const client = new Client({
			token: "owned-qstash-token",
			baseUrl: "https://qstash.example.test",
		});
		const selected = queueModule.createJobQueue(() => client);
		expect(selected).toBe(client);
		expect(selected).toBeInstanceOf(Client);
		await selected.publishJSON({
			url: "https://api.example.test/api/automations/evaluate",
			body: { owned: true },
			delay: 7,
			retries: 2,
			deduplicationId: "owned-key",
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toContain("https://qstash.example.test/");
		expect(requests[0]?.headers.get("authorization")).toBe(
			"Bearer owned-qstash-token",
		);
		expect(requests[0]?.body).toBe('{"owned":true}');
	} finally {
		network.mockRestore();
	}
});
