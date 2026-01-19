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

export const integrationProviderValues = ["linear"] as const;
export const integrationProviderEnum = z.enum(integrationProviderValues);
export type IntegrationProvider = z.infer<typeof integrationProviderEnum>;

// Mobile pairing session status
export const mobilePairingStatusValues = [
	"pending",
	"paired",
	"expired",
	"revoked",
] as const;
export const mobilePairingStatusEnum = z.enum(mobilePairingStatusValues);
export type MobilePairingStatus = z.infer<typeof mobilePairingStatusEnum>;

// Voice command target types
export const voiceCommandTargetValues = [
	"terminal",
	"claude",
	"task",
] as const;
export const voiceCommandTargetEnum = z.enum(voiceCommandTargetValues);
export type VoiceCommandTarget = z.infer<typeof voiceCommandTargetEnum>;

// Voice command status
export const voiceCommandStatusValues = [
	"pending",
	"sent",
	"executed",
	"failed",
] as const;
export const voiceCommandStatusEnum = z.enum(voiceCommandStatusValues);
export type VoiceCommandStatus = z.infer<typeof voiceCommandStatusEnum>;
