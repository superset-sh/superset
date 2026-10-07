import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import type { cloudTrpc } from "renderer/lib/cloud-trpc";

type Utils = ReturnType<typeof cloudTrpc.useUtils>;

/** Moves a row between the active and archived caches; returns the rollback. */
export async function moveCloudWorkspaceRow({
	utils,
	organizationId,
	id,
	to,
}: {
	utils: Utils;
	organizationId: string;
	id: string;
	to: "archived" | "active";
}): Promise<() => void> {
	const active = { organizationId };
	const archived = { organizationId, archived: true };
	await Promise.all([
		utils.cloudWorkspace.list.cancel(active),
		utils.cloudWorkspace.list.cancel(archived),
		utils.cloudWorkspace.get.cancel({ id }),
	]);
	const previousActive = utils.cloudWorkspace.list.getData(active);
	const previousArchived = utils.cloudWorkspace.list.getData(archived);
	const previousRecord = utils.cloudWorkspace.get.getData({ id });
	const state =
		to === "archived"
			? ({ status: "archived", archivedAt: new Date() } as const)
			: ({ status: "provisioning", archivedAt: null } as const);
	utils.cloudWorkspace.get.setData({ id }, (record) =>
		record ? { ...record, ...state } : record,
	);
	const [from, into] =
		to === "archived" ? [active, archived] : [archived, active];
	const row = utils.cloudWorkspace.list
		.getData(from)
		?.find((candidate) => candidate.id === id);
	if (row) {
		const moved: CloudWorkspaceRow = { ...row, ...state, sandboxUrl: null };
		utils.cloudWorkspace.list.setData(from, (rows) =>
			rows?.filter((candidate) => candidate.id !== id),
		);
		utils.cloudWorkspace.list.setData(into, (rows) => [
			moved,
			...(rows ?? []).filter((candidate) => candidate.id !== id),
		]);
	}
	return () => {
		utils.cloudWorkspace.list.setData(active, previousActive);
		utils.cloudWorkspace.list.setData(archived, previousArchived);
		utils.cloudWorkspace.get.setData({ id }, previousRecord);
	};
}
