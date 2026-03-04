import { z } from "zod";

export const taskStatusEnumValues = [
	"backlog",
	"todo",
	"planning",
	"working",
	"needs-feedback",
	"ready-to-merge",
	"completed",
	"canceled",
] as const;
export const taskStatusEnum = z.enum(taskStatusEnumValues);
export type TaskStatus = z.infer<typeof taskStatusEnum>;

export const taskPriorityValues = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const;
export const taskPriorityEnum = z.enum(taskPriorityValues);
export type TaskPriority = z.infer<typeof taskPriorityEnum>;

export const integrationProviderValues = ["linear", "github", "slack"] as const;
export const integrationProviderEnum = z.enum(integrationProviderValues);
export type IntegrationProvider = z.infer<typeof integrationProviderEnum>;

export const deviceTypeValues = ["desktop", "mobile", "web"] as const;
export const deviceTypeEnum = z.enum(deviceTypeValues);
export type DeviceType = z.infer<typeof deviceTypeEnum>;

export const commandStatusValues = [
	"pending",
	"completed",
	"failed",
	"timeout",
] as const;
export const commandStatusEnum = z.enum(commandStatusValues);
export type CommandStatus = z.infer<typeof commandStatusEnum>;

export const sandboxStatusValues = [
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
] as const;
export const sandboxStatusEnum = z.enum(sandboxStatusValues);
export type SandboxStatus = z.infer<typeof sandboxStatusEnum>;

export const workspaceTypeValues = ["local", "cloud"] as const;
export const workspaceTypeEnum = z.enum(workspaceTypeValues);
export type WorkspaceType = z.infer<typeof workspaceTypeEnum>;
