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
