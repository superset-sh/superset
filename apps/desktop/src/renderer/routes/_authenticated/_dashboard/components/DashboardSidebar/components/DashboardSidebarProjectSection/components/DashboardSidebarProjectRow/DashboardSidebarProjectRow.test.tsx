import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, screen } = await import("@testing-library/react");
const { watchBlockedDragAttempts } = await import(
	"../../../../hooks/useBlockedDragNotice/watchBlockedDragAttempts"
);
const { DashboardSidebarProjectRow } = await import(
	"./DashboardSidebarProjectRow"
);

afterEach(cleanup);

function renderBlockedProject() {
	const { container } = render(
		<div>
			<DashboardSidebarProjectRow
				projectName="Alpha"
				iconUrl={null}
				projectColor={null}
				isCollapsed={false}
				isRenaming={false}
				renameValue=""
				onRenameValueChange={() => {}}
				onSubmitRename={() => {}}
				onCancelRename={() => {}}
				onToggleCollapse={() => {}}
				onNewWorkspace={() => {}}
				isDragBlocked
			/>
			<div>workspace row</div>
		</div>,
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

describe("DashboardSidebarProjectRow", () => {
	// A name order blocks project drags but not the workspace rows beneath.
	test("a blocked project row reports drags on itself but not on rows beneath it", () => {
		const { stop, drag, attempts } = renderBlockedProject();

		drag(screen.getByText("workspace row"));
		expect(attempts()).toBe(0);

		drag(screen.getByText("Alpha"));
		expect(attempts()).toBe(1);
		stop();
	});
});
