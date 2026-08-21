import { describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import { createTRPCUntypedClient, type TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import {
	createHostServiceQueryMethodPolicy,
	createHostServiceTransportLinks,
	type HostServiceFetch,
} from "./hostTransport";

function methodNotSupportedError(
	overrides: { code?: string; httpStatus?: number } = {},
): TRPCClientError<AppRouter> {
	return {
		data: {
			code: overrides.code ?? "METHOD_NOT_SUPPORTED",
			httpStatus: overrides.httpStatus ?? 405,
		},
	} as TRPCClientError<AppRouter>;
}

function trpcErrorResponse(
	code: string,
	httpStatus: number,
): Awaited<ReturnType<HostServiceFetch>> {
	return Response.json(
		{
			error: superjson.serialize({
				code: -32000,
				message: code,
				data: { code, httpStatus },
			}),
		},
		{ status: httpStatus },
	) as unknown as Awaited<ReturnType<HostServiceFetch>>;
}

describe("createHostServiceQueryMethodPolicy", () => {
	test("preserves POST queries for capable remote hosts", () => {
		const policy = createHostServiceQueryMethodPolicy();

		expect(policy.getMethodOverride()).toBe("POST");
		expect(
			policy.retryWithoutMethodOverride({
				attempts: 1,
				error: methodNotSupportedError({ code: "NOT_FOUND", httpStatus: 404 }),
				op: { type: "query" },
			}),
		).toBe(false);
		expect(policy.getMethodOverride()).toBe("POST");
	});

	test("retries an old host's rejected POST query with GET", () => {
		const policy = createHostServiceQueryMethodPolicy();

		expect(
			policy.retryWithoutMethodOverride({
				attempts: 1,
				error: methodNotSupportedError(),
				op: { type: "query" },
			}),
		).toBe(true);
		expect(policy.getMethodOverride()).toBeUndefined();
	});

	test("does not retry mutations or repeat a fallback", () => {
		const mutationPolicy = createHostServiceQueryMethodPolicy();
		expect(
			mutationPolicy.retryWithoutMethodOverride({
				attempts: 1,
				error: methodNotSupportedError(),
				op: { type: "mutation" },
			}),
		).toBe(false);
		expect(mutationPolicy.getMethodOverride()).toBe("POST");

		const retriedQueryPolicy = createHostServiceQueryMethodPolicy();
		expect(
			retriedQueryPolicy.retryWithoutMethodOverride({
				attempts: 2,
				error: methodNotSupportedError(),
				op: { type: "query" },
			}),
		).toBe(false);
		expect(retriedQueryPolicy.getMethodOverride()).toBe("POST");
	});

	test("requires both the method error code and HTTP 405", () => {
		for (const error of [
			methodNotSupportedError({ code: "BAD_REQUEST" }),
			methodNotSupportedError({ httpStatus: 500 }),
		]) {
			const policy = createHostServiceQueryMethodPolicy();
			expect(
				policy.retryWithoutMethodOverride({
					attempts: 1,
					error,
					op: { type: "query" },
				}),
			).toBe(false);
			expect(policy.getMethodOverride()).toBe("POST");
		}
	});
});

describe("createHostServiceTransportLinks", () => {
	test("retries a rejected POST query as GET", async () => {
		const methods: string[] = [];
		const fetch: HostServiceFetch = async (_url, options) => {
			methods.push(options?.method ?? "GET");
			return methods.length === 1
				? trpcErrorResponse("METHOD_NOT_SUPPORTED", 405)
				: trpcErrorResponse("NOT_FOUND", 404);
		};
		const client = createTRPCUntypedClient({
			links: createHostServiceTransportLinks({
				fetch,
				hostUrl: "https://relay2.superset.sh/hosts/org:old-host",
			}),
		});

		await expect(client.query("health.check")).rejects.toThrow("NOT_FOUND");
		expect(methods).toEqual(["POST", "GET"]);
	});

	test("keeps POST after a capable host returns an application error", async () => {
		const methods: string[] = [];
		const fetch: HostServiceFetch = async (_url, options) => {
			methods.push(options?.method ?? "GET");
			return trpcErrorResponse("NOT_FOUND", 404);
		};
		const client = createTRPCUntypedClient({
			links: createHostServiceTransportLinks({
				fetch,
				hostUrl: "https://relay2.superset.sh/hosts/org:current-host",
			}),
		});

		await expect(client.query("health.check")).rejects.toThrow("NOT_FOUND");
		await expect(client.query("health.check")).rejects.toThrow("NOT_FOUND");
		expect(methods).toEqual(["POST", "POST"]);
	});
});
