import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";

// The `next/headers` mock returns this shared Headers; the auth mock reads it,
// so each test drives the actual Authorization path that `proxy` passes to
// `auth.api.getSession({ headers: await headers() })`.
const sessionHeaders = new Headers({ "content-type": "application/json" });
mock.module("next/headers", () => ({
	headers: () => sessionHeaders,
}));

// getSession behaves like the real auth: a request bearing a valid Bearer
// token resolves to an authenticated session, anything else is unauthenticated.
// This exercises the Authorization plumbing instead of forcing a session.
const getSession = mock(async ({ headers }: { headers?: Headers } = {}) => {
	const auth = headers?.get("authorization") ?? "";
	if (auth === "Bearer valid-token") {
		return {
			user: { email: "dev@app.superset.sh", deletionRequestedAt: null },
		};
	}
	return null;
});
mock.module("@superset/auth/server", () => ({
	auth: { api: { getSession } },
}));

const { default: proxy } = await import("./proxy");

/** Drive proxy with the given auth header, threading it into the shared mock.
 * Empties the Authorization header for the unauthenticated cases. */
async function callProxy(
	path: string,
	{ auth }: { auth?: string } = {},
): Promise<Response> {
	if (auth) sessionHeaders.set("authorization", auth);
	else sessionHeaders.delete("authorization");
	return proxy(new NextRequest(path));
}

describe("proxy: unauthenticated API requests return JSON 401, never a sign-in redirect", () => {
	beforeEach(() => {
		getSession.mockClear();
	});

	it("answers /api/trpc/* with a JSON 401 instead of a 307 redirect (#7072)", async () => {
		const res = await callProxy("https://app.superset.sh/api/trpc/user.me", {
			auth: "Bearer stale-token",
		});

		expect(res.status).toBe(401);
		expect(res.headers.get("content-type")).toContain("application/json");
		const body = await res.json();
		expect(body).toEqual({ error: "Unauthorized" });
	});

	it("answers the exact /trpc route with a JSON 401 too", async () => {
		// coderabbit: exercise the pathname === "/trpc" branch (no trailing path).
		const res = await callProxy("https://app.superset.sh/trpc?batch=1");

		expect(res.status).toBe(401);
	});

	it("still redirects unauthenticated page routes to /sign-in", async () => {
		const res = await callProxy("https://app.superset.sh/dashboard");

		// Not an API route: the historical page-redirect behaviour is preserved.
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/sign-in");
	});

	it("does not treat /apiary or /trpcfoo as API routes (slash-delimited child only)", async () => {
		// P2 (cubic) + coderabbit: only exact /api|/trpc or /api/|/trpc/ match.
		const apiary = await callProxy("https://app.superset.sh/apiary");
		const trpcfoo = await callProxy("https://app.superset.sh/trpcfoo");

		// These are page routes — keep the historical /sign-in redirect, no JSON 401.
		expect(apiary.status).toBe(307);
		expect(apiary.headers.get("location")).toContain("/sign-in");
		expect(trpcfoo.status).toBe(307);
		expect(trpcfoo.headers.get("location")).toContain("/sign-in");
	});

	it("leaves public API routes (e.g. /api/auth/desktop) reachable unauthenticated", async () => {
		// P1 (cubic) + coderabbit: /api/auth/desktop is the public desktop-OAuth
		// start; require a successful pass-through (200), so a 5xx would fail.
		const res = await callProxy("https://app.superset.sh/api/auth/desktop");

		expect(res.status).toBe(200);
	});

	it("passes a real valid Bearer request through without 401 or redirect", async () => {
		// coderabbit: the Authorization header must drive auth lookup — a valid
		// token resolves to a session, so the request is neither 401'd nor
		// redirected (NextResponse.next() = 200).
		const res = await callProxy("https://app.superset.sh/api/trpc/user.me", {
			auth: "Bearer valid-token",
		});

		expect(res.status).toBe(200);
	});
});
