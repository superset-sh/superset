import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: Radix needs a real DOM.
// Globals are process-wide, so unregister in afterAll (see Redirect.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("renderer/hotkeys", () => ({
	HotkeyLabel: ({ label }: { label: string }) => label,
	useHotkeyDisplay: () => ({ text: "Unassigned" }),
}));
mock.module("../../../../hooks/useDashboardSidebarPortKill", () => ({
	useDashboardSidebarPortKill: () => ({
		isPending: false,
		killPorts: () => Promise.resolve(),
	}),
}));
mock.module("../../../../hooks/useProjectTagFolderSections", () => ({
	useProjectTagFolderSections: () => ({ sections: [] }),
}));
mock.module("../../../../providers/DashboardSidebarHoverProvider", () => ({
	useDashboardSidebarHoverActions: () => ({ setContextMenuOpen: () => {} }),
}));
mock.module("../../../../providers/DashboardSidebarPortsProvider", () => ({
	useDashboardSidebarWorkspacePorts: () => null,
}));

// Queries go through `within(document.body)` rather than `screen`: in a full
// suite run an earlier file may have loaded testing-library against a previous
// happy-dom window, and `screen` stays bound to that stale body.
const { cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { DashboardSidebarWorkspaceContextMenu } = await import(
	"./DashboardSidebarWorkspaceContextMenu"
);
type MenuProps = Parameters<typeof DashboardSidebarWorkspaceContextMenu>[0];

afterEach(() => {
	cleanup();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function renderMenu(overrides: Partial<MenuProps> = {}) {
	const noop = () => {};
	render(
		<DashboardSidebarWorkspaceContextMenu
			workspaceId="ws-1"
			projectId="project-1"
			isLocalWorkspace
			isPinned={false}
			isUnread={false}
			hasStatus={false}
			hasPullRequest={false}
			onTogglePin={noop}
			onCreateSection={noop}
			onMoveToSection={noop}
			onOpenInFinder={noop}
			onCopyPath={noop}
			onCopyBranchName={noop}
			onCopyWorkspaceId={noop}
			onRemoveFromSidebar={noop}
			onToggleUnread={noop}
			onClearStatus={noop}
			onRemovePullRequest={noop}
			{...overrides}
		>
			<button type="button">row</button>
		</DashboardSidebarWorkspaceContextMenu>,
	);
	const body = within(document.body);
	fireEvent.contextMenu(body.getByText("row"));
	return body;
}

describe("DashboardSidebarWorkspaceContextMenu", () => {
	test("shows Archive when onArchive is provided", () => {
		const body = renderMenu({ onArchive: () => {} });
		expect(body.getByText("Archive")).toBeDefined();
	});

	test("hides Archive when onArchive is omitted", () => {
		const body = renderMenu();
		expect(body.queryByText("Archive")).toBeNull();
	});

	test("selecting Archive calls onArchive", () => {
		const onArchive = mock(() => {});
		const body = renderMenu({ onArchive });
		fireEvent.click(body.getByText("Archive"));
		expect(onArchive).toHaveBeenCalledTimes(1);
	});
});
