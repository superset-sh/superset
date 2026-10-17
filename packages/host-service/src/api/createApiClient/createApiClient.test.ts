import { expect, test } from "bun:test";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import SuperJSON from "superjson";
import { JwtApiAuthProvider } from "../../providers/auth/JwtAuthProvider";
import { createApiClient } from "./createApiClient";

test.each([
	"active",
	"unsignalled",
	"cancelled",
] as const)("batch authentication respects a second %s operation", async (secondOperation) => {
	let startAuth!: () => void;
	const authStarted = new Promise<void>((resolve) => {
		startAuth = resolve;
	});
	let releaseAuth!: () => void;
	const authReleased = new Promise<void>((resolve) => {
		releaseAuth = resolve;
	});
	let authSignal: AbortSignal | undefined;
	let tokenRequests = 0;
	let apiRequests = 0;
	let cancellationDeadline: ReturnType<typeof setTimeout> | undefined;
	const t = initTRPC.create({ transformer: SuperJSON });
	const router = t.router({
		host: t.router({
			relayEndpoint: t.procedure.query(() => ({ url: "http://relay.test" })),
		}),
	});
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			apiRequests++;
			return fetchRequestHandler({
				endpoint: "/api/trpc",
				req: request,
				router,
				createContext: () => ({}),
			});
		},
	});
	const apiUrl = `http://127.0.0.1:${server.port}`;
	const provider = new JwtApiAuthProvider({
		apiUrl,
		async getSessionToken(signal) {
			tokenRequests++;
			authSignal = signal;
			startAuth();
			await authReleased;
			return "fixture.jwt.token";
		},
	});
	const api = createApiClient(apiUrl, provider, "fixture-org");
	const first = new AbortController();
	const second = new AbortController();
	const results = Promise.allSettled([
		api.host.relayEndpoint.query(undefined, { signal: first.signal }),
		api.host.relayEndpoint.query(undefined, {
			signal: secondOperation === "unsignalled" ? undefined : second.signal,
		}),
	]);
	try {
		await authStarted;
		expect(authSignal).toBeDefined();
		first.abort();
		expect(authSignal?.aborted).toBe(false);
		if (secondOperation === "cancelled") second.abort();
		expect(authSignal?.aborted).toBe(secondOperation === "cancelled");
		if (secondOperation !== "cancelled") releaseAuth();
		const [firstResult, secondResult] = await Promise.race([
			results,
			new Promise<never>((_, reject) => {
				cancellationDeadline = setTimeout(
					() => reject(new Error("Batch authentication did not settle")),
					500,
				);
			}),
		]);
		if (secondOperation === "cancelled") {
			expect(firstResult.status).toBe("rejected");
			expect(secondResult.status).toBe("rejected");
			expect(apiRequests).toBe(0);
		} else {
			expect(secondResult).toEqual({
				status: "fulfilled",
				value: { url: "http://relay.test" },
			});
			expect(apiRequests).toBe(1);
		}
		expect(tokenRequests).toBe(1);
	} finally {
		clearTimeout(cancellationDeadline);
		first.abort();
		second.abort();
		releaseAuth();
		await results;
		await server.stop(true);
	}
});
