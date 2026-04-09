import { sshWorkspaceConfigSchema, workspaces } from "@superset/local-db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { app } from "electron";
import { localDb } from "main/lib/local-db";
import { SshConnectionManager } from "./connection-manager";

export class SshReconnectionManager {
	async reconcileOnStartup(): Promise<void> {
		const userData = app.getPath("userData");
		await SshConnectionManager.cleanupStale(userData);

		const orphanedResult = localDb
			.delete(workspaces)
			.where(and(eq(workspaces.type, "ssh"), isNull(workspaces.sshConfig)))
			.run();

		if (orphanedResult.changes > 0) {
			console.warn(
				`[SshReconnectionManager] Deleted ${orphanedResult.changes} orphaned SSH workspace(s)`,
			);
		}

		const sshWorkspaces = localDb
			.select({
				id: workspaces.id,
				sshConfig: workspaces.sshConfig,
			})
			.from(workspaces)
			.where(and(eq(workspaces.type, "ssh"), isNotNull(workspaces.sshConfig)))
			.all();

		for (const workspace of sshWorkspaces) {
			try {
				const config = sshWorkspaceConfigSchema.parse(workspace.sshConfig);
				const connectionManager = new SshConnectionManager(
					config,
					workspace.id,
				);
				await connectionManager.isAlive();
			} catch (error) {
				console.warn(
					`[SshReconnectionManager] Failed to inspect workspace ${workspace.id} during startup reconciliation:`,
					error,
				);
			}
		}
	}
}

export const sshReconnectionManager = new SshReconnectionManager();
