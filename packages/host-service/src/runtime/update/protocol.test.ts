import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	acquireUpdateLock,
	readUpdateLock,
	releaseUpdateLock,
	transferUpdateLock,
} from "./lock";
import { updateLockPath } from "./paths";
import {
	clearUpdateResult,
	getHostUpdateStatus,
	readUpdateResult,
	writeUpdateResult,
} from "./status";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000123";

function withTempHome(run: (homeDir: string) => void): void {
	const homeDir = mkdtempSync(join(tmpdir(), "host-update-protocol-"));
	try {
		run(homeDir);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
}

describe("host update protocol", () => {
	test("hands exclusive lock ownership to the supervisor", () => {
		withTempHome((homeDir) => {
			const acquired = acquireUpdateLock({
				organizationId: ORGANIZATION_ID,
				ownerPid: 100,
				targetVersion: "1.15.0",
				previousVersion: "1.14.0",
				homeDir,
				now: 1234,
				isOwnerAlive: () => false,
			});
			expect(acquired.acquired).toBe(true);

			const blocked = acquireUpdateLock({
				organizationId: ORGANIZATION_ID,
				ownerPid: 101,
				targetVersion: "1.16.0",
				previousVersion: "1.14.0",
				homeDir,
				isOwnerAlive: () => true,
			});
			expect(blocked.acquired).toBe(false);

			transferUpdateLock({
				organizationId: ORGANIZATION_ID,
				fromPid: 100,
				toPid: 200,
				homeDir,
			});
			expect(readUpdateLock(ORGANIZATION_ID, homeDir)).toEqual({
				pid: 200,
				targetVersion: "1.15.0",
				previousVersion: "1.14.0",
				startedAt: 1234,
			});
			expect(
				releaseUpdateLock({
					organizationId: ORGANIZATION_ID,
					ownerPid: 100,
					homeDir,
				}),
			).toBe(false);
			expect(
				releaseUpdateLock({
					organizationId: ORGANIZATION_ID,
					ownerPid: 200,
					homeDir,
				}),
			).toBe(true);
			expect(readUpdateLock(ORGANIZATION_ID, homeDir)).toBeNull();
		});
	});

	test("reports live and unexpectedly-dead supervisor states", () => {
		withTempHome((homeDir) => {
			acquireUpdateLock({
				organizationId: ORGANIZATION_ID,
				ownerPid: 200,
				targetVersion: "1.15.0",
				previousVersion: "1.14.0",
				homeDir,
				now: 1234,
				isOwnerAlive: () => false,
			});

			expect(
				getHostUpdateStatus({
					organizationId: ORGANIZATION_ID,
					homeDir,
					isOwnerAlive: () => true,
				}),
			).toEqual({
				status: "updating",
				targetVersion: "1.15.0",
				previousVersion: "1.14.0",
				startedAt: 1234,
			});

			const failed = getHostUpdateStatus({
				organizationId: ORGANIZATION_ID,
				homeDir,
				isOwnerAlive: () => false,
				now: 5678,
			});
			expect(failed).toEqual({
				status: "failed",
				targetVersion: "1.15.0",
				previousVersion: "1.14.0",
				error: "Update supervisor exited before reporting a result",
				completedAt: 5678,
			});
			expect(readUpdateLock(ORGANIZATION_ID, homeDir)).toBeNull();
		});
	});

	test("persists bounded result data and clears it", () => {
		withTempHome((homeDir) => {
			writeUpdateResult(
				ORGANIZATION_ID,
				{
					status: "failed",
					targetVersion: "1.15.0",
					previousVersion: "1.14.0",
					error: "x".repeat(2_000),
					completedAt: 5678,
				},
				homeDir,
			);
			const result = readUpdateResult(ORGANIZATION_ID, homeDir);
			expect(result?.error).toHaveLength(1_000);
			clearUpdateResult(ORGANIZATION_ID, homeDir);
			expect(readUpdateResult(ORGANIZATION_ID, homeDir)).toBeNull();
			expect(updateLockPath(ORGANIZATION_ID, homeDir)).toContain(
				join("host", ORGANIZATION_ID, "update.lock"),
			);
		});
	});
});
