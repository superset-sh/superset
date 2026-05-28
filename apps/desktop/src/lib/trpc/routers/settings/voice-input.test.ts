import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../../../../../../packages/local-db/src";

const sqlite = new Database(":memory:");

function createPreVoiceInputSettingsTable() {
	sqlite.exec(`
	DROP TABLE IF EXISTS settings;
	CREATE TABLE settings (
		id integer PRIMARY KEY DEFAULT 1,
		last_active_workspace_id text,
		terminal_presets text,
		terminal_presets_initialized integer,
		agent_preset_overrides text,
		agent_custom_definitions text,
		agent_preset_permissions_migrated_at integer,
		selected_ringtone_id text,
		active_organization_id text,
		confirm_on_quit integer,
		terminal_link_behavior text,
		persist_terminal integer DEFAULT true,
		auto_apply_default_preset integer,
		branch_prefix_mode text,
		branch_prefix_custom text,
		notification_sounds_muted integer,
		notification_volume integer,
		delete_local_branch integer,
		file_open_mode text,
		show_presets_bar integer,
		use_compact_terminal_add_button integer,
		terminal_font_family text,
		terminal_font_size integer,
		editor_font_family text,
		editor_font_size integer,
		show_resource_monitor integer,
		worktree_base_dir text,
		open_links_in_app integer,
		default_editor text,
		expose_host_service_via_relay integer
	);
`);
}

function applyVoiceInputMigration() {
	const migrationSql = readFileSync(
		resolve(
			process.cwd(),
			"packages/local-db/drizzle/0042_add_voice_input_enabled.sql",
		),
		"utf8",
	);

	for (const statement of migrationSql.split("--> statement-breakpoint")) {
		const trimmedStatement = statement.trim();
		if (trimmedStatement.length > 0) {
			sqlite.exec(trimmedStatement);
		}
	}
}

const testLocalDb = drizzle(sqlite, { schema });

mock.module("@superset/local-db", () => schema);

const getHostServiceCoordinatorMock = mock(() => ({
	getActiveOrganizationIds: () => [],
	restartAll: async () => {},
}));
const loadTokenMock = mock(async () => ({ token: null }));

mock.module("electron", () => ({
	app: {
		relaunch: mock(() => {}),
	},
}));

mock.module("main/env.main", () => ({
	env: {
		NODE_ENV: "test",
		NEXT_PUBLIC_API_URL: "https://api.superset.test",
	},
}));

mock.module("main/index", () => ({
	exitImmediately: mock(() => {}),
}));

mock.module("main/lib/custom-ringtones", () => ({
	hasCustomRingtone: mock(() => false),
}));

mock.module("main/lib/host-service-coordinator", () => ({
	getHostServiceCoordinator: getHostServiceCoordinatorMock,
}));

mock.module("main/lib/local-db", () => ({
	localDb: testLocalDb,
}));

mock.module("../auth/utils/auth-functions", () => ({
	loadToken: loadTokenMock,
}));

mock.module("../workspaces/utils/git", () => ({
	NotGitRepoError: class NotGitRepoError extends Error {},
	getGitAuthorName: mock(async () => null),
	getGitHubUsername: mock(async () => null),
}));

const { createSettingsRouter } = await import("./index");

function createCaller() {
	return createSettingsRouter().createCaller({});
}

describe("voice input settings", () => {
	beforeEach(() => {
		createPreVoiceInputSettingsTable();
		applyVoiceInputMigration();
		getHostServiceCoordinatorMock.mockClear();
		loadTokenMock.mockClear();
	});

	it("returnsDefaultDisabledVoiceInputSetting", async () => {
		const caller = createCaller();

		expect(await caller.getVoiceInputEnabled()).toBe(false);
	});

	it("persistsVoiceInputEnabledSetting", async () => {
		const caller = createCaller();

		await caller.setVoiceInputEnabled({ enabled: true });
		expect(await caller.getVoiceInputEnabled()).toBe(true);

		await caller.setVoiceInputEnabled({ enabled: false });
		expect(await caller.getVoiceInputEnabled()).toBe(false);
	});

	it("exposesVoiceInputInGetSettings", async () => {
		const caller = createCaller();

		await caller.setVoiceInputEnabled({ enabled: true });

		expect(await caller.getSettings()).toMatchObject({
			confirmOnQuit: true,
			fileOpenMode: "split-pane",
			openLinksInApp: false,
			showResourceMonitor: true,
			terminalLinkBehavior: "file-viewer",
			voiceInputEnabled: true,
		});
	});

	it("keepsVoiceSettingsLocalOnly", async () => {
		const caller = createCaller();

		await caller.setVoiceInputEnabled({ enabled: true });
		expect(await caller.getVoiceInputEnabled()).toBe(true);

		const payload = await caller.getSettings();
		expect(payload).not.toHaveProperty("activeOrganizationId");
		expect(getHostServiceCoordinatorMock).not.toHaveBeenCalled();
		expect(loadTokenMock).not.toHaveBeenCalled();
	});
});
