import { normalizeWorkspaceTags } from "@superset/shared/workspace-tags";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { mintFolderTag } from "renderer/routes/_authenticated/utils/workspaceTagFolders/workspaceTagFolders";
import type { V1GroupRow, V1MigrationIpc } from "./ipc";
import {
	isTerminalStatus,
	ledgerKey,
	loadV1MigrationLedger,
	type V1LedgerOutcome,
} from "./ledger";
import { emptySummary } from "./summary";

export type V1GroupTarget = (
	group: V1GroupRow,
	projectId: string,
	tag: string,
) => void;

/**
 * Group presentation and memberships have independent settings-ledger entries:
 * workspace adoption may already be complete, or a member may arrive later.
 * Persist the chosen tag BEFORE host writes so partial runs never mint a new
 * suffix. Completed entries also preserve subsequent v2 edits/removals.
 */
export async function migrateV1Groups({
	organizationId,
	hostClient,
	ipc,
	groupTarget,
}: {
	organizationId: string;
	hostClient: HostServiceClient;
	ipc: V1MigrationIpc;
	groupTarget?: V1GroupTarget;
}) {
	const summary = emptySummary();
	const groups = await ipc.readV1Groups();
	if (groups.length === 0) return summary;
	const [ledger, workspaces, hostWorkspaces, folders] = await Promise.all([
		loadV1MigrationLedger(ipc, organizationId),
		ipc.readV1Workspaces(),
		hostClient.workspace.list.query(),
		hostClient.tagFolders.list.query(),
	]);
	const hostById = new Map(hostWorkspaces.map((w) => [w.id, w]));
	const takenByProject = new Map<string, Set<string>>();
	const takenFor = (projectId: string) => {
		let taken = takenByProject.get(projectId);
		if (!taken) {
			taken = new Set([
				...folders.filter((f) => f.scope === projectId).map((f) => f.tag),
				...hostWorkspaces
					.filter((w) => w.projectId === projectId)
					.flatMap((w) => w.tags),
			]);
			takenByProject.set(projectId, taken);
		}
		return taken;
	};
	const record = async (entry: V1LedgerOutcome) => {
		await ipc.ledgerRecord(organizationId, [entry]);
		ledger.set(ledgerKey(entry.kind, entry.v1Id), {
			status: entry.status,
			v2Id: entry.v2Id ?? null,
		});
	};
	// Reserve even unfinished assignments before minting for any other group.
	for (const group of groups) {
		const project = ledger.get(ledgerKey("project", group.projectId));
		const assigned = ledger.get(ledgerKey("settings", `group-tag:${group.id}`));
		if (project?.v2Id && assigned?.v2Id)
			takenFor(project.v2Id).add(assigned.v2Id);
	}
	for (const group of groups) {
		const project = ledger.get(ledgerKey("project", group.projectId));
		if (!project?.v2Id || !isTerminalStatus(project.status)) {
			summary.skipped++;
			continue;
		}
		const scope = project.v2Id;
		const assignmentId = `group-tag:${group.id}`;
		const assigned = ledger.get(ledgerKey("settings", assignmentId));
		const tag = assigned?.v2Id ?? mintFolderTag(group.name, takenFor(scope));
		takenFor(scope).add(tag);
		try {
			if (!assigned?.v2Id) {
				await record({
					kind: "settings",
					v1Id: assignmentId,
					status: "skipped",
					v2Id: tag,
				});
			}
			if (!assigned || !isTerminalStatus(assigned.status)) {
				await hostClient.tagFolders.upsert.mutate({
					scope,
					tag,
					// v1 names were unbounded; the host accepts at most 200 chars.
					// Keep the original in v1 and the local presentation row.
					displayName: group.name.trim().slice(0, 200) || tag,
					color: group.color,
					tabOrder: group.tabOrder,
				});
				await record({
					kind: "settings",
					v1Id: assignmentId,
					status: "success",
					v2Id: tag,
				});
				summary.migrated++;
			}

			const localId = `group-local:${group.id}`;
			const localDone = ledger.get(ledgerKey("settings", localId));
			if (groupTarget && (!localDone || !isTerminalStatus(localDone.status))) {
				groupTarget(group, scope, tag);
				await record({
					kind: "settings",
					v1Id: localId,
					status: "success",
					v2Id: tag,
				});
			}
			for (const workspace of workspaces) {
				if (
					workspace.sectionId !== group.id ||
					workspace.projectId !== group.projectId
				)
					continue;
				const memberId = `group-member:${group.id}:${workspace.id}`;
				const done = ledger.get(ledgerKey("settings", memberId));
				if (done && isTerminalStatus(done.status)) continue;
				const mapped = ledger.get(ledgerKey("workspace", workspace.id));
				if (!mapped?.v2Id || !isTerminalStatus(mapped.status)) {
					// Permanently skipped worktrees must not keep follow-up armed.
					if (mapped?.status === "error") summary.deferred++;
					else summary.skipped++;
					continue;
				}
				const host = hostById.get(mapped.v2Id);
				if (!host || host.projectId !== scope) {
					summary.skipped++;
					continue;
				}
				const tags = normalizeWorkspaceTags([...host.tags, tag]);
				await hostClient.workspace.update.mutate({ id: host.id, tags });
				host.tags = tags;
				await record({
					kind: "settings",
					v1Id: memberId,
					status: "success",
					v2Id: host.id,
				});
				summary.migrated++;
			}
		} catch (err) {
			summary.failed++;
			console.error("[v1-migration] group migration failed", {
				groupId: group.id,
				err,
			});
		}
	}
	return summary;
}
