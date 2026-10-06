import { beforeEach, describe, expect, test } from "bun:test";
import { useContentSearchStore } from "renderer/commandPalette/ui/ContentSearch/contentSearchStore";
import type { CommandContext } from "../../core/types";
import { workspaceProvider } from "./commands";

const context: CommandContext = {
	route: { pathname: "/v2-workspace/workspace-1", params: {} },
	workspace: {
		id: "workspace-1",
		name: "Workspace",
		projectId: "project-1",
	},
	activeHostUrl: null,
	activeOrganizationId: null,
	activeOrganizationName: null,
	hostServiceStatus: "running",
	localMachineId: null,
	notificationSoundsMuted: false,
	isV2CloudEnabled: true,
	navigate: () => {},
	openNewWorkspace: () => {},
};

beforeEach(() => {
	useContentSearchStore.setState({ open: false, target: null });
});

describe("workspace commands", () => {
	test("Search in Files targets the current workspace", async () => {
		const command = workspaceProvider
			.provide(context)
			.find((candidate) => candidate.id === "files.searchContents");

		expect(command).toBeDefined();
		expect(command?.hotkeyId).toBe("SEARCH_IN_FILES");
		await command?.run?.(context);
		expect(useContentSearchStore.getState()).toMatchObject({
			open: true,
			target: { workspaceId: "workspace-1" },
		});
	});
});
