import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardSidebarRunningAgent } from "../../hooks/useDashboardSidebarWorkspaceRunningAgents";

mock.module("../../hooks/useDashboardSidebarAgentKill", () => ({
	useDashboardSidebarAgentKill: () => ({
		isPending: false,
		killAgent: async () => {},
		killAgents: async () => 0,
	}),
}));

mock.module("../../hooks/useDashboardSidebarChipHoverSuppression", () => ({
	useDashboardSidebarChipHoverSuppression: () => ({
		hold: () => {},
		release: () => {},
	}),
}));

const { DashboardSidebarAgentsChip } = await import(
	"./DashboardSidebarAgentsChip"
);

function runningAgent(
	overrides: Partial<DashboardSidebarRunningAgent> = {},
): DashboardSidebarRunningAgent {
	return {
		sourceKey: "terminal:t1",
		source: { type: "terminal", id: "t1" },
		terminalId: "t1",
		agentId: "claude",
		status: "idle",
		startedAt: 1,
		label: "Claude",
		...overrides,
	};
}

/** Markup of the chip trigger only — the hover card renders in a portal. */
function renderChip(agentCount: number): string {
	const agents = Array.from({ length: agentCount }, (_, index) =>
		runningAgent({
			sourceKey: `terminal:t${index}`,
			terminalId: `t${index}`,
		}),
	);

	return renderToStaticMarkup(
		<DashboardSidebarAgentsChip workspaceId="ws-1" agents={agents} />,
	);
}

describe("DashboardSidebarAgentsChip", () => {
	test("labels the chip as an inspect control, never as stop-all", () => {
		const markup = renderChip(3);

		expect(markup).toContain('aria-label="Show 3 running agents"');
		expect(markup.toLowerCase()).not.toContain("stop");
	});

	test("shows the agent count with no hover-only × affordance", () => {
		const markup = renderChip(3);

		// Idle agents render no status indicator and the Claude preset resolves to
		// an <img>, so any <svg> left in the trigger would be the × (or a spinner).
		expect(markup).toContain(">3<");
		expect(markup).not.toContain("<svg");
		expect(markup).not.toContain("opacity-0");
	});

	test("exposes the chip as a disclosure that stays usable mid-stop", () => {
		const markup = renderChip(2);

		expect(markup).toContain('aria-expanded="false"');
		// A kill in flight must not disable the way back into the agent list.
		expect(markup).not.toContain('disabled=""');
	});
});
