import {
	cloudModelValues,
	cloudSandboxStatusValues,
	cloudSessionStatusValues,
} from "@superset/db/schema";
import { z } from "zod";

export const createCloudWorkspaceSchema = z.object({
	title: z.string().min(1),
	repoOwner: z.string().min(1),
	repoName: z.string().min(1),
	repositoryId: z.string().uuid().optional(),
	branch: z.string().optional(),
	baseBranch: z.string().default("main"),
	model: z.enum(cloudModelValues).default("claude-sonnet-4"),
	linearIssueId: z.string().optional(),
	linearIssueKey: z.string().optional(),
	initialPrompt: z.string().optional(),
});

export const updateCloudWorkspaceSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).optional(),
	status: z.enum(cloudSessionStatusValues).optional(),
	sandboxStatus: z.enum(cloudSandboxStatusValues).optional(),
	model: z.enum(cloudModelValues).optional(),
	prUrl: z.string().url().optional(),
	prNumber: z.number().int().positive().optional(),
});

export const listCloudWorkspacesSchema = z.object({
	status: z.enum(cloudSessionStatusValues).optional(),
	repositoryId: z.string().uuid().optional(),
	limit: z.number().int().positive().max(100).default(50),
	offset: z.number().int().min(0).default(0),
});
