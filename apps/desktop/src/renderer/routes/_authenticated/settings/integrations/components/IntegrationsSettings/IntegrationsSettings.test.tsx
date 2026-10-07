import { beforeEach, expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Test subprocess isolation requires an owned scratch directory.
import { mkdtempSync, rmSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

if (process.env.SUPERSET_INTEGRATION_FIXTURE !== "desktop") {
	test("desktop integration settings use isolated cloud boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-integration-desktop-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						SUPERSET_INTEGRATION_FIXTURE: "desktop",
					},
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
	mock.module("@lingui/react/macro", () => ({
		Trans: ({ children }: { children: ReactNode }) => children,
	}));
	const sharedI18nPath = new URL(
		"./i18n.ts",
		import.meta.resolve("@superset/shared/integrations"),
	).pathname;
	mock.module(sharedI18nPath, () => ({
		i18n: { _: (value: { message: string }) => value.message },
	}));
	mock.module("posthog-js/react", () => ({
		useFeatureFlagPayload: () => undefined,
	}));
	let org: string | null = "org-a";
	mock.module("renderer/hooks/useActiveOrganizationId", () => ({
		useActiveOrganizationId: () => org,
	}));
	mock.module("renderer/stores/settings-state", () => ({
		useSettingsSearchQuery: () => "",
	}));
	mock.module("renderer/components/Paywall", () => ({
		GATED_FEATURES: { TASKS: "tasks", REMOTE_ACCESS: "remote-access" },
		usePaywall: () => ({
			gateFeature: () => {},
			hasAccess: () => true,
			isReady: true,
		}),
	}));
	mock.module("renderer/env.renderer", () => ({
		env: { NEXT_PUBLIC_WEB_URL: "https://web.example" },
	}));
	mock.module("renderer/lib/api-trpc-client", () => ({
		apiTrpcClient: {
			integration: { github: { getInstallation: { query: async () => null } } },
		},
	}));
	mock.module(
		"renderer/routes/_authenticated/settings/components/HighlightText",
		() => ({ HighlightText: ({ text }: { text: string }) => text }),
	);
	let connected = false;
	let needsReauth = false;
	let pending = false;
	let failure = false;
	const calls: unknown[] = [];
	const buttons: { text: string; click: () => void }[] = [];
	const valueText = (value: ReactNode): string =>
		typeof value === "string"
			? value
			: Array.isArray(value)
				? value.map(valueText).join("")
				: value && typeof value === "object" && "props" in value
					? valueText((value.props as { children: ReactNode }).children)
					: "";
	mock.module("@superset/ui/button", () => ({
		Button: ({
			children,
			onClick,
			...props
		}: {
			children: ReactNode;
			onClick: () => void;
		}) => {
			buttons.push({ text: valueText(children), click: onClick });
			return (
				<button type="button" {...props}>
					{children}
				</button>
			);
		},
	}));
	const query = (data: unknown) => ({
		useQuery: () => ({ data, isPending: false }),
	});
	mock.module("renderer/lib/cloud-trpc", () => ({
		cloudTrpc: {
			integration: {
				list: {
					useQuery: () => ({
						data: [
							{ provider: "gitlab", externalOrgName: "stale row" },
							{ provider: "slack", externalOrgName: "Slack workspace" },
						],
						isPending: false,
					}),
				},
				connectionStatus: {
					useQuery: (input: unknown, options: unknown) => {
						calls.push([input, options]);
						return {
							data: failure
								? undefined
								: { gitlab: { connected, needsReauth } },
							isPending: pending,
							isError: failure,
						};
					},
				},
				google: {
					getConnection: query({
						email: "me@example.com",
						needsReconnect: false,
					}),
				},
				linear: {
					getConnection: query({
						externalOrgName: "Linear team",
						needsReconnect: false,
					}),
				},
				sentry: { getConnection: query(null) },
				notion: { getConnection: query(null) },
				microsoftTeams: { getConnection: query(null) },
			},
		},
	}));
	const { IntegrationsSettings } = await import("./IntegrationsSettings");
	function render(
		visibleItems?: Parameters<typeof IntegrationsSettings>[0]["visibleItems"],
	) {
		buttons.length = 0;
		return renderToStaticMarkup(
			createElement(IntegrationsSettings, { visibleItems }),
		);
	}
	beforeEach(() => {
		connected = false;
		needsReauth = false;
		pending = false;
		failure = false;
		org = "org-a";
		calls.length = 0;
	});
	test("one GitLab row uses status rather than a retained connection row", () => {
		const html = render(["integrations-gitlab"]);
		expect(html).toContain("GitLab");
		expect(html.match(/GitLab/g)).toHaveLength(1);
		expect(html).toContain("Not connected");
		expect(html).not.toContain("Connected to stale row");
		expect(buttons.map((button) => button.text)).toEqual(["Connect"]);
		expect(calls[0]).toEqual([{ organizationId: "org-a" }, { enabled: true }]);
	});
	test("expired credentials explicitly require reconnect even with stale connected true", () => {
		connected = true;
		needsReauth = true;
		expect(render(["integrations-gitlab"])).toContain("Reconnect");
		expect(buttons.map((button) => button.text)).toEqual(["Reconnect"]);
	});
	test("live GitLab row manages the exact desktop window organization", () => {
		connected = true;
		expect(render(["integrations-gitlab"])).toContain("Connected");
		const opened: string[] = [];
		const previous = globalThis.window;
		Object.defineProperty(globalThis, "window", {
			value: { open: (url: string) => opened.push(url) },
			configurable: true,
			writable: true,
		});
		try {
			buttons[0]?.click();
			expect(opened).toEqual([
				"https://web.example/integrations/gitlab?organizationId=org-a",
			]);
		} finally {
			Object.defineProperty(globalThis, "window", {
				value: previous,
				configurable: true,
				writable: true,
			});
		}
	});
	test("GitLab load failures are unknown rather than disconnected", () => {
		failure = true;
		const html = render(["integrations-gitlab"]);
		expect(html).toContain("Could not load");
		expect(html).not.toContain("Not connected");
	});
	test("GitLab pending status remains a skeleton", () => {
		pending = true;
		const html = render(["integrations-gitlab"]);
		expect(html).not.toContain("Not connected");
		expect(html).not.toContain("Reconnect");
	});
	test("existing standalone provider controls and metadata remain intact", () => {
		const html = render();
		expect(html).toContain("GitHub");
		expect(html).toContain("Connected to Linear team");
		expect(html).toContain("Connected to Slack workspace");
		expect(html).not.toContain("Notion");
		expect(buttons.map((button) => button.text)).toEqual([
			"Manage",
			"Connect",
			"Connect",
			"Manage",
		]);
	});
	test("no organization continues showing the upstream membership requirement", () => {
		org = null;
		expect(render()).toContain("You need to be part of an organization");
		expect(buttons).toHaveLength(0);
		expect(calls[0]).toEqual([{ organizationId: "" }, { enabled: false }]);
	});
}
