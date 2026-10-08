import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { useNavigate } from "@tanstack/react-router";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import {
	openNewSession,
	openNewWorkspace,
	openNewWorkspaceForLocalProject,
} from "./useOpenNewWorkspace";

const navigate = mock(() => Promise.resolve());
const MACHINE_ID = "this-machine";
const v2 = {
	isV2CloudEnabled: true,
	machineId: MACHINE_ID,
	navigate: navigate as unknown as ReturnType<typeof useNavigate>,
};

function resetStores() {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: null });
	useNewWorkspaceDraftStore.getState().resetDraft();
	useV2WorkspaceCreateDefaultsStore.getState().setLastHostId(null);
	useNewWorkspaceModalStore.getState().closeModal();
}

beforeEach(() => {
	navigate.mockClear();
	resetStores();
});
afterEach(resetStores);

test.each([
	"cloud",
	"other-machine",
])("local project handoff overrides %s while preserving the draft", (hostId) => {
	useNewWorkspaceDraftStore.getState().updateDraft({
		hostId,
		selectedProjectId: "old-project",
		prompt: "Keep my prompt",
		checkout: "local",
	});
	openNewWorkspaceForLocalProject(v2, "new-project");
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			to: "/new-workspace",
			search: { projectId: "new-project", host: "this-machine" },
		}),
	);
	expect(useNewWorkspaceDraftStore.getState()).toMatchObject({
		hostId: "this-machine",
		selectedProjectId: "new-project",
		isSession: false,
		prompt: "Keep my prompt",
		checkout: "local",
	});
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
	openNewWorkspaceForLocalProject(v2, "second-project");
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("this-machine");
});

test("ordinary new workspace navigation preserves the selected remote host", () => {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "other-machine" });
	openNewWorkspace(v2, "existing-project");
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("other-machine");
});

test("project handoff leaves the cloud host for the local machine", () => {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
	openNewWorkspace(v2, "project-a");
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			search: { projectId: "project-a", host: "this-machine" },
		}),
	);
	expect(useNewWorkspaceDraftStore.getState()).toMatchObject({
		hostId: "this-machine",
		selectedProjectId: "project-a",
	});
});

test("project handoff leaves a remembered cloud host before the page restores it", () => {
	useV2WorkspaceCreateDefaultsStore.getState().setLastHostId("cloud");
	openNewWorkspace(v2, "project-a");
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			search: { projectId: "project-a", host: "this-machine" },
		}),
	);
});

test("project handoff keeps a draft remote host over a remembered cloud host", () => {
	useV2WorkspaceCreateDefaultsStore.getState().setLastHostId("cloud");
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "other-machine" });
	openNewWorkspace(v2, "project-a");
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			search: { projectId: "project-a", host: "other-machine" },
		}),
	);
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("other-machine");
});

test("session handoff keeps a draft remote host over a remembered cloud host", () => {
	useV2WorkspaceCreateDefaultsStore.getState().setLastHostId("cloud");
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "other-machine" });
	openNewSession(v2);
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			search: { session: true, host: "other-machine" },
		}),
	);
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("other-machine");
});

test("new workspace without a project keeps the cloud host", () => {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
	openNewWorkspace(v2);
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("cloud");
});

test("session handoff leaves the cloud host and selects the session", () => {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
	openNewSession(v2);
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			search: { session: true, host: "this-machine" },
		}),
	);
	expect(useNewWorkspaceDraftStore.getState()).toMatchObject({
		hostId: "this-machine",
		isSession: true,
	});
});

test("session handoff re-selects the session when the URL already asks for it", () => {
	useNewWorkspaceDraftStore.getState().selectProject("project-a");
	openNewSession(v2);
	expect(useNewWorkspaceDraftStore.getState()).toMatchObject({
		isSession: true,
		selectedProjectId: null,
	});
});

test("v1 local project handoff still opens the project modal", () => {
	openNewWorkspaceForLocalProject(
		{ ...v2, isV2CloudEnabled: false },
		"v1-project",
	);
	expect(navigate).not.toHaveBeenCalled();
	expect(useNewWorkspaceModalStore.getState()).toMatchObject({
		isOpen: true,
		preSelectedProjectId: "v1-project",
	});
});
