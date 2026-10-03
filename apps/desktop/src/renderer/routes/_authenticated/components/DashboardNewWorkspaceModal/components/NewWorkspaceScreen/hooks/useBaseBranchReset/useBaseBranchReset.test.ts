import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useBaseBranchReset } = await import("./useBaseBranchReset");
const { useNewWorkspaceDraftStore } = await import(
	"renderer/stores/new-workspace-draft"
);
const { useV2WorkspaceCreateDefaultsStore } = await import(
	"renderer/stores/v2-workspace-create-defaults"
);
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	useNewWorkspaceDraftStore.getState().resetDraft();
	useV2WorkspaceCreateDefaultsStore.setState({ baseBranchesByProjectId: {} });
});

function renderBaseBranch() {
	return renderHook(() => {
		const draft = useNewWorkspaceDraftStore();
		useBaseBranchReset({
			projectId: draft.selectedProjectId,
			hostId: draft.hostId,
			updateDraft: draft.updateDraft,
		});
		return {
			baseBranch: draft.baseBranch,
			baseBranchSource: draft.baseBranchSource,
		};
	});
}

/** What a sidebar "+" does: select the project, then mount the screen. */
function leaveBaseThenSelect(projectId: string) {
	const draft = useNewWorkspaceDraftStore.getState();
	draft.updateDraft({ baseBranch: "develop", baseBranchSource: "local" });
	draft.selectProject(projectId);
}

test("drops a base left over from another project when it mounts", () => {
	leaveBaseThenSelect("superset");

	const { result } = renderBaseBranch();

	expect(result.current).toEqual({ baseBranch: null, baseBranchSource: null });
});

test("applies the project's saved base when it mounts", () => {
	useV2WorkspaceCreateDefaultsStore
		.getState()
		.setBaseBranchDefault("cooknco", "release", "remote-tracking");
	leaveBaseThenSelect("cooknco");

	const { result } = renderBaseBranch();

	expect(result.current).toEqual({
		baseBranch: "release",
		baseBranchSource: "remote-tracking",
	});
});

test("keeps the draft's base while open, and resets it on a project change", () => {
	useNewWorkspaceDraftStore.getState().selectProject("padel-manager");
	const { result } = renderBaseBranch();

	act(() => {
		useNewWorkspaceDraftStore
			.getState()
			.updateDraft({ baseBranch: "hotfix", baseBranchSource: "local" });
		useV2WorkspaceCreateDefaultsStore
			.getState()
			.setBaseBranchDefault("padel-manager", "staging", "local");
	});
	expect(result.current.baseBranch).toBe("hotfix");

	act(() => {
		useNewWorkspaceDraftStore.getState().selectProject("superset");
	});
	expect(result.current).toEqual({ baseBranch: null, baseBranchSource: null });
});

test("re-seeds the project's saved base when the host changes", () => {
	useV2WorkspaceCreateDefaultsStore
		.getState()
		.setBaseBranchDefault("cooknco", "release", "remote-tracking");
	useNewWorkspaceDraftStore.getState().selectProject("cooknco");
	const { result } = renderBaseBranch();

	act(() => {
		useNewWorkspaceDraftStore
			.getState()
			.updateDraft({ baseBranch: "hotfix", baseBranchSource: "local" });
	});
	expect(result.current.baseBranch).toBe("hotfix");

	act(() => {
		useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "other-host" });
	});
	expect(result.current).toEqual({
		baseBranch: "release",
		baseBranchSource: "remote-tracking",
	});
});
