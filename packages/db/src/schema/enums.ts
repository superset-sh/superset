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

export const integrationProviderValues = ["linear", "github"] as const;
export const integrationProviderEnum = z.enum(integrationProviderValues);
export type IntegrationProvider = z.infer<typeof integrationProviderEnum>;

// Cloud workspace status
export const cloudWorkspaceStatusValues = [
	"provisioning",
	"running",
	"paused",
	"stopped",
	"error",
] as const;
export const cloudWorkspaceStatusEnum = z.enum(cloudWorkspaceStatusValues);
export type CloudWorkspaceStatus = z.infer<typeof cloudWorkspaceStatusEnum>;

// Cloud provider type
export const cloudProviderTypeValues = ["freestyle", "fly"] as const;
export const cloudProviderTypeEnum = z.enum(cloudProviderTypeValues);
export type CloudProviderType = z.infer<typeof cloudProviderTypeEnum>;

// Client type for cloud workspace sessions
export const cloudClientTypeValues = ["desktop", "web"] as const;
export const cloudClientTypeEnum = z.enum(cloudClientTypeValues);
export type CloudClientType = z.infer<typeof cloudClientTypeEnum>;
