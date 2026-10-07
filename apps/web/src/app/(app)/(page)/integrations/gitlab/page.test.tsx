import { beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

if (process.env.SUPERSET_INTEGRATION_FIXTURE !== "page") {
	test("GitLab settings run with isolated authenticated boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-integration-page-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: { PATH: process.env.PATH, SUPERSET_INTEGRATION_FIXTURE: "page" },
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	mock.module("@lingui/core/macro", () => ({ msg: (value: unknown) => value }));
	const i18n = { _: (value: { message: string }) => value.message };
	mock.module("@/lib/i18n-server", () => ({
		initServerI18n: async () => i18n,
	}));
	mock.module("@/env", () => ({
		env: { NEXT_PUBLIC_API_URL: "https://api.example:8443" },
	}));
	let role: string | null = "admin";
	let status: { connected: boolean; needsReauth: boolean } | undefined;
	let statusError = false;
	let stored: { state: unknown; externalAccountLabel: string } | undefined;
	const queries: string[] = [];
	mock.module("@superset/db/utils", () => ({
		findOrgMembership: async ({
			organizationId,
		}: {
			organizationId: string;
		}) => {
			queries.push(`member:${organizationId}`);
			return role && organizationId === "org-a" ? { role } : undefined;
		},
	}));
	mock.module("@/trpc/server", () => ({
		api: async () => ({
			user: {
				me: { query: async () => ({ id: "user-a" }) },
				myOrganization: { query: async () => ({ id: "org-a", name: "Org A" }) },
				myOrganizations: {
					query: async () => [{ id: "org-a", name: "Org A" }],
				},
			},
			integration: {
				connectionStatus: {
					query: async ({ organizationId }: { organizationId: string }) => {
						queries.push(`status:${organizationId}`);
						if (statusError) throw new Error("fixture outage");
						return { gitlab: status };
					},
				},
			},
		}),
	}));
	mock.module("@superset/trpc/lib/gitlab/connection", () => ({
		gitlabConnectionForOrg: async (organizationId: string) => {
			queries.push(`stored:${organizationId}`);
			return stored;
		},
	}));
	mock.module("@superset/trpc/lib/gitlab/config", () => ({
		readGitlabConfig: (state: unknown) => state,
	}));
	mock.module("@lingui/react/macro", () => ({
		Trans: ({ children }: { children: ReactNode }) => children,
	}));
	const sharedI18nPath = new URL(
		"./i18n.ts",
		import.meta.resolve("@superset/shared/integrations"),
	).pathname;
	mock.module(sharedI18nPath, () => ({ i18n }));
	mock.module("posthog-js/react", () => ({
		useFeatureFlagPayload: () => ["gitlab"],
	}));
	mock.module("@tanstack/react-query", () => ({
		useQuery: (options: { fixture: string }) => ({
			data: options.fixture === "org" ? { id: "org-a" } : false,
		}),
	}));
	mock.module("@/trpc/react", () => ({
		useTRPC: () => ({
			user: { myOrganization: { queryOptions: () => ({ fixture: "org" }) } },
			integration: {
				syncAllowed: { queryOptions: () => ({ fixture: "sync" }) },
			},
		}),
	}));
	mock.module("../components/ProFeaturesPaywall", () => ({
		ProFeaturesPaywall: () => null,
	}));
	const { default: Index } = await import("../page");
	const { default: Page } = await import("./page");
	async function html(params: Record<string, string> = {}) {
		return renderToStaticMarkup(
			await Page({ searchParams: Promise.resolve(params) }),
		);
	}
	async function forms(markup: string) {
		const result: {
			action: string;
			method: string;
			fields: Record<string, string>;
			disabled: boolean;
		}[] = [];
		let current: (typeof result)[number] | undefined;
		await new HTMLRewriter()
			.on("form", {
				element(el) {
					current = {
						action: el.getAttribute("action") ?? "",
						method: el.getAttribute("method") ?? "get",
						fields: {},
						disabled: false,
					};
					result.push(current);
				},
			})
			.on("fieldset", {
				element(el) {
					if (current && el.hasAttribute("disabled")) current.disabled = true;
				},
			})
			.on("input", {
				element(el) {
					const name = el.getAttribute("name");
					if (current && name)
						current.fields[name] = el.getAttribute("value") ?? "";
				},
			})
			.transform(new Response(markup))
			.text();
		return result;
	}
	beforeEach(() => {
		role = "admin";
		status = undefined;
		statusError = false;
		stored = undefined;
		queries.length = 0;
		delete process.env.GITLAB_ISSUER;
	});
	test("web roster routes one GitLab card while retaining GitHub/Linear paywall controls", () => {
		const markup = renderToStaticMarkup(<Index />);
		expect(markup.match(/href="\/integrations\/gitlab"/g)).toHaveLength(1);
		expect(markup).toContain("GitHub");
		expect(markup).toContain("Linear");
		expect(markup).not.toContain('href="/integrations/github"');
		expect(markup).not.toContain('href="/integrations/linear"');
		expect(markup).toContain('href="/integrations/slack"');
	});
	test("OAuth POST retains verified query org, trusted custom-port issuer and nested scope", async () => {
		process.env.GITLAB_ISSUER = "https://gl.example:8443";
		const markup = await html();
		const rows = await forms(markup);
		const oauth = rows.find((row) => row.fields.mode === "oauth");
		expect(oauth?.method).toBe("post");
		expect(oauth?.action).toBe(
			"https://api.example:8443/api/gitlab/connect?organizationId=org-a",
		);
		expect(oauth?.fields).toMatchObject({
			mode: "oauth",
			organizationId: "org-a",
			host: "gl.example:8443",
		});
		expect(oauth?.fields).toHaveProperty("groupPath");
		const action = new URL(oauth?.action ?? "");
		const oauthBody = new URLSearchParams({
			...oauth?.fields,
			groupPath: "Acme/subgroup/widget",
		});
		expect(action.searchParams.get("organizationId")).toBe("org-a");
		expect(oauthBody.get("groupPath")).toBe("Acme/subgroup/widget");
		expect(action.searchParams.has("token")).toBe(false);
		expect(action.searchParams.has("groupPath")).toBe(false);
		const pat = rows.find(
			(row) => row.method === "post" && row.fields.token !== undefined,
		);
		expect(new URL(pat?.action ?? "").searchParams.get("organizationId")).toBe(
			"org-a",
		);
		const body = new URLSearchParams({
			...pat?.fields,
			groupPath: "Acme/subgroup/widget",
			token: "fixture-private-token",
		});
		expect(body.get("token")).toBe("fixture-private-token");
		expect(new URL(pat?.action ?? "").searchParams.has("token")).toBe(false);
		expect(pat?.fields.host).toBe("gl.example:8443");
		expect(markup).toContain('type="password"');
		expect(markup).not.toContain('name="clientSecret"');
	});
	test("retained disconnected row never looks connected or offers hook refresh", async () => {
		stored = {
			state: {
				host: "gl.example",
				groupPath: "Acme/subgroup/widget",
				auth: "token",
				scopeKind: "project",
				webhookSecret: "never-render-this",
			},
			externalAccountLabel: "Widget",
		};
		const markup = await html();
		expect(markup).toContain("Not connected");
		expect(markup).not.toContain("Refresh webhooks");
		expect(markup).not.toContain("never-render-this");
	});
	test("expired credentials retain a local disconnect action", async () => {
		status = { connected: false, needsReauth: true };
		stored = {
			state: {
				host: "gl.example",
				groupPath: "acme/subgroup",
				auth: "oauth",
				scopeKind: "group",
				webhookSecret: "never-render-this",
			},
			externalAccountLabel: "Subgroup",
		};
		const markup = await html();
		expect(markup).toContain("Disconnect");
		expect(markup).not.toContain("Refresh webhooks");
		const disconnect = (await forms(markup)).find((row) =>
			new URL(row.action).pathname.endsWith("/disconnect"),
		);
		expect(disconnect?.method).toBe("post");
		expect(
			new URL(disconnect?.action ?? "").searchParams.get("organizationId"),
		).toBe("org-a");
	});
	test("needsReauth wins even when a stale status says connected", async () => {
		status = { connected: true, needsReauth: true };
		const markup = await html();
		expect(markup).toContain("Reconnect");
		expect(markup).not.toContain("Refresh webhooks");
	});
	test("live project/group connections offer org-bound hook reconciliation and disconnect", async () => {
		status = { connected: true, needsReauth: false };
		stored = {
			state: {
				host: "gl.example:8443",
				groupPath: "Acme/subgroup",
				auth: "oauth",
				scopeKind: "group",
				webhookSecret: "never-render-this",
			},
			externalAccountLabel: "Subgroup",
		};
		const markup = await html();
		expect(markup).toContain("Acme/subgroup");
		expect(markup).toContain("Refresh webhooks");
		expect(markup).not.toContain("never-render-this");
		const rows = await forms(markup);
		for (const endpoint of ["hook", "disconnect"]) {
			const form = rows.find((row) =>
				new URL(row.action).pathname.endsWith(`/${endpoint}`),
			);
			expect(form?.method).toBe("post");
			expect(
				new URL(form?.action ?? "").searchParams.get("organizationId"),
			).toBe("org-a");
		}
	});
	test("ordinary members have no enabled credential or management forms", async () => {
		role = "member";
		status = { connected: true, needsReauth: false };
		const markup = await html();
		expect(markup).toContain("Only organization admins and owners");
		const rows = await forms(markup);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row.disabled)).toBe(true);
	});
	test("foreign requested org is rejected before status or connection queries", async () => {
		const markup = await html({ organizationId: "org-other" });
		expect(markup).toContain("not authorized");
		expect(
			queries.some(
				(row) => row.startsWith("stored:") || row.startsWith("status:"),
			),
		).toBe(false);
	});
	test("invalid configured issuer never silently substitutes gitlab.com for OAuth", async () => {
		process.env.GITLAB_ISSUER = "https://gl.example/path";
		const rows = await forms(await html());
		expect(rows.some((row) => row.method === "get")).toBe(false);
		expect(rows.some((row) => row.fields.token !== undefined)).toBe(true);
	});
	test("status outages stay unknown and disable writes", async () => {
		statusError = true;
		const markup = await html();
		expect(markup).toContain("Could not load");
		expect(markup).not.toContain("Not connected");
		expect((await forms(markup)).every((row) => row.disabled)).toBe(true);
	});
	test("callback errors distinguish OAuth configuration, token, path and cleanup", async () => {
		for (const [code, fragment] of [
			["oauth_not_configured", "OAuth is not configured"],
			["token_rejected", "token was rejected"],
			["path_not_found", "project or group"],
			["provider_unavailable", "Could not reach the provider. Try again."],
			["disconnect_failed", "disconnected locally"],
		])
			expect(await html({ error: code })).toContain(fragment);
		expect(
			await html({ error: "<script>token-secret</script>" }),
		).not.toContain("token-secret");
	});
}
