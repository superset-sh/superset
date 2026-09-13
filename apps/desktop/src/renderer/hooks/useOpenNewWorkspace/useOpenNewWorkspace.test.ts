import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const navigate = mock(() => Promise.resolve());
let v2Enabled = true;
mock.module("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
mock.module("renderer/hooks/useIsV2CloudEnabled", () => ({
	useIsV2CloudEnabled: () => v2Enabled,
}));
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ machineId: "this-machine" }),
	}),
);

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useNewWorkspaceDraftStore } = await import(
	"renderer/stores/new-workspace-draft"
);
const { useNewWorkspaceModalStore } = await import(
	"renderer/stores/new-workspace-modal"
);
const { useOpenNewWorkspace, useOpenNewWorkspaceForLocalProject } =
	await import("./useOpenNewWorkspace");

beforeEach(() => {
	navigate.mockClear();
	v2Enabled = true;
	useNewWorkspaceDraftStore.getState().resetDraft();
});
afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

test.each([
	"cloud",
	"other-machine",
])("local project handoff overrides %s while preserving the draft", (hostId) => {
	useNewWorkspaceDraftStore
		.getState()
		.updateDraft({ hostId, prompt: "Keep my prompt", checkout: "local" });
	const { result } = renderHook(useOpenNewWorkspaceForLocalProject);
	act(() => result.current("new-project"));
	expect(navigate).toHaveBeenCalledWith({
		to: "/new-workspace",
		search: { projectId: "new-project", host: "this-machine" },
	});
	expect(useNewWorkspaceDraftStore.getState()).toMatchObject({
		hostId: "this-machine",
		prompt: "Keep my prompt",
		checkout: "local",
	});
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
	act(() => result.current("second-project"));
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("this-machine");
});

test("ordinary new workspace navigation preserves the selected remote host", () => {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "other-machine" });
	const { result } = renderHook(useOpenNewWorkspace);
	act(() => result.current("existing-project"));
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("other-machine");
});

test("v1 local project handoff still opens the project modal", () => {
	v2Enabled = false;
	const { result } = renderHook(useOpenNewWorkspaceForLocalProject);
	act(() => result.current("v1-project"));
	expect(navigate).not.toHaveBeenCalled();
	expect(useNewWorkspaceModalStore.getState()).toMatchObject({
		isOpen: true,
		preSelectedProjectId: "v1-project",
	});
});
