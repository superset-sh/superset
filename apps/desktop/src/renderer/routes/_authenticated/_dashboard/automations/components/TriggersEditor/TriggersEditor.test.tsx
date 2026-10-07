import { beforeEach, expect, mock, test } from "bun:test";
import type { PlanTier } from "@superset/shared/billing";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TriggerSentence } from "../TriggerSentence";
import type { TriggerMenuItems } from "./TriggerMenuItems";

const observed: {
	row?: ComponentProps<typeof TriggerSentence>;
	menu?: ComponentProps<typeof TriggerMenuItems>;
} = {};
const opened: Array<[string, string | undefined, string | undefined]> = [];
let connected = false;
let needsReauth = false;
let flagPayload: unknown = ["github", "gitlab"];
let plan: PlanTier = "pro";
const dropdownMenu = await import("@superset/ui/dropdown-menu");
mock.module("@superset/ui/dropdown-menu", () => ({
	...dropdownMenu,
	DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
		<>{children}</>
	),
}));
mock.module("./TriggerMenuItems", () => ({
	TriggerMenuItems: (props: ComponentProps<typeof TriggerMenuItems>) => {
		observed.menu = props;
		return null;
	},
}));
mock.module("../TriggerSentence", () => ({
	TriggerSentence: (props: ComponentProps<typeof TriggerSentence>) => {
		observed.row = props;
		return <span>Fixture trigger row</span>;
	},
}));
mock.module("renderer/components/ConnectorSection", () => ({
	ConnectConnectorDialog: () => null,
}));
mock.module("renderer/hooks/useCurrentPlan", () => ({
	useCurrentPlan: () => ({ plan }),
}));
mock.module("posthog-js/react", () => ({
	useFeatureFlagPayload: () => flagPayload,
}));
mock.module("renderer/env.renderer", () => ({
	env: { NEXT_PUBLIC_WEB_URL: "https://web.example:8443" },
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		integration: {
			connectionStatus: {
				useQuery: (input: unknown) => {
					expect(input).toEqual({ organizationId: "org-selected" });
					return {
						data: {
							gitlab: { connected, needsReauth, accounts: [] },
							github: { connected: true, needsReauth: false, accounts: [] },
						},
						isPending: false,
					};
				},
			},
		},
		useUtils: () => ({
			integration: { connectionStatus: { invalidate: async () => {} } },
		}),
	},
}));
const query = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
	...query,
	useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));
const { TriggersEditor } = await import("./TriggersEditor");
beforeEach(() => {
	delete observed.row;
	delete observed.menu;
	flagPayload = ["github", "gitlab"];
	plan = "pro";
	opened.length = 0;
	connected = needsReauth = false;
	window.open = (url, target, features) => {
		opened.push([String(url), target, features]);
		return null;
	};
});
const native = {
	kind: "gitlab" as const,
	event: "merge_request.opened" as const,
	projects: { mode: "list" as const, ids: ["Team/Subgroup/Widget"] },
	branches: { mode: "any" as const },
	labels: { mode: "any" as const },
	includeForks: false as const,
};

for (const reauth of [false, true]) {
	test(`native ${reauth ? "reconnect" : "connect"} opens the existing scoped GitLab page`, () => {
		needsReauth = reauth;
		renderToStaticMarkup(
			<TriggersEditor
				organizationId="org-selected"
				drafts={[{ config: native }]}
				onEdit={() => {}}
				problems={[]}
				options={{}}
				optionState={{}}
			/>,
		);
		const row = observed.row;
		if (!row?.onConnect) throw new Error("Expected native connection callback");
		expect(row.requiresConnection).toBe(true);
		expect(row.needsReauth).toBe(reauth);
		row.onConnect("gitlab");
		expect(opened).toEqual([
			[
				"https://web.example:8443/integrations/gitlab?organizationId=org-selected",
				"_blank",
				"noopener,noreferrer",
			],
		]);
	});
}

test("native manage keeps the selected organization and existing account binding", () => {
	connected = true;
	renderToStaticMarkup(
		<TriggersEditor
			organizationId="org-selected"
			drafts={[{ config: native, connectionId: "connection" }]}
			onEdit={() => {}}
			problems={[]}
			options={{}}
			optionState={{}}
		/>,
	);
	const row = observed.row;
	if (!row?.onConnect) throw new Error("Expected manage callback");
	expect(row.requiresConnection).toBe(false);
	expect(row.trigger.connectionId).toBe("connection");
	row.onConnect("gitlab");
	expect(opened[0]?.[0]).toBe(
		"https://web.example:8443/integrations/gitlab?organizationId=org-selected",
	);
});

test("GitHub continues using the existing connector dialog branch", () => {
	const config = {
		kind: "github" as const,
		event: "pull_request.opened" as const,
		repositories: { mode: "list" as const, ids: ["123"] },
		branches: { mode: "any" as const },
		labels: { mode: "any" as const },
		actor: { mode: "any" as const },
		includeForks: false as const,
	};
	renderToStaticMarkup(
		<TriggersEditor
			organizationId="org-selected"
			drafts={[{ config }]}
			onEdit={() => {}}
			problems={[]}
			options={{}}
			optionState={{}}
		/>,
	);
	const row = observed.row;
	if (!row?.onConnect) throw new Error("Expected original GitHub callback");
	expect(row.requiresConnection).toBe(false);
	row.onConnect("github");
	expect(opened).toEqual([]);
});

function renderMenu() {
	renderToStaticMarkup(
		<TriggersEditor
			organizationId="org-selected"
			drafts={[]}
			onEdit={() => {}}
			problems={[]}
			options={{}}
			optionState={{}}
		/>,
	);
	if (!observed.menu) throw new Error("Expected delivered trigger menu");
	return observed.menu;
}

for (const payload of [undefined, { gitlab: true }]) {
	test(`GitLab remains addable with ${payload === undefined ? "unloaded" : "nonarray"} feature flags`, () => {
		flagPayload = payload;
		const menu = renderMenu();
		expect(menu.providers.map((provider) => provider.kind)).toEqual([
			"schedule",
			"gitlab",
		]);
		const nativeProvider = menu.providers.find(
			(provider) => provider.kind === "gitlab",
		);
		if (!nativeProvider) throw new Error("Expected native menu provider");
		expect(menu.lockedLabel?.(nativeProvider)).toBeNull();
	});
}

test("GitHub still requires its feature flag while GitLab is always offered", () => {
	flagPayload = ["github"];
	expect(renderMenu().providers.map((provider) => provider.kind)).toEqual([
		"schedule",
		"github",
		"gitlab",
	]);
});

test("the analytics-independent GitLab menu retains the Pro entitlement gate", () => {
	flagPayload = undefined;
	plan = "free";
	const menu = renderMenu();
	const nativeProvider = menu.providers.find(
		(provider) => provider.kind === "gitlab",
	);
	if (!nativeProvider) throw new Error("Expected locked native menu provider");
	expect(menu.lockedLabel?.(nativeProvider)).toBe("Pro");
	expect(menu.providers.some((provider) => provider.kind === "github")).toBe(
		false,
	);
});
