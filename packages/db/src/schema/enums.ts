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
	"claimed",
	"executing",
	"completed",
	"failed",
	"timeout",
] as const;
export const commandStatusEnum = z.enum(commandStatusValues);
export type CommandStatus = z.infer<typeof commandStatusEnum>;

// Cloud workspace session status
export const cloudSessionStatusValues = [
	"created",
	"active",
	"completed",
	"archived",
] as const;
export const cloudSessionStatusEnum = z.enum(cloudSessionStatusValues);
export type CloudSessionStatus = z.infer<typeof cloudSessionStatusEnum>;

// Cloud sandbox status (Modal sandbox lifecycle)
export const cloudSandboxStatusValues = [
	"pending",
	"warming",
	"syncing",
	"ready",
	"running",
	"stopped",
	"failed",
] as const;
export const cloudSandboxStatusEnum = z.enum(cloudSandboxStatusValues);
export type CloudSandboxStatus = z.infer<typeof cloudSandboxStatusEnum>;

// Model selection for cloud sessions
export const cloudModelValues = [
	"claude-sonnet-4",
	"claude-opus-4",
	"claude-haiku-3-5",
] as const;
export const cloudModelEnum = z.enum(cloudModelValues);
export type CloudModel = z.infer<typeof cloudModelEnum>;
