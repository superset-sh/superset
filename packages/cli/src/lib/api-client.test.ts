import { afterAll, describe, expect, test } from "bun:test";
import { ApiHttpError, fetchRejectingNonJsonErrors } from "./api-client";

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
