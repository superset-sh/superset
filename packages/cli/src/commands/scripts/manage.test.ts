import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readSettingsRow } from "../../lib/settings";
import { writeSettings } from "../../lib/settings/local-settings";
import {
	createLocalSettingsDb,
	withTempSupersetHome,
} from "../../lib/settings/test-helpers";

let activeOrganizationId: string | undefined = "org-a";
let desktopRefreshed = false;

const realConfig = await import("../../lib/config");
mock.module("../../lib/config", () => ({
	...realConfig,
	readConfig: () => ({ organizationId: activeOrganizationId }),
}));

mock.module("../../lib/settings/notify", () => ({
	notifyDesktopSettingsChanged: async () => desktopRefreshed,
}));

const { default: addCommand } = await import("./add/command");
const { default: listCommand } = await import("./list/command");
const { default: editCommand } = await import("./edit/command");
const { default: deleteCommand } = await import("./delete/command");

const home = withTempSupersetHome("superset-cli-scripts-manage-");
let previousOrgOverride: string | undefined;

type Result = { data: Record<string, unknown>; message?: string };

function run(
	cmd: { run: (input: never) => unknown },
	input: { args?: Record<string, unknown>; options?: Record<string, unknown> },
) {
	return cmd.run({
		ctx: {} as never,
		args: (input.args ?? {}) as never,
		options: (input.options ?? {}) as never,
		signal: new AbortController().signal,
	} as never) as Promise<Result>;
}

const PROJECT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function seedImported() {
	writeSettings({
		terminalPresets: [
			{
				id: "gh-1",
				name: "Open in GitHub",
				cwd: "",
				commands: ["gh pr view"],
				pinnedToBar: true,
			},
		],
	});
}

beforeEach(() => {
	previousOrgOverride = process.env.SUPERSET_ORGANIZATION_ID;
	delete process.env.SUPERSET_ORGANIZATION_ID;
	activeOrganizationId = "org-a";
	desktopRefreshed = false;
	createLocalSettingsDb(home.dir);
});

afterEach(() => {
	if (previousOrgOverride === undefined)
		delete process.env.SUPERSET_ORGANIZATION_ID;
	else process.env.SUPERSET_ORGANIZATION_ID = previousOrgOverride;
});

describe("scripts list", () => {
	test("shows every stored script with its sync status", async () => {
		seedImported();
		await run(addCommand, {
			options: { name: "Dev", command: ["bun run dev"] },
		});

		const result = (await run(listCommand, {})) as unknown as {
			data: Array<Record<string, unknown>>;
		};

		expect(result.data.map((s) => [s.name, s.status])).toEqual([
			["Open in GitHub", "ready"],
			["Dev", "importing"],
		]);
		expect(result.data[0]).not.toHaveProperty("cliImportPending");
		expect(listCommand.display?.(result.data)).toContain("Open in GitHub");
	});

	test("renders an empty table without a database row", async () => {
		const result = (await run(listCommand, {})) as unknown as {
			data: unknown[];
		};
		expect(result.data).toEqual([]);
		expect(listCommand.display?.(result.data)).toBe("No results.");
	});
});

describe("scripts edit", () => {
	test("patches the row and re-flags it for the desktop", async () => {
		seedImported();
		desktopRefreshed = true;

		const result = await run(editCommand, {
			args: { id: "gh-1" },
			options: {
				command: ["gh pr view --web"],
				project: [PROJECT_ID],
				hidden: true,
			},
		});

		expect(result.data).toMatchObject({
			id: "gh-1",
			commands: ["gh pr view --web"],
			projectIds: [PROJECT_ID],
			pinnedToBar: false,
			status: "importing",
		});
		expect(result.message).toContain("refreshed immediately");
		expect(readSettingsRow()?.terminalPresets?.[0]).toMatchObject({
			cliImportPending: true,
			cliTargetOrganizationId: "org-a",
		});
	});

	test("--no-hidden and --all-projects undo earlier choices", async () => {
		seedImported();
		await run(editCommand, {
			args: { id: "gh-1" },
			options: { project: [PROJECT_ID], hidden: true, workspaceRun: true },
		});

		const result = await run(editCommand, {
			args: { id: "gh-1" },
			options: { allProjects: true, hidden: false, workspaceRun: false },
		});

		expect(result.data).toMatchObject({
			projectIds: null,
			pinnedToBar: true,
			useAsWorkspaceRun: undefined,
		});
	});

	test("rejects empty patches, bad ids, and conflicting project flags", async () => {
		seedImported();
		await expect(
			run(editCommand, { args: { id: "gh-1" }, options: {} }),
		).rejects.toThrow(/No fields to update/);
		await expect(
			run(editCommand, {
				args: { id: "gh-1" },
				options: { project: [PROJECT_ID], allProjects: true },
			}),
		).rejects.toThrow(/Cannot combine/);
		await expect(
			run(editCommand, {
				args: { id: "gh-1" },
				options: { project: ["nope"] },
			}),
		).rejects.toThrow(/Invalid project UUID/);
		await expect(
			run(editCommand, { args: { id: "missing" }, options: { name: "x" } }),
		).rejects.toThrow(/not found/);
		expect(readSettingsRow()?.terminalPresets?.[0]?.cliImportPending).toBe(
			undefined,
		);
	});

	test("requires an active organization", async () => {
		seedImported();
		activeOrganizationId = undefined;
		await expect(
			run(editCommand, { args: { id: "gh-1" }, options: { name: "x" } }),
		).rejects.toThrow(/No active organization/);
	});
});

describe("scripts delete", () => {
	test("tombstones a script the desktop has not acknowledged yet", async () => {
		const added = await run(addCommand, {
			options: { name: "Temp", command: ["echo temp"] },
		});

		const result = await run(deleteCommand, {
			args: { id: added.data.id },
		});

		expect(result.data).toMatchObject({
			id: added.data.id,
			status: "deleting",
		});
		const stored = readSettingsRow()?.terminalPresets?.[0];
		expect(stored?.cliDeletePending).toBe(true);
		expect(stored?.cliImportPending).toBeUndefined();
	});

	test("tombstones an imported script until the desktop removes its copy", async () => {
		seedImported();

		const result = await run(deleteCommand, { args: { id: "gh-1" } });

		expect(result.data).toMatchObject({ id: "gh-1", status: "deleting" });
		expect(result.message).toContain("when the desktop app opens");
		expect(readSettingsRow()?.terminalPresets?.[0]).toMatchObject({
			cliDeletePending: true,
			cliTargetOrganizationId: "org-a",
		});
	});

	test("rejects unknown ids", async () => {
		await expect(
			run(deleteCommand, { args: { id: "missing" } }),
		).rejects.toThrow(/not found/);
	});
});

describe("scripts add --upsert", () => {
	test("replaces the script with the same name instead of duplicating it", async () => {
		seedImported();

		const result = await run(addCommand, {
			options: {
				name: "Open in GitHub",
				command: ["gh pr view --web"],
				hidden: true,
				upsert: true,
			},
		});

		expect(result.message).toMatch(
			/^Updated terminal script Open in GitHub \(gh-1\)/,
		);
		expect(readSettingsRow()?.terminalPresets).toEqual([
			{
				id: "gh-1",
				name: "Open in GitHub",
				description: undefined,
				cwd: "",
				commands: ["gh pr view --web"],
				projectIds: null,
				pinnedToBar: false,
				useAsWorkspaceRun: undefined,
				executionMode: "new-tab",
				cliImportPending: true,
				cliTargetOrganizationId: "org-a",
			},
		]);
	});

	test("adds normally when no script has that name", async () => {
		seedImported();

		const result = await run(addCommand, {
			options: { name: "Other", command: ["echo"], upsert: true },
		});

		expect(result.message).toMatch(/^Added terminal script Other/);
		expect(readSettingsRow()?.terminalPresets).toHaveLength(2);
	});

	test("refuses when the name is already duplicated", async () => {
		writeSettings({
			terminalPresets: [
				{ id: "a", name: "Dup", cwd: "", commands: ["echo"] },
				{ id: "b", name: "Dup", cwd: "", commands: ["echo"] },
			],
		});

		await expect(
			run(addCommand, {
				options: { name: "Dup", command: ["echo 2"], upsert: true },
			}),
		).rejects.toThrow(/2 scripts are named Dup/);
		expect(readSettingsRow()?.terminalPresets).toHaveLength(2);
	});
});
