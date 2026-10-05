import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { DashboardSidebarWorkspace } from "../../../../types";

// happy-dom over the preloaded plain-object document: Radix needs a real DOM.
// Globals are process-wide, so unregister in afterAll (see Redirect.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Queries go through `within(document.body)` rather than `screen`: in a full
// suite run an earlier file may have loaded testing-library against a previous
// happy-dom window, and `screen` stays bound to that stale body.
const { cleanup, render, within } = await import("@testing-library/react");
const { DashboardSidebarWorkspaceHoverCardContent } = await import(
	"./DashboardSidebarWorkspaceHoverCardContent"
);

afterEach(() => {
	cleanup();
	document.body.style.pointerEvents = "";
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function workspaceWithName(name: string): DashboardSidebarWorkspace {
	return {
		id: "ws-1",
		projectId: null,
		hostId: "host-1",
		hostType: "local-device",
		type: "session",
		hostIsOnline: true,
		accentColor: null,
		name,
		branch: "main",
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date("2026-09-01T00:00:00Z"),
		updatedAt: new Date("2026-09-01T00:00:00Z"),
		lastActivityAt: null,
		taskId: null,
		isPinned: false,
		pendingTransaction: null,
	};
}

describe("DashboardSidebarWorkspaceHoverCardContent long session name", () => {
	test("an unbreakable name is wrapped, clamped, and fully reachable via tooltip", () => {
		// happy-dom has no layout engine: this asserts the markup shape only.
		// Real overflow verification needs CDP against the running desktop app.
		const longName = `fix_the_thing_that_broke_in_the_importer_pipeline_${"x".repeat(120)}`;
		render(
			<DashboardSidebarWorkspaceHoverCardContent
				workspace={workspaceWithName(longName)}
				diffStats={null}
			/>,
		);
		const name = within(document.body).getByTitle(longName);
		expect(name.textContent).toBe(longName);
		expect(name.className).toMatch(/\bbreak-words\b/);
		expect(name.className).toMatch(/\bline-clamp-2\b/);
	});
});
