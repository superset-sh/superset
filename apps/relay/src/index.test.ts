/// <reference types="bun" />
import { afterAll, beforeEach, expect, test } from "bun:test";
import relay from "./index";

type ProxiedRequest = { method: string; pathWithQuery: string };

const proxied: ProxiedRequest[] = [];

const tunnel = {
	setName: async () => {},
	proxyHttp: async (_caller: unknown, request: ProxiedRequest) => {
		proxied.push({
			method: request.method,
			pathWithQuery: request.pathWithQuery,
		});
		return {
			ok: true,
			status: 200,
			headers: { "content-type": "application/json" },
			body: new TextEncoder().encode("{}"),
		};
	},
};

const keyPair = await crypto.subtle.generateKey(
	{
		name: "RSASSA-PKCS1-v1_5",
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: "SHA-256",
	},
	true,
	["sign", "verify"],
);
const jwk = {
	...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)),
	kid: "test",
	alg: "RS256",
};
const jwks = Bun.serve({
	port: 0,
	fetch: () => Response.json({ keys: [jwk] }),
});
const apiUrl = `http://localhost:${jwks.port}`;

afterAll(() => jwks.stop(true));

beforeEach(() => {
	proxied.length = 0;
});

const hostId = "org-1:machine-1";
const env = {
	NEXT_PUBLIC_API_URL: apiUrl,
	HostTunnel: {
		idFromName: (name: string) => name,
		get: () => tunnel,
	},
	PLACEMENT: {
		get: async () => ({
			name: `${hostId}#1`,
			generation: 1,
			continent: "EU",
			colo: "AMS",
		}),
	},
};
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

function base64url(data: string | ArrayBuffer): string {
	return Buffer.from(
		typeof data === "string" ? data : new Uint8Array(data),
	).toString("base64url");
}

async function token(): Promise<string> {
	const header = base64url(JSON.stringify({ alg: "RS256", kid: "test" }));
	const payload = base64url(
		JSON.stringify({
			sub: "user-1",
			organizationIds: ["org-1"],
			iss: apiUrl,
			aud: apiUrl,
			exp: Math.floor(Date.now() / 1000) + 300,
		}),
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		keyPair.privateKey,
		new TextEncoder().encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${base64url(signature)}`;
}

const handler = relay as unknown as {
	fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>;
};

async function call(
	path: string,
	init: Omit<RequestInit, "headers"> & {
		authorized?: boolean;
		host?: string;
		headers?: Record<string, string>;
	} = {},
) {
	const { authorized = true, host = hostId, ...requestInit } = init;
	const headers = authorized
		? { ...requestInit.headers, Authorization: `Bearer ${await token()}` }
		: requestInit.headers;
	return handler.fetch(
		new Request(`https://relay.test/hosts/${host}${path}`, {
			...requestInit,
			headers,
		}),
		env,
		ctx,
	);
}

test("forwards chat-v3 tRPC POST and GET calls to the host", async () => {
	const post = await call("/chat-v3/trpc/prompt", {
		method: "POST",
		body: JSON.stringify({ sessionId: "s1" }),
	});
	const get = await call("/chat-v3/trpc/listSessions?input=%7B%7D");

	expect(post.status).toBe(200);
	expect(get.status).toBe(200);
	expect(proxied).toEqual([
		{ method: "POST", pathWithQuery: "/chat-v3/trpc/prompt" },
		{ method: "GET", pathWithQuery: "/chat-v3/trpc/listSessions?input=%7B%7D" },
	]);
});

test("still forwards the host tRPC router", async () => {
	const response = await call("/trpc/workspace.list", { method: "POST" });

	expect(response.status).toBe(200);
	expect(proxied).toEqual([
		{ method: "POST", pathWithQuery: "/trpc/workspace.list" },
	]);
});

test("does not forward HTTP to host paths outside the tRPC routers", async () => {
	const post = await call("/chat-v3/sessions/s1/stream", { method: "POST" });
	const get = await call("/chat-v3/sessions/s1/stream");

	expect(post.status).toBe(404);
	expect(get.status).toBe(426);
	expect(proxied).toEqual([]);
});

test("rejects an unauthenticated chat-v3 call with a plain-JSON tRPC error", async () => {
	const response = await call("/chat-v3/trpc/prompt", {
		method: "POST",
		authorized: false,
	});

	expect(response.status).toBe(401);
	expect(await response.json()).toEqual({
		error: {
			message: "Unauthorized",
			code: -32001,
			data: { code: "UNAUTHORIZED", httpStatus: 401 },
		},
	});
	expect(proxied).toEqual([]);
});

test("rejects a stream path that a percent-encoded host id leaks into", async () => {
	const response = await call("/chat-v3/sessions/s1/stream", {
		host: encodeURIComponent(hostId),
		headers: { Upgrade: "websocket" },
	});

	expect(response.status).toBe(400);
});
