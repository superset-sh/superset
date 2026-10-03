import { describe, expect, test } from "bun:test";
import type { CommandContext } from "../../core/types";
import { openInProvider } from "./commands";

const context: CommandContext = {
	route: { pathname: "/", params: {} },
	workspace: {
		id: "workspace-1",
		name: "Workspace",
		projectId: "project-1",
		preferredOpenInApp: "cursor",
	},
	activeHostUrl: "http://localhost",
	activeOrganizationId: null,
	activeOrganizationName: null,
	hostServiceStatus: "running",
	localMachineId: null,
	notificationSoundsMuted: false,
	isV2CloudEnabled: false,
	navigate: () => {},
	openNewWorkspace: () => {},
};

function commandIds(
	availableExternalApps: CommandContext["availableExternalApps"],
) {
	const commands = openInProvider.provide({
		...context,
		availableExternalApps,
	});
	const menu = commands.find((command) => command.id === "openIn.menu");
	return {
		topLevel: commands.map((command) => command.id),
		children: Array.isArray(menu?.children)
			? menu.children.map((command) => command.id)
			: [],
	};
}

describe("openInProvider", () => {
	test("filters only submenu apps and always keeps Finder", () => {
		const ids = commandIds(["cursor"]);

		expect(ids.children).toEqual(["openIn.finder", "openIn.cursor"]);
		expect(ids.topLevel).toContain("openIn.preferred:cursor");
	});

	test("preserves the unfiltered submenu after a null fallback", () => {
		const ids = commandIds(null);

		expect(ids.children).toContain("openIn.iterm");
		expect(ids.children).toContain("openIn.cursor");
	});
});
