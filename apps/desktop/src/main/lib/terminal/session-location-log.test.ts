import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_SUPERSET_HOME_DIR = join(
	tmpdir(),
	`superset-session-location-log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
);

mock.module("main/lib/app-environment", () => ({
	SUPERSET_HOME_DIR: TEST_SUPERSET_HOME_DIR,
	SUPERSET_SENSITIVE_FILE_MODE: 0o600,
}));

const {
	getSessionLocation,
	updateSessionLocationAgentIdentity,
	upsertSessionLocation,
} = await import("./session-location-log");

describe("session-location-log", () => {
	beforeEach(() => {
		rmSync(TEST_SUPERSET_HOME_DIR, { recursive: true, force: true });
	});

	afterEach(() => {
		rmSync(TEST_SUPERSET_HOME_DIR, { recursive: true, force: true });
	});

	it("preserves an existing agent session id when a follow-up update omits it", async () => {
		upsertSessionLocation({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "workspace-1",
			cwd: "/tmp/workspace",
			pid: 123,
		});
		await getSessionLocation("pane-1");

		updateSessionLocationAgentIdentity({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: "session-1",
		});

		const beforeEmptyUpdate = await getSessionLocation("pane-1");
		expect(beforeEmptyUpdate).toMatchObject({
			agentId: "codex",
			agentSessionId: "session-1",
		});

		updateSessionLocationAgentIdentity({
			paneId: "pane-1",
			agentId: "codex",
			agentSessionId: undefined,
		});

		const afterEmptyUpdate = await getSessionLocation("pane-1");
		expect(afterEmptyUpdate).toMatchObject({
			agentId: "codex",
			agentSessionId: "session-1",
		});
	});
});
