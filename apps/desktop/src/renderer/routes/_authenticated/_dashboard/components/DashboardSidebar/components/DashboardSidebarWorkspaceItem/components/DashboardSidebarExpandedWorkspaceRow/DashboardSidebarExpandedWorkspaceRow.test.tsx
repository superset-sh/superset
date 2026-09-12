import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: Radix needs a real DOM.
// Globals are process-wide, so unregister in afterAll (see Redirect.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("./components/DashboardSidebarWorkspaceChips", () => ({
	DashboardSidebarWorkspaceChips: () => null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
	},
}));
// The stubbed electronTrpc has no `createClient`, so keep the module that
// builds the real clients at import time out of the graph.
mock.module("renderer/lib/trpc-client", () => ({
	electronReactClient: {},
	// The hotkeys layout store subscribes at import time; other test files in
	// the same process load it against this mock.
	electronTrpcClient: {
		keyboardLayout: { changes: { subscribe: () => {} } },
	},
}));
// HotkeyLabel's module graph subscribes to the keyboard-layout IPC on import.
mock.module("renderer/hotkeys", () => ({
	HotkeyLabel: ({ label }: { label: string }) => label,
	useHotkeyDisplay: () => ({ text: "Unassigned" }),
}));

// Queries go through `within(document.body)` rather than `screen`: in a full
// suite run an earlier file may have loaded testing-library against a previous
// happy-dom window, and `screen` stays bound to that stale body.
const { cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { DashboardSidebarExpandedWorkspaceRow } = await import(
	"./DashboardSidebarExpandedWorkspaceRow"
);
type RowProps = Parameters<typeof DashboardSidebarExpandedWorkspaceRow>[0];
type Workspace = RowProps["workspace"];

afterEach(() => {
	cleanup();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function buildWorkspace(overrides: Partial<Workspace> = {}): Workspace {
	return {
		id: "ws-1",
		projectId: "project-1",
		hostId: "host-1",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: true,
		accentColor: null,
		name: "feature-row",
		branch: "feature/row",
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		lastActivityAt: null,
		taskId: null,
		isPinned: false,
		pendingTransaction: null,
		...overrides,
	};
}

function renderRow(overrides: Partial<RowProps> = {}) {
	const onArchiveWorkspaceClick = mock(() => {});
	const onClick = mock(() => {});
	const onKeyboardActivate = mock(() => {});
	render(
		<DashboardSidebarExpandedWorkspaceRow
			workspace={buildWorkspace()}
			isActive={false}
			isRenaming={false}
			renameValue=""
			diffStats={null}
			canArchive
			onArchiveWorkspaceClick={onArchiveWorkspaceClick}
			onClick={onClick}
			onKeyboardActivate={onKeyboardActivate}
			onCloseWorkspaceClick={() => {}}
			onRemoveFromSidebarClick={() => {}}
			onRenameValueChange={() => {}}
			onSubmitRename={() => {}}
			onCancelRename={() => {}}
			{...overrides}
		/>,
	);
	const page = within(document.body);
	return { onArchiveWorkspaceClick, onClick, onKeyboardActivate, page };
}

describe("DashboardSidebarExpandedWorkspaceRow archive action", () => {
	test("a worktree row offers archive next to close", () => {
		const { page } = renderRow();

		expect(page.getByLabelText("Archive workspace")).toBeTruthy();
		expect(page.getByLabelText("Close workspace")).toBeTruthy();
	});

	test("an archived worktree row offers Restore and Delete instead of Archive and Close", () => {
		const onRestore = mock(() => {});
		const onClose = mock(() => {});
		const { page } = renderRow({
			workspace: buildWorkspace({ shelvedAt: Date.now() }),
			onRestoreWorkspaceClick: onRestore,
			onCloseWorkspaceClick: onClose,
		});

		expect(page.queryByLabelText("Archive workspace")).toBeNull();
		expect(page.queryByLabelText("Close workspace")).toBeNull();
		fireEvent.click(page.getByLabelText("Restore workspace"));
		fireEvent.click(page.getByLabelText("Delete workspace"));
		expect(onRestore).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("a session row offers close only", () => {
		const { page } = renderRow({
			workspace: buildWorkspace({ type: "session", projectId: null }),
			canArchive: false,
		});

		expect(page.queryByLabelText("Archive workspace")).toBeNull();
		expect(page.getByLabelText("Close workspace")).toBeTruthy();
	});

	test("the local main row offers neither", () => {
		const { page } = renderRow({
			workspace: buildWorkspace({ type: "main" }),
			canArchive: false,
		});

		expect(page.queryByLabelText("Archive workspace")).toBeNull();
		expect(page.queryByLabelText("Close workspace")).toBeNull();
	});

	test("archive is disabled while the workspace's host is offline", () => {
		const { page, onArchiveWorkspaceClick } = renderRow({
			workspace: buildWorkspace({
				hostType: "remote-device",
				hostIsOnline: false,
			}),
		});

		const button = page.getByLabelText(
			"Archive workspace",
		) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
		expect(onArchiveWorkspaceClick).not.toHaveBeenCalled();
	});

	test("clicking archive archives once without opening the workspace", () => {
		const { page, onArchiveWorkspaceClick, onClick } = renderRow();

		fireEvent.click(page.getByLabelText("Archive workspace"));

		expect(onArchiveWorkspaceClick).toHaveBeenCalledTimes(1);
		expect(onClick).not.toHaveBeenCalled();
	});

	test("Enter and Space on archive do not activate the row", () => {
		const { page, onKeyboardActivate } = renderRow();
		const button = page.getByLabelText("Archive workspace");

		fireEvent.keyDown(button, { key: "Enter" });
		fireEvent.keyDown(button, { key: " " });

		expect(onKeyboardActivate).not.toHaveBeenCalled();
	});
});
