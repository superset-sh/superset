import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { extractTicketKeyFromBranch } from "./ticket-key";

export interface LinkedTicket {
	key: string;
	state: string;
	url: string;
}

/**
 * Resolves the external (Linear) ticket linked to a v2 workspace from the
 * synced tasks collection. Primary link is the workspace's taskId; fallback
 * is a ticket key embedded in the branch name.
 */
export function useLinkedTicket(
	taskId: string | null,
	branch: string,
): LinkedTicket | null {
	const collections = useCollections();
	const candidateKey = extractTicketKeyFromBranch(branch);

	const { data: byId = [] } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.where(({ tasks }) => eq(tasks.id, taskId ?? ""))
				.select(({ tasks }) => ({
					externalKey: tasks.externalKey,
					externalUrl: tasks.externalUrl,
					statusId: tasks.statusId,
				})),
		[collections, taskId],
	);

	const { data: byKey = [] } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.where(({ tasks }) => eq(tasks.externalKey, candidateKey ?? ""))
				.select(({ tasks }) => ({
					externalKey: tasks.externalKey,
					externalUrl: tasks.externalUrl,
					statusId: tasks.statusId,
				})),
		[collections, candidateKey],
	);

	const task = byId[0] ?? byKey[0] ?? null;

	const { data: statusMatches = [] } = useLiveQuery(
		(q) =>
			q
				.from({ statuses: collections.taskStatuses })
				.where(({ statuses }) => eq(statuses.id, task?.statusId ?? ""))
				.select(({ statuses }) => ({ name: statuses.name })),
		[collections, task?.statusId],
	);

	if (!task?.externalKey) {
		return null;
	}

	return {
		key: task.externalKey,
		state: statusMatches[0]?.name ?? "",
		url: task.externalUrl ?? "",
	};
}
