import { beforeEach, expect, test } from "bun:test";
import {
	connectionId,
	isolatedGitlabHookTests,
	setupGitlabHookFixture,
} from "./hook-test-fixture.test";

if (process.env.SUPERSET_GITLAB_HOOK_FIXTURE === "reconcile") {
	const { fixture, reset } = await setupGitlabHookFixture();
	const { reconcileGitlabHooks } = await import("./reconcile-hooks");
	const args = {
		connectionId,
		organizationId: "organization_1",
		apiOrigin: "https://api.example.invalid",
	};
	beforeEach(reset);
	test("actual credentials, scoped project and registration keep flags, secret and dedicated destination", async () => {
		fixture.environment.GITLAB_WEBHOOK_ORIGIN =
			"https://hooks.example.invalid:8443";
		const hookUrl = `https://hooks.example.invalid:8443/api/gitlab/webhook?connection=${connectionId}`;
		fixture.interceptor = async (url, init) =>
			!init.method && url.pathname.endsWith("/hooks")
				? Response.json(
						[
							{ id: 17, url: hookUrl },
							{ id: 99, url: "https://foreign.invalid/hook" },
						],
						{ headers: { "x-next-page": "" } },
					)
				: null;
		expect(await reconcileGitlabHooks(args)).toEqual({
			status: "reconciled",
			projects: 1,
		});
		const writes = fixture.calls.filter(({ init }) => init.method);
		expect(writes).toHaveLength(1);
		expect(writes[0]?.init.method).toBe("PUT");
		expect(writes[0]?.url.pathname).toBe("/api/v4/projects/7/hooks/17");
		expect(JSON.parse(String(writes[0]?.init.body))).toEqual({
			url: hookUrl,
			token: "FIXTURE_HOOK_SECRET",
			enable_ssl_verification: true,
			merge_requests_events: true,
			note_events: true,
			pipeline_events: true,
			issues_events: true,
			push_events: true,
		});
	});
	test("concurrent reconciliation serializes hook discovery and creation", async () => {
		let hook: { id: number; url: string } | null = null;
		fixture.interceptor = async (url, init) => {
			if (url.pathname.endsWith("/hooks") && !init.method)
				return Response.json(hook ? [hook] : [], {
					headers: { "x-next-page": "" },
				});
			if (url.pathname.endsWith("/hooks") && init.method === "POST") {
				hook = { id: 17, url: JSON.parse(String(init.body)).url };
				return Response.json(hook);
			}
			return null;
		};
		await Promise.all([reconcileGitlabHooks(args), reconcileGitlabHooks(args)]);
		expect(
			fixture.calls.filter(({ init }) => init.method === "POST"),
		).toHaveLength(1);
	});
	test("foreign caller organization never reads provider credentials or projects", async () => {
		expect(
			await reconcileGitlabHooks({ ...args, organizationId: "organization_2" }),
		).toEqual({ status: "disconnected" });
		expect(fixture.calls).toHaveLength(0);
	});
	test("manual project ID cannot escape selected project or group scope", async () => {
		await expect(
			reconcileGitlabHooks({ ...args, projectId: "8" }),
		).rejects.toThrow("Project outside connection scope");
		expect(fixture.calls.filter(({ init }) => init.method)).toHaveLength(0);
	});
	test("all group pages register only scoped positive project IDs", async () => {
		if (!fixture.current) throw new Error("Missing fixture connection");
		fixture.current.state = {
			provider: "gitlab",
			host: "git.example.invalid:8443",
			groupPath: "team",
			scopeKind: "group",
			scopeId: "99",
			auth: "token",
			webhookSecret: "FIXTURE_HOOK_SECRET",
		};
		fixture.interceptor = async (url) =>
			url.pathname === "/api/v4/groups/99/projects"
				? Response.json(
						url.searchParams.get("page") === "1"
							? Array.from({ length: 100 }, (_, index) => ({
									id: index + 1,
									path_with_namespace: `team/project${index}`,
								}))
							: [
									{ id: 101, path_with_namespace: "team/sub/new" },
									{ id: 102, path_with_namespace: "team-other/foreign" },
								],
						{
							headers: {
								"x-next-page": url.searchParams.get("page") === "1" ? "2" : "",
							},
						},
					)
				: null;
		expect(await reconcileGitlabHooks(args)).toEqual({
			status: "reconciled",
			projects: 101,
		});
		expect(fixture.calls.filter(({ init }) => init.method)).toHaveLength(101);
	});
	test.each([
		"organization",
		"provider",
		"owner",
		"disconnected",
		"scope",
		"raw-state",
		"ciphertext",
	])("%s change during hook pagination stops old generation writes", async (change) => {
		fixture.interceptor = async (url, init) => {
			if (!init.method && url.pathname.endsWith("/hooks") && fixture.current) {
				if (change === "organization")
					fixture.current.organizationId = "organization_2";
				if (change === "provider") fixture.current.connector = "github";
				if (change === "owner") fixture.current.ownerKind = "user";
				if (change === "disconnected")
					fixture.current.disconnectedAt = new Date();
				if (change === "scope")
					fixture.current.state = {
						provider: "gitlab",
						host: "git.example.invalid:8443",
						groupPath: "other/project",
						scopeKind: "project",
						scopeId: "8",
						auth: "token",
						webhookSecret: "NEW_HOOK_SECRET",
					};
				if (change === "raw-state")
					fixture.current.state = {
						...fixture.current.state,
						extra: true,
					} as typeof fixture.current.state;
				if (change === "ciphertext")
					fixture.current.accessToken =
						await fixture.crypto.encryptSecret("FIXTURE_PAT_TOKEN");
			}
			return null;
		};
		expect(await reconcileGitlabHooks(args)).toEqual({
			status: "disconnected",
		});
		expect(fixture.calls.filter(({ init }) => init.method)).toHaveLength(0);
	});
	test("reconnect during group pagination cannot register from its old grant", async () => {
		if (!fixture.current) throw new Error("Missing fixture connection");
		fixture.current.state = {
			provider: "gitlab",
			host: "git.example.invalid:8443",
			groupPath: "team",
			scopeKind: "group",
			scopeId: "99",
			auth: "token",
			webhookSecret: "FIXTURE_HOOK_SECRET",
		};
		fixture.interceptor = async (url) => {
			if (url.pathname !== "/api/v4/groups/99/projects") return null;
			if (fixture.current)
				fixture.current.accessToken = await fixture.crypto.encryptSecret(
					"RECONNECTED_FIXTURE_TOKEN",
				);
			return Response.json([{ id: 7, path_with_namespace: "team/project" }], {
				headers: { "x-next-page": "" },
			});
		};
		expect(await reconcileGitlabHooks(args)).toEqual({
			status: "disconnected",
		});
		expect(fixture.calls.filter(({ init }) => init.method)).toHaveLength(0);
	});
	test("transient failures retry without disconnecting or leaking provider errors", async () => {
		fixture.interceptor = async (_url, init) =>
			init.method ? new Response(null, { status: 503 }) : null;
		await expect(reconcileGitlabHooks(args)).rejects.toThrow(
			"Could not register the GitLab webhook",
		);
		expect(fixture.current?.disconnectedAt).toBeNull();
		fixture.interceptor = undefined;
		expect(await reconcileGitlabHooks(args)).toEqual({
			status: "reconciled",
			projects: 1,
		});
	});
} else {
	test("GitLab reconciliation in an isolated cleared fake-only process", () =>
		isolatedGitlabHookTests(import.meta.path, "reconcile"));
}
