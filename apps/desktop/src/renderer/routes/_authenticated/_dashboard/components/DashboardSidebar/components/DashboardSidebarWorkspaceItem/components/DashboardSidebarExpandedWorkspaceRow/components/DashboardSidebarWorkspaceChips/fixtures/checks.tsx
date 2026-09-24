import { afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
const { createPortal } = await import("react-dom");
const { cleanup, fireEvent, render } = await import("@testing-library/react");

mock.module("renderer/stores/inline-workspace-ports", () => ({
	useInlineWorkspacePortsEnabled: () => true,
}));
mock.module("renderer/stores/workspace-agents-row", () => ({
	useWorkspaceAgentsRowEnabled: () => true,
}));
mock.module(
	"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider",
	() => ({
		useDashboardSidebarWorkspacePorts: () => ({ ports: [{ port: 3000 }] }),
	}),
);
mock.module("../hooks/useDashboardSidebarWorkspaceRunningAgents", () => ({
	useDashboardSidebarWorkspaceRunningAgents: () => [
		{ subagents: [] },
		{ subagents: [] },
	],
}));
mock.module("../components/DashboardSidebarAgentsChip", () => ({
	DashboardSidebarAgentsChip: () => (
		<button type="button">
			<span>Agents</span>
			{createPortal(<span>Agent details</span>, document.body)}
		</button>
	),
}));
mock.module("../components/DashboardSidebarPortsChip", () => ({
	DashboardSidebarPortsChip: () => (
		<button type="button" disabled>
			<span>Ports</span>
		</button>
	),
}));
const { DashboardSidebarWorkspaceChips } = await import(
	"../DashboardSidebarWorkspaceChips"
);
afterEach(cleanup);

function setup() {
	const dragStart = mock(() => {});
	const rowClick = mock(() => {});
	const view = render(
		// biome-ignore lint/a11y/useSemanticElements: mirrors the sortable wrapper, which contains pill buttons
		<div
			role="button"
			tabIndex={0}
			onMouseDown={dragStart}
			onTouchStart={dragStart}
		>
			<DashboardSidebarWorkspaceChips workspaceId="test" onClick={rowClick} />
		</div>,
	);
	const strip = view.container.firstElementChild
		?.firstElementChild as HTMLElement;
	return { ...view, strip, dragStart, rowClick };
}

for (const eventType of ["mouseDown", "touchStart"] as const) {
	test(`${eventType} in empty space reaches the sortable ancestor`, () => {
		const { strip, dragStart } = setup();
		fireEvent[eventType](strip);
		expect(dragStart).toHaveBeenCalledTimes(1);
	});

	test(`${eventType} inside a pill's portaled details does not start dragging`, () => {
		const { getByText, dragStart } = setup();
		fireEvent[eventType](getByText("Agent details"));
		expect(dragStart).not.toHaveBeenCalled();
	});

	for (const label of ["Agents", "Ports"]) {
		test(`${eventType} on ${label} content does not start dragging`, () => {
			const { getByText, dragStart } = setup();
			fireEvent[eventType](getByText(label));
			expect(dragStart).not.toHaveBeenCalled();
		});
		test(`${eventType} on ${label} button does not start dragging`, () => {
			const { getByText, dragStart } = setup();
			fireEvent[eventType](
				getByText(label).closest("button") as HTMLButtonElement,
			);
			expect(dragStart).not.toHaveBeenCalled();
		});
	}
}

test("empty space still selects the workspace", () => {
	const { strip, rowClick } = setup();
	fireEvent.click(strip);
	expect(rowClick).toHaveBeenCalledTimes(1);
});

test("pill content does not select the workspace", () => {
	const { getByText, rowClick } = setup();
	fireEvent.click(getByText("Agents"));
	expect(rowClick).not.toHaveBeenCalled();
});
