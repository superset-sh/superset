import { beforeEach, expect, test } from "bun:test";
import {
	isolatedGitlabHookTests,
	setupGitlabHookFixture,
} from "../hook-test-fixture.test";

if (process.env.SUPERSET_GITLAB_HOOK_FIXTURE === "manual") {
	const { fixture, reset } = await setupGitlabHookFixture();
	const { POST } = await import("./route");
	beforeEach(reset);
	function request(
		options: {
			origin?: string | null;
			authorization?: string;
			organizationId?: string;
			body?: unknown;
			rawBody?: string;
			form?: URLSearchParams;
		} = {},
	) {
		const headers = new Headers({ cookie: "SESSION=VALID_FIXTURE_COOKIE" });
		if (options.origin !== null)
			headers.set(
				"origin",
				options.origin ?? fixture.environment.NEXT_PUBLIC_WEB_URL,
			);
		if (options.authorization)
			headers.set("authorization", options.authorization);
		if (!options.form) headers.set("content-type", "application/json");
		return new Request(
			`${fixture.environment.NEXT_PUBLIC_API_URL}/api/gitlab/hook?organizationId=${options.organizationId ?? "organization_1"}`,
			{
				method: "POST",
				headers,
				body:
					options.form ??
					options.rawBody ??
					JSON.stringify(options.body === undefined ? {} : options.body),
			},
		);
	}
	test("admin/owner and origin authorization precede any connection/provider access", async () => {
		fixture.role = "member";
		expect((await POST(request())).status).toBe(403);
		fixture.role = "admin";
		expect(
			(await POST(request({ origin: "https://attacker.invalid" }))).status,
		).toBe(403);
		expect(
			(
				await POST(
					request({
						origin: null,
						authorization: "Bearer INVALID_FIXTURE_BEARER",
					}),
				)
			).status,
		).toBe(401);
		expect((await POST(request({ origin: null }))).status).toBe(403);
		expect(fixture.reads).toBe(0);
		expect(fixture.calls).toHaveLength(0);
		fixture.role = "owner";
		expect(
			await (
				await POST(
					request({
						origin: null,
						authorization: "Bearer VALID_FIXTURE_BEARER",
					}),
				)
			).json(),
		).toEqual({ ok: true });
	});
	test("membership and caller organization bind the actual connection and grant", async () => {
		fixture.role = null;
		expect((await POST(request())).status).toBe(403);
		expect(fixture.reads).toBe(0);
		fixture.role = "admin";
		const response = await POST(request({ organizationId: "organization_2" }));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Connect GitLab first" });
		expect(fixture.calls).toHaveLength(0);
	});
	test("malformed and non-object payloads never expand into bulk reconciliation", async () => {
		for (const rawBody of ["{", "null", "[]", "[{}]", '"7"', "7", "true"]) {
			const response = await POST(request({ rawBody }));
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid payload" });
		}
		expect(fixture.reads).toBe(0);
		expect(fixture.calls).toHaveLength(0);
	});
	test("canonical positive project IDs are checked before connection access", async () => {
		for (const projectId of ["0", "01", "-1", "1.5", "9007199254740992", 7]) {
			const response = await POST(request({ body: { projectId } }));
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid project ID" });
		}
		expect(fixture.reads).toBe(0);
	});
	test("actual scoped JSON and form callers retain success and scope failure contracts", async () => {
		expect(
			await (await POST(request({ body: { projectId: "7" } }))).json(),
		).toEqual({ ok: true });
		const denied = await POST(request({ body: { projectId: "8" } }));
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({
			error: "Project outside connection scope",
		});
		const form = await POST(
			request({ form: new URLSearchParams({ projectId: "7" }) }),
		);
		expect(form.status).toBe(303);
		expect(
			new URL(form.headers.get("location") ?? "").searchParams.get("error"),
		).toBeNull();
		const wrongForm = await POST(
			request({ form: new URLSearchParams({ projectId: "8" }) }),
		);
		expect(
			new URL(wrongForm.headers.get("location") ?? "").searchParams.get(
				"error",
			),
		).toBe("hook_failed");
	});
	test("form success and scope failure retain only verified request organization", async () => {
		for (const projectId of ["7", "8"]) {
			const response = await POST(
				request({
					form: new URLSearchParams({
						projectId,
						organizationId: "forged_body_org",
					}),
				}),
			);
			const target = new URL(response.headers.get("location") ?? "");
			expect(target.searchParams.get("organizationId")).toBe("organization_1");
			expect(target.origin).toBe(fixture.environment.NEXT_PUBLIC_WEB_URL);
			expect(target.searchParams.get("error")).toBe(
				projectId === "7" ? null : "hook_failed",
			);
		}
		fixture.role = "member";
		const response = await POST(request({ form: new URLSearchParams() }));
		expect(response.status).toBe(403);
		expect(response.headers.get("location")).toBeNull();
	});
	test("stale generations and transient provider failures retain generic released errors", async () => {
		fixture.interceptor = async (_url, init) =>
			init.method
				? new Response("provider-secret-internal", { status: 503 })
				: null;
		const response = await POST(request());
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			error: "Could not register the GitLab webhook",
		});
		fixture.interceptor = async (url, init) => {
			if (!init.method && url.pathname.endsWith("/hooks") && fixture.current)
				fixture.current.disconnectedAt = new Date();
			return null;
		};
		const stale = await POST(request());
		expect(stale.status).toBe(400);
		expect(await stale.json()).toEqual({ error: "Reconnect GitLab" });
	});
} else {
	test("manual GitLab hook route in a cleared isolated fake-only process", () =>
		isolatedGitlabHookTests(import.meta.path, "manual"));
}
