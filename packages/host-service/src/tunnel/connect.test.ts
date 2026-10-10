import { expect, test } from "bun:test";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import SuperJSON from "superjson";
import { z } from "zod";
import { createApiClient } from "../api";
import { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider";
import { connectRelay } from "./connect";
import type { TunnelClient } from "./tunnel-client";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function withinTestDeadline<T>(promise: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Startup stalled")), 500);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function createFixture(stall: "registration" | "relay" | "auth") {
	const stalled = deferred<void>();
	const release = deferred<void>();
	const connected = deferred<void>();
	const tokenAborted = deferred<void>();
	const controller = new AbortController();
	let registrations = 0;
	let tokenRequests = 0;
	let tunnel: TunnelClient | null = null;
	const relay = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request, server) {
			const url = new URL(request.url);
			expect(url.pathname).toBe("/v2/control");
			expect(url.searchParams.get("token")).toBe("fixture.jwt.token");
			if (server.upgrade(request)) return;
			return new Response("Expected WebSocket", { status: 400 });
		},
		websocket: {
			open() {
				connected.resolve();
			},
			message() {},
		},
	});
	const relayUrl = `http://127.0.0.1:${relay.port}`;
	const t = initTRPC.create({ transformer: SuperJSON });
	const router = t.router({
		host: t.router({
			ensure: t.procedure
				.input(z.object({ machineId: z.string() }))
				.mutation(async ({ input }) => {
					registrations++;
					if (stall === "registration" && registrations === 1) {
						stalled.resolve();
						await release.promise;
					}
					return { machineId: input.machineId };
				}),
			relayEndpoint: t.procedure.query(async () => {
				if (stall === "relay") {
					stalled.resolve();
					await release.promise;
				}
				return { url: relayUrl };
			}),
		}),
	});
	const apiServer = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			if (new URL(request.url).pathname === "/api/auth/token") {
				tokenRequests++;
				if (tokenRequests === 1) {
					request.signal.addEventListener(
						"abort",
						() => tokenAborted.resolve(),
						{
							once: true,
						},
					);
					stalled.resolve();
					await release.promise;
				}
				return Response.json({ token: "fixture.jwt.token" });
			}
			return fetchRequestHandler({
				endpoint: "/api/trpc",
				req: request,
				router,
				createContext: () => ({}),
			});
		},
	});
	const apiUrl = `http://127.0.0.1:${apiServer.port}`;
	const authProvider = new JwtApiAuthProvider({
		apiUrl,
		getSessionToken: async () =>
			stall === "auth" ? "fixture-session-token" : "fixture.jwt.token",
	});
	const startup = connectRelay({
		api: createApiClient(apiUrl, authProvider, "fixture-org"),
		relayUrl: stall === "relay" ? relayUrl : "http://127.0.0.1:0",
		localPort: 0,
		organizationId: "fixture-org",
		authProvider,
		hostServiceSecret: "fixture-secret",
		signal: controller.signal,
		requestTimeoutMs: 100,
		retryBaseDelayMs: 1,
	}).then((client) => {
		tunnel = client;
		return client;
	});
	return {
		stalled: stalled.promise,
		connected: connected.promise,
		tokenAborted: tokenAborted.promise,
		startup,
		controller,
		get registrations() {
			return registrations;
		},
		get tokenRequests() {
			return tokenRequests;
		},
		async close() {
			controller.abort();
			release.resolve();
			await startup;
			tunnel?.close();
			await apiServer.stop(true);
			await relay.stop(true);
		},
	};
}

test("retries a stalled registration before starting the relay", async () => {
	const fixture = createFixture("registration");
	try {
		await withinTestDeadline(fixture.connected);
		expect(await fixture.startup).not.toBeNull();
		expect(fixture.registrations).toBe(2);
	} finally {
		await fixture.close();
	}
});

test("uses the fallback relay when the initial endpoint lookup stalls", async () => {
	const fixture = createFixture("relay");
	try {
		await withinTestDeadline(fixture.connected);
		expect(await fixture.startup).not.toBeNull();
		expect(fixture.registrations).toBe(1);
	} finally {
		await fixture.close();
	}
});

test("retries when authentication stalls before the registration fetch", async () => {
	const fixture = createFixture("auth");
	try {
		await withinTestDeadline(fixture.connected);
		expect(await fixture.startup).not.toBeNull();
		expect(fixture.tokenRequests).toBe(2);
		expect(fixture.registrations).toBe(1);
		await withinTestDeadline(fixture.tokenAborted);
	} finally {
		await fixture.close();
	}
});

test("shutdown cancels authentication before the registration fetch", async () => {
	const fixture = createFixture("auth");
	try {
		await withinTestDeadline(fixture.stalled);
		fixture.controller.abort();
		expect(await withinTestDeadline(fixture.startup)).toBeNull();
		await withinTestDeadline(fixture.tokenAborted);
		expect(fixture.registrations).toBe(0);
	} finally {
		await fixture.close();
	}
});

test("shutdown interrupts an initial relay lookup without starting a tunnel", async () => {
	const fixture = createFixture("relay");
	try {
		await withinTestDeadline(fixture.stalled);
		fixture.controller.abort();
		expect(await withinTestDeadline(fixture.startup)).toBeNull();
		expect(fixture.registrations).toBe(1);
	} finally {
		await fixture.close();
	}
});
