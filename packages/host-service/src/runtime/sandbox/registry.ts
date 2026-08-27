import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { hostSettings, projects, workspaces } from "../../db/schema.ts";
import { loadSetupConfig } from "../setup/config.ts";
import { computeConfigHash } from "./container-manager.ts";
import { resolveSandboxSettings } from "./docker-args.ts";
import { DockerRuntime } from "./docker-runtime.ts";
import { HostRuntime } from "./host-runtime.ts";
import { sandboxNameSlug } from "./paths.ts";
import type { WorkspaceRuntime } from "./workspace-runtime.ts";

const hostRuntime = new HostRuntime();
const dockerRuntimes = new Map<
	string,
	{ configHash: string; nameSlug: string; runtime: DockerRuntime }
>();

/** Container-name slug from a workspace row — shared with tests so name
 * expectations can't drift from what the runtime actually creates. */
export function computeWorkspaceNameSlug(row: {
	name: string | null;
	branch: string;
}): string {
	return sandboxNameSlug(row.name, row.branch);
}

/**
 * Resolve the execution runtime for a workspace.
 *
 * The workspace row's sticky `sandboxEnabled` (snapshotted at create time)
 * decides host vs docker; the sandbox details (image, resources, mounts)
 * are re-read from config on every resolution so edits apply to the next
 * container recreation without flipping a live workspace's mode.
 */
export function getWorkspaceRuntime(
	db: HostDb,
	workspaceId: string,
): WorkspaceRuntime {
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace?.sandboxEnabled || !workspace.projectId) return hostRuntime;

	const project = db.query.projects
		.findFirst({ where: eq(projects.id, workspace.projectId) })
		.sync();
	if (!project) return hostRuntime;

	const sandboxConfig =
		loadSetupConfig({
			repoPath: project.repoPath,
			projectId: project.id,
			worktreePath: workspace.worktreePath,
		})?.sandbox ?? {};
	const settings = resolveSandboxSettings(sandboxConfig);
	const configHash = computeConfigHash(settings);
	const nameSlug = computeWorkspaceNameSlug(workspace);

	const cached = dockerRuntimes.get(workspaceId);
	if (
		cached &&
		cached.configHash === configHash &&
		cached.nameSlug === nameSlug
	)
		return cached.runtime;

	const runtime = new DockerRuntime({
		workspaceId,
		worktreePath: workspace.worktreePath,
		repoPath: project.repoPath,
		branch: workspace.branch,
		nameSlug,
		settings,
	});
	dockerRuntimes.set(workspaceId, { configHash, nameSlug, runtime });
	return runtime;
}

/** Drop the cached runtime after a workspace is destroyed. */
export function evictWorkspaceRuntime(workspaceId: string): void {
	dockerRuntimes.delete(workspaceId);
}

/**
 * The sticky sandbox decision for a NEW workspace, resolved at create time
 * and persisted on the row. Precedence: an explicit `sandbox.enabled` in the
 * project's config (true OR false) wins; otherwise the host-wide
 * "sandbox new workspaces" default from settings applies.
 */
export function resolveSandboxEnabledForNewWorkspace(
	db: HostDb,
	projectId: string,
	worktreePath: string,
): boolean {
	const project = db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!project) return false;
	const config = loadSetupConfig({
		repoPath: project.repoPath,
		projectId,
		worktreePath,
	});
	const projectSetting = config?.sandbox?.enabled;
	if (typeof projectSetting === "boolean") return projectSetting;
	const settingsRow = db.select().from(hostSettings).get();
	return settingsRow?.sandboxNewWorkspaces === true;
}
