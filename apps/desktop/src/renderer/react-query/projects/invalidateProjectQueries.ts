import type { electronTrpc } from "renderer/lib/electron-trpc";

type Utils = ReturnType<typeof electronTrpc.useUtils>;

/**
 * Invalidate the queries that need to refresh when the set of visible
 * projects changes (creation, open, clone, init). `workspaces.getAllGrouped`
 * drives the sidebar — without invalidating it, newly created projects do
 * not appear until the user navigates or reloads. See issue #4711.
 */
export async function invalidateProjectQueries(utils: Utils): Promise<void> {
	await Promise.all([
		utils.projects.getRecents.invalidate(),
		utils.workspaces.getAllGrouped.invalidate(),
	]);
}
