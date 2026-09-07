import { v1MigrationState } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { disposeGitTaskRunner } from "lib/trpc/routers/changes/workers/git-task-runner";
import { disposeWorkspaceFilesystem } from "lib/trpc/routers/workspace-fs-service";
import { localDb } from "../local-db";
import { markV1TerminalRetiring } from "../notifications/v1-agent-sessions";
import { getDaemonTerminalManager } from "../terminal/daemon";
import { portManager } from "../terminal/port-manager";
import { getTerminalHostClient } from "../terminal-host/client";
import { getAllWindows, getOrg } from "../window-registry/window-registry";
import { setV1RuntimeRetirementCheck } from "./access";
import { V1RuntimeRetirementController } from "./controller";
import { retireV1Runtime } from "./retire";

export const v1RuntimeRetirement = new V1RuntimeRetirementController(
	() =>
		getAllWindows().map((window) => ({
			id: window.id,
			organizationId: getOrg(window.id),
		})),
	async (stillEligible) => {
		const migratedByOrg = v1RuntimeRetirement.organizationIds().map(
			(organizationId) =>
				new Set(
					localDb
						.select()
						.from(v1MigrationState)
						.where(eq(v1MigrationState.organizationId, organizationId))
						.all()
						.filter(
							(entry) =>
								entry.kind === "workspace" &&
								(entry.status === "success" || entry.status === "linked") &&
								entry.v2Id,
						)
						.map((entry) => entry.v1Id),
				),
		);
		const client = getTerminalHostClient();
		const retired = await retireV1Runtime(
			{
				listSessions: () => client.listSessionsIfRunning(),
				isWorkspaceMigrated: (workspaceId) =>
					migratedByOrg.length > 0 &&
					migratedByOrg.every((ids) => ids.has(workspaceId)),
				shutdown: () => client.shutdownIfRunning({ killSessions: true }),
				beforeShutdown: (sessions) => {
					for (const session of sessions) {
						if (session.isAlive) markV1TerminalRetiring(session.paneId);
					}
				},
				cleanup: async (sessions) => {
					for (const session of sessions)
						portManager.unregisterSession(session.paneId);
					portManager.stopPeriodicScan();
					// reset aborts pending attaches, closes history writers and clears
					// session caches without deleting histories or project rows.
					getDaemonTerminalManager().reset();
					await Promise.all([
						disposeWorkspaceFilesystem(),
						disposeGitTaskRunner(),
					]);
				},
			},
			stillEligible,
		);
		if (retired)
			console.log("[v1-migration] retired v1 runtime after locked migration");
		return retired;
	},
);

setV1RuntimeRetirementCheck(() => v1RuntimeRetirement.isEligible());
