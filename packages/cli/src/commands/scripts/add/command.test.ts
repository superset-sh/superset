import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeConfig } from "../../../lib/config";
import { readSettingsRow } from "../../../lib/settings";
import {
	createLocalSettingsDb,
	withTempSupersetHome,
} from "../../../lib/settings/test-helpers";
import scriptsMeta from "../meta";
import addScriptCommand from "./command";

const home = withTempSupersetHome("superset-cli-script-command-");
let previousOrgOverride: string | undefined;

function invoke(overrides: Record<string, unknown> = {}) {
	return addScriptCommand.run({
		ctx: {} as never,
		args: {} as never,
		options: {
			name: "Services",
			command: ["bun run api", "bun run web"],
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	previousOrgOverride = process.env.SUPERSET_ORGANIZATION_ID;
	delete process.env.SUPERSET_ORGANIZATION_ID;
	// Port 9 (discard) has no listener, so no desktop app acknowledges.
	process.env.DESKTOP_NOTIFICATIONS_PORT = "9";
	createLocalSettingsDb(home.dir);
	writeConfig({ organizationId: "org-a" });
});

afterEach(() => {
	delete process.env.DESKTOP_NOTIFICATIONS_PORT;
	if (previousOrgOverride === undefined)
		delete process.env.SUPERSET_ORGANIZATION_ID;
	else process.env.SUPERSET_ORGANIZATION_ID = previousOrgOverride;
});

describe("scripts add", () => {
	test("persists repeated commands and command options", async () => {
		const result = (await invoke({
			hidden: true,
			workspaceRun: true,
			executionMode: "new-tab-split-pane",
			project: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
		})) as {
			data: { commands: string[]; pinnedToBar: boolean };
			message: string;
		};

		expect(result.data.commands).toEqual(["bun run api", "bun run web"]);
		expect(result.data.pinnedToBar).toBe(false);
		expect(result.message).toContain("first matching script wins");
		expect(readSettingsRow()?.terminalPresets?.[0]).toMatchObject({
			projectIds: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
			useAsWorkspaceRun: true,
			executionMode: "new-tab-split-pane",
		});
	});

	test("rejects malformed project ids before writing", async () => {
		await expect(invoke({ project: ["not-a-uuid"] })).rejects.toThrow(
			/Invalid project UUID/,
		);
		expect(readSettingsRow()).toBeUndefined();
	});

	test("requires an active organization", async () => {
		writeConfig({});
		await expect(invoke()).rejects.toThrow(/No active organization/);
		expect(readSettingsRow()).toBeUndefined();
	});

	test("honors the SUPERSET_ORGANIZATION_ID override like other commands", async () => {
		writeConfig({});
		process.env.SUPERSET_ORGANIZATION_ID = "org-env";
		await invoke();
		expect(
			readSettingsRow()?.terminalPresets?.[0]?.cliTargetOrganizationId,
		).toBe("org-env");
	});

	test("keeps presets as a compatibility alias", () => {
		expect(scriptsMeta.aliases).toContain("presets");
	});
});
