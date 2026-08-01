import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// electronTrpc hooks require the tRPC React provider at runtime; the row only
// uses `external.openUrl.useMutation()` to open the PR on click, which is
// irrelevant to static markup. Stub it so the component renders standalone.
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		// Sibling modules (e.g. trpc-client) build the real client at import
		// time; keep a no-op so importing the row doesn't crash.
		createClient: () => ({}),
		external: {
			openUrl: {
				useMutation: () => ({ mutate: () => {} }),
			},
		},
	},
}));

const { DashboardSidebarExpandedWorkspaceRow } = await import(
	"./DashboardSidebarExpandedWorkspaceRow"
);

type Workspace = import("../../../../types").DashboardSidebarWorkspace;

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
	return {
		id: "ws-1",
		projectId: "proj-1",
		hostId: "host-1",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: true,
		accentColor: null,
		name: "feature-branch",
		branch: "feature-branch",
		pullRequest: {
			url: "https://github.com/acme/repo/pull/123",
			number: 123,
			title: "Add a thing",
			state: "open",
			reviewDecision: null,
			checksStatus: "none",
			checks: [],
		},
		repoUrl: null,
		branchExistsOnRemote: true,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		taskId: null,
		pendingTransaction: null,
		...overrides,
	};
}

const noop = () => {};

function renderRow(workspace: Workspace): string {
	return renderToStaticMarkup(
		<DashboardSidebarExpandedWorkspaceRow
			workspace={workspace}
			isActive={false}
			isRenaming={false}
			renameValue=""
			diffStats={null}
			onClick={noop}
			onDoubleClick={noop}
			onCloseWorkspaceClick={noop}
			onRemoveFromSidebarClick={noop}
			onRenameValueChange={noop}
			onSubmitRename={noop}
			onCancelRename={noop}
		/>,
	);
}

describe("DashboardSidebarExpandedWorkspaceRow PR number", () => {
	it("shows the PR number as visible text in the row (issue #5858)", () => {
		const markup = renderRow(makeWorkspace());

		// The PR icon's aria-label always contains "#123"; that alone is not the
		// bug's regression. The regression is that the number is no longer
		// rendered as *visible* text — historically it lived only inside the
		// hover Tooltip (a closed Radix portal, absent from static markup). So a
		// fixed row must surface "#123" at least twice: once in the aria-label,
		// and once as inline visible text.
		const occurrences = markup.split("#123").length - 1;
		expect(occurrences).toBeGreaterThanOrEqual(2);
	});

	it("omits a PR number when the workspace has no pull request", () => {
		const markup = renderRow(makeWorkspace({ pullRequest: null }));
		expect(markup).not.toContain("#123");
	});
});
