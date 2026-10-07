import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";

const secret = "owned-google-queue-secret-0123456789";
const connectionId = "11111111-1111-4111-8111-111111111111";
const fixtureEnv = {
	NODE_ENV: "development",
	NEXT_PUBLIC_API_URL: "https://api.example.test",
	NEXT_PUBLIC_WEB_URL: "https://web.example.test",
	GOOGLE_CLIENT_ID: "owned-fake-id",
	GOOGLE_CLIENT_SECRET: "owned-fake-secret",
	QSTASH_TOKEN: "owned-cloud-token",
	QSTASH_URL: "https://qstash.example.test",
};
const originalEnv = {
	SELF_HOST_QUEUE: process.env.SELF_HOST_QUEUE,
	SELF_HOST_QUEUE_URL: process.env.SELF_HOST_QUEUE_URL,
	SELF_HOST_QUEUE_SECRET: process.env.SELF_HOST_QUEUE_SECRET,
};
process.env.SELF_HOST_QUEUE = "1";
process.env.SELF_HOST_QUEUE_URL = "http://queue.example.test";
process.env.SELF_HOST_QUEUE_SECRET = secret;
mock.module("@/env", () => ({ env: fixtureEnv }));
mock.module("@superset/db/client", () => ({
	db: { delete: () => ({ where: async () => {} }) },
}));
const connected = mock(async () => ({ connectionId, conflict: false }));
mock.module("@superset/trpc/connectors", () => ({
	requireConnector: () => ({}),
	connectorMethod: () => ({ type: "oauth2" }),
	upsertConnection: connected,
}));
const tokens = {
	access_token: "owned-fake-access",
	refresh_token: "owned-fake-refresh",
	expires_in: 3600,
	scope: "https://www.googleapis.com/auth/gmail.readonly",
};
mock.module("@superset/trpc/integrations/google", () => ({
	googleTokenResponseSchema: {
		safeParse: () => ({ success: true, data: tokens }),
	},
}));
mock.module("@/lib/integrations/oauthFlow", () => ({
	STATE_COOKIES: { google: "owned-fake-cookie" },
}));
mock.module("@/lib/integrations/resolveCallback", () => ({
	resolveCallback: async () => ({
		organizationId: "owned-org",
		userId: "owned-user",
		params: { code: "owned-fake-code" },
		exit: (url: string) => Response.redirect(url),
		fail: (error: string) => Response.json({ error }, { status: 400 }),
	}),
}));
mock.module("@/lib/integrations/upsertIdentity", () => ({
	upsertIdentity: async () => {},
}));
const { GET } = await import("./route");
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
	fixtureEnv.NODE_ENV = "development";
	process.env.SELF_HOST_QUEUE = "1";
	connected.mockClear();
});
afterAll(() => {
	for (const [name, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
function request() {
	return new Request(
		"https://api.example.test/api/integrations/google/callback?code=owned-fake-code",
	);
}
function network() {
	const calls: { url: string; headers: Headers; body: string }[] = [];
	const original = globalThis.fetch;
	const spy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				const url = String(input);
				calls.push({
					url,
					headers: new Headers(init?.headers),
					body: String(init?.body),
				});
				if (url === "https://oauth2.googleapis.com/token")
					return Response.json(tokens);
				if (url === "https://openidconnect.googleapis.com/v1/userinfo")
					return Response.json({
						sub: "owned-subject",
						email: "owned@example.test",
					});
				return Response.json({ messageId: "stored" }, { status: 202 });
			},
			original,
		),
	);
	cleanup.push(() => spy.mockRestore());
	return calls;
}
test("native Google callback durably queues initial watch setup ahead of the development shortcut", async () => {
	const calls = network();
	expect((await GET(request())).status).toBe(302);
	expect(connected).toHaveBeenCalledTimes(1);
	const publications = calls.slice(2);
	expect(publications).toHaveLength(1);
	expect(publications[0]?.url).toBe("http://queue.example.test/jobs");
	expect(publications[0]?.headers.get("x-self-host-queue")).toBe(secret);
	expect(JSON.parse(publications[0]?.body ?? "null")).toEqual({
		url: "https://api.example.test/api/integrations/google/jobs/renew-watches",
		body: { connectionId },
		retries: 3,
	});
});
test("cloud Google development retains its direct unsigned watch setup request", async () => {
	process.env.SELF_HOST_QUEUE = "0";
	const calls = network();
	expect((await GET(request())).status).toBe(302);
	expect(calls.slice(2)).toHaveLength(1);
	expect(calls[2]?.url).toBe(
		"https://api.example.test/api/integrations/google/jobs/renew-watches",
	);
	expect(calls[2]?.headers.get("x-self-host-queue")).toBeNull();
	expect(JSON.parse(calls[2]?.body ?? "null")).toEqual({ connectionId });
});
test("cloud Google production keeps the genuine SDK constructor and watch setup retry options", async () => {
	process.env.SELF_HOST_QUEUE = "0";
	fixtureEnv.NODE_ENV = "production";
	const calls = network();
	const modulePath = `${import.meta.dir}/route.ts?cloud-watch-control`;
	const cloud: typeof import("./route") = await import(modulePath);
	expect((await cloud.GET(request())).status).toBe(302);
	expect(calls.slice(2)).toHaveLength(1);
	expect(calls[2]?.url).toBe(
		"https://qstash.example.test/v2/publish/https://api.example.test/api/integrations/google/jobs/renew-watches",
	);
	expect(calls[2]?.headers.get("authorization")).toBe(
		"Bearer owned-cloud-token",
	);
	expect(calls[2]?.headers.get("upstash-retries")).toBe("3");
	expect(JSON.parse(calls[2]?.body ?? "null")).toEqual({ connectionId });
});
