import { z } from "zod";

/**
 * Status of a v1 cloud workspace's Modal sandbox. Inlined because this file
 * is its only consumer and both retire with the v1 `workspaces` table —
 * cloud workspaces use `cloudWorkspaceStatus` in enums.ts instead.
 */
const v1SandboxStatusEnum = z.enum([
	"pending",
	"spawning",
	"connecting",
	"warming",
	"syncing",
	"ready",
	"running",
	"stale",
	"snapshotting",
	"stopped",
	"failed",
]);

export const localWorkspaceConfigSchema = z.object({
	path: z.string(),
	branch: z.string(),
});
export type LocalWorkspaceConfig = z.infer<typeof localWorkspaceConfigSchema>;

export const cloudWorkspaceConfigSchema = z.object({
	modalSandboxId: z.string().optional(),
	modalObjectId: z.string().optional(),
	snapshotImageId: z.string().optional(),
	status: v1SandboxStatusEnum,
	lastSpawnedAt: z.string().optional(),
	lastActivityAt: z.string().optional(),
	lastSpawnError: z.string().optional(),
	lastSpawnErrorAt: z.string().optional(),
	spawnFailureCount: z.number().default(0),
});
export type CloudWorkspaceConfig = z.infer<typeof cloudWorkspaceConfigSchema>;

export const workspaceConfigSchema = z.union([
	localWorkspaceConfigSchema,
	cloudWorkspaceConfigSchema,
]);
export type WorkspaceConfig = LocalWorkspaceConfig | CloudWorkspaceConfig;
