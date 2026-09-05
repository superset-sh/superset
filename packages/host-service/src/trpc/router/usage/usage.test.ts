import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { quotaEntryKey } from "../../../account-engine/quota-store.ts";
import type { HostDb } from "../../../db/index.ts";
import type { HostServiceContext } from "../../../types.ts";
import type { UsageAccount } from "./types.ts";
import { usageRouter } from "./usage.ts";

// Paths under the real home (Bun's os.homedir() ignores $HOME, and
// profile-remove.ts refuses anything outside it) that are never created: the
// removal itself is `rm --force`, so a missing dir keeps this test hermetic.
const ACTIVE_DIR = join(homedir(), ".claude-usage-router-test-active");
const SPARE_DIR = join(homedir(), ".claude-usage-router-test-spare");

function account(overrides: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "key",
		sourceLabel: "~/.claude",
		email: null,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		accountId: null,
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	};
}

/**
 * R25: the active account is what every running session is signed in as, so
 * its dir can only be deleted after another account has become active.
 */
describe("usageRouter.removeAccount", () => {
	let home: string;
	let previousHome: string | undefined;
	const invalidate = mock((_key: string) => {});

	function context(): HostServiceContext {
		return {
			isAuthenticated: true,
			db: {
				select: () => ({
					from: () => ({
						get: () => ({
							defaultClaudeConfigDir: null,
							defaultCodexHome: null,
						}),
					}),
				}),
				insert: () => ({
					values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
				}),
			} as unknown as HostDb,
			runtime: {
				quotaStore: {
					read: async () => [
						account({ accountId: "uuid-a", selection: ACTIVE_DIR }),
						account({ accountId: "uuid-b", selection: SPARE_DIR }),
					],
					invalidate,
				},
			},
		} as unknown as HostServiceContext;
	}

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-remove-account-"));
		process.env.SUPERSET_HOME_DIR = home;
		const stateDir = join(home, "state", "account-engine");
		mkdirSync(stateDir, { recursive: true, mode: 0o700 });
		writeFileSync(
			join(stateDir, "runtime.json"),
			JSON.stringify({
				version: 1,
				perAgent: {
					claude: {
						cooldownUntil: null,
						exhaustedNotifiedAt: null,
						fallbackTimestamps: [],
						activeAccountId: "uuid-a",
						activeSelection: ACTIVE_DIR,
					},
					codex: {
						cooldownUntil: null,
						exhaustedNotifiedAt: null,
						fallbackTimestamps: [],
						activeAccountId: null,
						activeSelection: null,
					},
				},
				identityBindings: {},
			}),
			{ mode: 0o600 },
		);
		invalidate.mockClear();
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("refuses the active account and says to switch first", async () => {
		await expect(
			usageRouter
				.createCaller(context())
				.removeAccount({ agent: "claude", selection: ACTIVE_DIR }),
		).rejects.toThrow(/switch/i);
		expect(invalidate).not.toHaveBeenCalled();
	});

	it("removes an account that is not active and drops its store entry", async () => {
		await usageRouter
			.createCaller(context())
			.removeAccount({ agent: "claude", selection: SPARE_DIR });

		expect(invalidate).toHaveBeenCalledWith(quotaEntryKey("claude", SPARE_DIR));
	});
});
