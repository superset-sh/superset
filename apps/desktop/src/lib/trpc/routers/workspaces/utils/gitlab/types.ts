import { z } from "zod";

// ── Repo Context ──

export const GLRepoResponseSchema = z.object({
	full_path: z.string().optional(),
	path_with_namespace: z.string().optional(),
	http_url_to_repo: z.string().optional(),
	web_url: z.string().optional(),
	forked_from_project: z
		.object({
			path_with_namespace: z.string().optional(),
			http_url_to_repo: z.string().optional(),
			web_url: z.string().optional(),
		})
		.nullable()
		.optional(),
});

export interface GitLabRepoContext {
	repoUrl: string;
	upstreamUrl: string;
	isFork: boolean;
	projectPath: string; // URL-encoded project path for API calls
}

// ── Merge Request ──

export const GLMRResponseSchema = z.object({
	iid: z.number(),
	title: z.string(),
	web_url: z.string(),
	state: z.enum(["opened", "closed", "merged", "locked"]),
	draft: z.boolean().optional().default(false),
	merged_at: z.string().nullable().optional(),
	source_branch: z.string(),
	sha: z.string(),
	diff_stats: z
		.object({
			additions: z.number(),
			deletions: z.number(),
		})
		.optional(),
	source_project_id: z.number().optional(),
	target_project_id: z.number().optional(),
	reviewers: z
		.array(
			z.object({
				username: z.string(),
			}),
		)
		.nullable()
		.optional(),
});

export type GLMRResponse = z.infer<typeof GLMRResponseSchema>;

// ── Approvals ──

export const GLApprovalsResponseSchema = z.object({
	approved: z.boolean(),
	approvals_required: z.number().optional(),
	approvals_left: z.number().optional(),
	approved_by: z
		.array(
			z.object({
				user: z.object({
					username: z.string(),
					avatar_url: z.string().optional(),
				}),
			}),
		)
		.optional(),
});

// ── Pipeline & Jobs ──

export const GLPipelineSchema = z.object({
	id: z.number(),
	status: z.enum([
		"created",
		"waiting_for_resource",
		"preparing",
		"pending",
		"running",
		"success",
		"failed",
		"canceled",
		"skipped",
		"manual",
		"scheduled",
	]),
	web_url: z.string(),
	ref: z.string().optional(),
	sha: z.string().optional(),
});

export const GLJobSchema = z.object({
	id: z.number(),
	name: z.string(),
	status: z.enum([
		"created",
		"pending",
		"running",
		"failed",
		"success",
		"canceled",
		"skipped",
		"manual",
	]),
	web_url: z.string(),
	duration: z.number().nullable().optional(),
	stage: z.string().optional(),
});

// ── Notes & Discussions ──

export const GLNoteAuthorSchema = z.object({
	username: z.string(),
	avatar_url: z.string().optional(),
});

export const GLNotePositionSchema = z.object({
	new_path: z.string().optional(),
	new_line: z.number().nullable().optional(),
	old_path: z.string().optional(),
	old_line: z.number().nullable().optional(),
});

export const GLNoteSchema = z.object({
	id: z.number(),
	body: z.string(),
	author: GLNoteAuthorSchema,
	created_at: z.string(),
	system: z.boolean(),
	resolvable: z.boolean().optional(),
	resolved: z.boolean().optional(),
	type: z.string().nullable().optional(),
	position: GLNotePositionSchema.nullable().optional(),
});

export const GLDiscussionSchema = z.object({
	id: z.string(),
	notes: z.array(GLNoteSchema),
});
