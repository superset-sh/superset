import {
	cloudClientTypeValues,
	cloudProviderTypeValues,
} from "@superset/db/schema";
import { z } from "zod";

// Create a new cloud workspace
export const createCloudWorkspaceSchema = z.object({
	repositoryId: z.string().uuid(),
	name: z.string().min(1).max(100),
	branch: z.string().min(1).optional(), // Optional - uses repo default branch if not provided
	providerType: z.enum(cloudProviderTypeValues).default("freestyle"),
	autoStopMinutes: z.number().int().min(5).max(480).default(30), // 5 min to 8 hours
});

// Workspace ID parameter
export const cloudWorkspaceIdSchema = z.object({
	workspaceId: z.string().uuid(),
});

// List workspaces for an organization (uses active organization from session)
export const listCloudWorkspacesSchema = z.object({});

// Join a workspace session
export const joinSessionSchema = z.object({
	workspaceId: z.string().uuid(),
	clientType: z.enum(cloudClientTypeValues).default("desktop"),
});

// Session ID parameter
export const sessionIdSchema = z.object({
	sessionId: z.string().uuid(),
});

// Update workspace settings
export const updateCloudWorkspaceSchema = z.object({
	workspaceId: z.string().uuid(),
	name: z.string().min(1).max(100).optional(),
	autoStopMinutes: z.number().int().min(5).max(480).optional(),
});
