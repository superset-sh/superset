import { beforeEach, describe, expect, test } from "bun:test";
import { readSettingsRow } from "./settings";
import { writeSettings } from "./settings/local-settings";
import {
	createLocalSettingsDb,
	withTempSupersetHome,
} from "./settings/test-helpers";
import { createTerminalScript } from "./terminal-scripts";

const home = withTempSupersetHome("superset-cli-scripts-");

beforeEach(() => {
	createLocalSettingsDb(home.dir);
});

describe("createTerminalScript", () => {
	test("appends a legacy-compatible terminal preset", () => {
		const script = createTerminalScript({
			organizationId: "org-a",
			name: " Dev server ",
			commands: [" bun run dev ", " bun run worker "],
			projectIds: ["project-a", "project-a", "project-b"],
			executionMode: "split-pane",
		});

		expect(script).toEqual({
			id: script.id,
			name: "Dev server",
			description: undefined,
			cwd: "",
			commands: ["bun run dev", "bun run worker"],
			projectIds: ["project-a", "project-b"],
			pinnedToBar: true,
			useAsWorkspaceRun: undefined,
			executionMode: "split-pane",
			cliImportPending: true,
			cliTargetOrganizationId: "org-a",
		});
		expect(readSettingsRow()?.terminalPresets).toEqual([script]);
	});

	test("preserves existing terminal scripts", () => {
		writeSettings({
			terminalPresets: [
				{
					id: "existing",
					name: "Existing",
					cwd: "",
					commands: ["echo existing"],
				},
			],
		});

		createTerminalScript({
			organizationId: "org-a",
			name: "New",
			commands: ["echo new"],
			pinnedToBar: false,
		});

		expect(readSettingsRow()?.terminalPresets?.map(({ name }) => name)).toEqual(
			["Existing", "New"],
		);
		expect(readSettingsRow()?.terminalPresets?.[1]?.pinnedToBar).toBe(false);
	});
});
