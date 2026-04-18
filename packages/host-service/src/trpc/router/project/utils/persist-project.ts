import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ResolvedRepo } from "./resolve-repo";

/**
 * Inserts or updates the local `host-service.projects` row for `projectId`
 * using the resolved GitHub remote metadata. Safe to call on both fresh
 * create and setup re-point.
 */
export function persistLocalProject(
	ctx: HostServiceContext,
	projectId: string,
	resolved: ResolvedRepo,
): void {
	const repoFields = {
		repoPath: resolved.repoPath,
		repoProvider: "github" as const,
		repoOwner: resolved.parsed.owner,
		repoName: resolved.parsed.name,
		repoUrl: resolved.parsed.url,
		remoteName: resolved.remoteName,
	};
	ctx.db
		.insert(projects)
		.values({ id: projectId, ...repoFields })
		.onConflictDoUpdate({ target: projects.id, set: repoFields })
		.run();
}

/**
 * Ensures the current machine has a `v2_hosts` row in the cloud and then
 * upserts the `v2_host_projects` binding for (projectId, thisHostId). This
 * is the cloud-side "host H backs project P" signal consumed by the sidebar.
 */
export async function upsertHostBacking(
	ctx: HostServiceContext,
	projectId: string,
): Promise<void> {
	const host = await ctx.api.device.ensureV2Host.mutate({
		organizationId: ctx.organizationId,
		machineId: getHashedDeviceId(),
		name: getDeviceName(),
	});
	await ctx.api.v2HostProject.upsert.mutate({ projectId, hostId: host.id });
}

/**
 * Best-effort cloud cleanup of the `v2_host_projects` binding. Used by
 * `project.remove` after local teardown. Errors are logged and swallowed —
 * local state is already gone, so we never want to fail the RPC because of
 * a cloud hiccup. Orphan rows are handled elsewhere.
 */
export async function deleteHostBacking(
	ctx: HostServiceContext,
	projectId: string,
): Promise<void> {
	try {
		const host = await ctx.api.device.ensureV2Host.mutate({
			organizationId: ctx.organizationId,
			machineId: getHashedDeviceId(),
			name: getDeviceName(),
		});
		await ctx.api.v2HostProject.delete.mutate({ projectId, hostId: host.id });
	} catch (err) {
		console.warn("[project.remove] failed to delete v2_host_projects", {
			projectId,
			err,
		});
	}
}
