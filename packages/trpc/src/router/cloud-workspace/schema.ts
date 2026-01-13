import {
	cloudClientTypeValues,
	cloudProviderTypeValues,
} from "@superset/db/schema";
import { z } from "zod";

export const createCloudWorkspaceSchema = z.object({
	organizationId: z.string().uuid(),
	repositoryId: z.string().uuid(),
	name: z.string().min(1),
	branch: z.string().min(1),
	providerType: z.enum(cloudProviderTypeValues).default("freestyle"),
	autoStopMinutes: z.number().int().positive().default(30),
});

export const updateCloudWorkspaceSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).optional(),
	autoStopMinutes: z.number().int().positive().optional(),
});

export const cloudWorkspaceIdSchema = z.object({
	workspaceId: z.string().uuid(),
});

export const joinSessionSchema = z.object({
	workspaceId: z.string().uuid(),
	clientType: z.enum(cloudClientTypeValues),
});

export const heartbeatSchema = z.object({
	sessionId: z.string().uuid(),
});

export const leaveSessionSchema = z.object({
	sessionId: z.string().uuid(),
});
