import { z } from "zod";
import { sandboxStatusEnum } from "./enums";

export const localWorkspaceConfigSchema = z.object({
	path: z.string(),
	branch: z.string(),
});
export type LocalWorkspaceConfig = z.infer<typeof localWorkspaceConfigSchema>;

export const cloudWorkspaceConfigSchema = z.object({
	modalSandboxId: z.string().optional(),
	modalObjectId: z.string().optional(),
	snapshotImageId: z.string().optional(),
	status: sandboxStatusEnum,
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

export const sandboxImageSchema = z.object({
	setupCommands: z.array(z.string()).default([]),
	baseImage: z.string().nullable().optional(),
	systemPackages: z.array(z.string()).default([]),
});
export type SandboxImageInput = z.infer<typeof sandboxImageSchema>;
