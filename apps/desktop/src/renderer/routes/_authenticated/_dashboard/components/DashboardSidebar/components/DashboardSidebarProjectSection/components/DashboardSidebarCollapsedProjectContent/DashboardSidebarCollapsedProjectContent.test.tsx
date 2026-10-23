import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardSidebarDndValue } from "../../../../hooks/useSidebarDnd";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, screen } = await import("@testing-library/react");
const { watchBlockedDragAttempts } = await import(
	"../../../../hooks/useBlockedDragNotice/watchBlockedDragAttempts"
);
const { SidebarDndContextProvider } = await import(
	"../../../../hooks/useSidebarDnd"
);
const { DashboardSidebarCollapsedProjectContent } = await import(
	"./DashboardSidebarCollapsedProjectContent"
);

afterEach(cleanup);

const dndValue = {
	projectItems: {},
	workspacesById: new Map(),
} as unknown as DashboardSidebarDndValue;

function renderBlockedProject() {
	const { container } = render(
		<SidebarDndContextProvider value={dndValue}>
			<DashboardSidebarCollapsedProjectContent
				data-testid="collapsed-project"
				projectId="alpha"
				projectName="Alpha"
				iconUrl={null}
				projectColor={null}
				isCollapsed
				totalWorkspaceCount={0}
				workspaceShortcutLabels={new Map()}
				onWorkspaceHover={() => {}}
				onToggleCollapse={() => {}}
				isDragBlocked
			/>
		</SidebarDndContextProvider>,
	);
	let attempts = 0;
	const stop = watchBlockedDragAttempts(container, () => {
		attempts += 1;
	});
	const drag = (element: Element) => {
		element.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
		);
		element.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: 50 }),
		);
		element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
	};
	return { stop, drag, attempts: () => attempts };
}

describe("DashboardSidebarCollapsedProjectContent", () => {
	// The workspace icons render inside the outer element, so only the
	// project button may carry the marker.
	test("a blocked collapsed project reports drags on its button but not on its container", () => {
		const { stop, drag, attempts } = renderBlockedProject();

		drag(screen.getByTestId("collapsed-project"));
		expect(attempts()).toBe(0);

		drag(screen.getByRole("button"));
		expect(attempts()).toBe(1);
		stop();
	});
});
