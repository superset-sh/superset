import { describe, expect, test } from "bun:test";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { appRouter } from "../../src/trpc/router/router";

/**
 * Reproduction for https://github.com/superset-sh/superset/issues/5850
 *
 * "Open in App" (sidebar button or CMD+O) fails with:
 *   Failed to open: No procedure found on path "external.openInApp"
 *
 * The desktop exposes an `external` tRPC router (with `openInApp`,
 * `openInFinder`, `openFileInEditor`, …) on the *local Electron main* IPC
 * transport. The host-service exposes a *separate* tRPC router over HTTP
 * (`/trpc/*`, served by `@hono/trpc-server` → `fetchRequestHandler`), and that
 * router has no `external` namespace at all.
 *
 * The two transports produce different not-found messages:
 *   - Electron IPC (`callProcedure`): `No "mutation"-procedure on path "…"`
 *   - HTTP  (`resolveResponse`)      : `No procedure found on path "…"`
 *
 * The reporter's error text is the *HTTP* variant, which proves the
 * `external.openInApp` call reached the host-service router rather than the
 * local Electron router that actually implements it. These tests lock in that
 * behavior: a request routed to the host-service for `external.openInApp`
 * reproduces the exact reported error, while a real host-service procedure
 * resolves normally (positive control confirming the router is served).
 */

const ENDPOINT = "/trpc";

async function callHostService(
	path: string,
	input: unknown,
	method: "GET" | "POST",
) {
	const serialized = superjson.serialize(input);
	const batchInput = encodeURIComponent(JSON.stringify({ 0: serialized }));
	const url = `http://127.0.0.1${ENDPOINT}/${path}?batch=1&input=${batchInput}`;
	const req =
		method === "GET"
			? new Request(url, { method })
			: new Request(url, {
					method,
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ 0: serialized }),
				});
	const res = await fetchRequestHandler({
		endpoint: ENDPOINT,
		req,
		router: appRouter,
		// `external.openInApp` fails at path resolution before context is used,
		// and `health.check` ignores context, so an empty context is sufficient.
		createContext: () => ({}) as never,
	});
	const body = (await res.json()) as Array<{
		result?: { data?: { json?: unknown } };
		error?: { json?: { message?: string; data?: { code?: string } } };
	}>;
	return { status: res.status, entry: body[0] };
}

describe("host-service tRPC: external.openInApp routing (issue #5850)", () => {
	test('reproduces: "No procedure found on path \\"external.openInApp\\""', async () => {
		const { status, entry } = await callHostService(
			"external.openInApp",
			{ path: "/some/worktree", app: "intellij" },
			"POST",
		);

		expect(status).toBe(404);
		expect(entry.error?.json?.message).toBe(
			'No procedure found on path "external.openInApp"',
		);
		expect(entry.error?.json?.data?.code).toBe("NOT_FOUND");
	});

	test("positive control: a real host-service procedure resolves", async () => {
		const { status, entry } = await callHostService(
			"health.check",
			undefined,
			"GET",
		);

		expect(status).toBe(200);
		expect(entry.error).toBeUndefined();
		expect(entry.result?.data?.json).toEqual({ status: "ok" });
	});
});
