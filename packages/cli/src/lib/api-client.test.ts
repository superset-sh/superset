import { afterAll, describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import { TRPCClientError } from "@trpc/client";
import { formatError } from "../../../cli-framework/src/runner";
import {
	ApiHttpError,
	createApiClient,
	fetchRejectingNonJsonErrors,
} from "./api-client";
import { env } from "./env";

let respond: () => Response = () => new Response("");
const server = Bun.serve({ port: 0, fetch: () => respond() });
const url = `http://localhost:${server.port}/api/trpc`;

afterAll(() => server.stop(true));

describe("fetchRejectingNonJsonErrors", () => {
	test("turns Vercel's 413 page into an error carrying status and body", async () => {
		respond = () =>
			new Response(
				"Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nsfo1::abc-123",
				{ status: 413, statusText: "Request Entity Too Large" },
			);

		const error: unknown = await fetchRejectingNonJsonErrors(url).catch(
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ApiHttpError);
		const httpError = error as ApiHttpError;
		expect(httpError.status).toBe(413);
		expect(httpError.body).toBe(
			"Request Entity Too Large / FUNCTION_PAYLOAD_TOO_LARGE / sfo1::abc-123",
		);
		expect(httpError.message).toContain("HTTP 413");
	});

	test("leaves JSON error responses to tRPC", async () => {
		respond = () =>
			new Response(JSON.stringify([{ error: { json: { message: "nope" } } }]), {
				status: 400,
				headers: { "content-type": "application/json" },
			});

		const response = await fetchRejectingNonJsonErrors(url);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual([
			{ error: { json: { message: "nope" } } },
		]);
	});

	test("passes successful responses through untouched", async () => {
		respond = () => new Response("ok", { status: 200 });

		const response = await fetchRejectingNonJsonErrors(url);

		expect(await response.text()).toBe("ok");
	});
});

const originalApiUrl = env.SUPERSET_API_URL;
afterAll(() => {
	env.SUPERSET_API_URL = originalApiUrl;
});

async function queryError(): Promise<TRPCClientError<AppRouter>> {
	env.SUPERSET_API_URL = `http://localhost:${server.port}`;
	const api = createApiClient({ bearer: "fake-stale-token" });
	const error: unknown = await api.user.me
		.query()
		.catch((error: unknown) => error);
	expect(error).toBeInstanceOf(TRPCClientError);
	return error as TRPCClientError<AppRouter>;
}

function nativeError(code: string, httpStatus: number, message: string) {
	return Response.json(
		[
			{
				error: {
					json: {
						code: code === "FORBIDDEN" ? -32003 : -32001,
						message,
						data: { code, httpStatus, path: "user.me" },
					},
				},
			},
		],
		{ status: httpStatus },
	);
}

describe("API HTTP errors through the CLI formatter", () => {
	test.each([
		[
			"plain JSON",
			() => Response.json({ error: "Unauthorized" }, { status: 401 }),
		],
		["non-JSON", () => new Response("Unauthorized", { status: 401 })],
	] as const)("formats a %s 401 as an expired session", async (_, response) => {
		respond = response;
		expect(formatError(await queryError(), "superset")).toEqual({
			message: "Session expired",
			hint: "Run: superset auth login",
		});
	});

	test("preserves native tRPC unauthorized errors", async () => {
		respond = () => nativeError("UNAUTHORIZED", 401, "Token revoked");
		const error = await queryError();
		expect(error.message).toBe("Token revoked");
		expect(error.data).toMatchObject({
			code: "UNAUTHORIZED",
			httpStatus: 401,
			path: "user.me",
		});
		expect(formatError(error, "superset")).toEqual({
			message: "Session expired",
			hint: "Run: superset auth login",
		});
	});

	test("preserves native tRPC non-auth errors", async () => {
		respond = () => nativeError("FORBIDDEN", 403, "Not a member");
		const error = await queryError();
		expect(error.data?.code).toBe("FORBIDDEN");
		expect(formatError(error, "superset")).toEqual({ message: "Not a member" });
	});

	test("prefers native tRPC codes over the HTTP status", async () => {
		respond = () => nativeError("FORBIDDEN", 401, "Not a member");
		expect(formatError(await queryError(), "superset")).toEqual({
			message: "Not a member",
		});
	});

	test("preserves non-401 JSON transformation errors", async () => {
		respond = () => Response.json({ error: "Bad gateway" }, { status: 502 });
		expect(formatError(await queryError(), "superset")).toEqual({
			message: "Unable to transform response from server",
		});
	});

	test("preserves non-401 HTTP status and body", async () => {
		respond = () =>
			new Response("Gateway unavailable", {
				status: 502,
				statusText: "Bad Gateway",
			});
		const error = await queryError();
		expect(error.cause).toBeInstanceOf(ApiHttpError);
		expect(formatError(error, "superset")).toEqual({
			message: "HTTP 502 Bad Gateway: Gateway unavailable",
		});
	});

	test("deserializes successful tRPC responses", async () => {
		respond = () =>
			Response.json([{ result: { data: { json: { id: "test-user" } } } }]);
		env.SUPERSET_API_URL = `http://localhost:${server.port}`;
		const api = createApiClient({ bearer: "fake-stale-token" });
		expect((await api.user.me.query()).id).toBe("test-user");
	});
});
