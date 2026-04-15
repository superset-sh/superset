import type { LaunchContext, LaunchSource } from "../types";
import {
	attachmentLogsTxt,
	attachmentScreenshotPng,
} from "./attachment.logs-txt";
import {
	githubIssueAuthMiddleware,
	githubIssueTokenRotation,
} from "./githubIssue.auth-middleware";
import { githubPrAuthRewrite } from "./githubPr.auth-rewrite";
import { internalTaskRefactorAuth } from "./internalTask.refactor-auth";

const sources: LaunchSource[] = [
	{
		kind: "user-prompt",
		content: [{ type: "text", text: "refactor the auth middleware" }],
	},
	{ kind: "internal-task", id: internalTaskRefactorAuth.id },
	{ kind: "github-issue", url: githubIssueAuthMiddleware.url },
	{ kind: "github-issue", url: githubIssueTokenRotation.url },
	{ kind: "github-pr", url: githubPrAuthRewrite.url },
	{ kind: "attachment", file: attachmentLogsTxt },
	{ kind: "attachment", file: attachmentScreenshotPng },
	{ kind: "agent-instructions", path: "/worktree/AGENTS.md" },
];

export const launchContextMultiSource: LaunchContext = {
	projectId: "project-1",
	sources,
	sections: [
		{
			id: "user-prompt",
			kind: "user-prompt",
			scope: "user",
			label: "Prompt",
			content: [{ type: "text", text: "refactor the auth middleware" }],
		},
		{
			id: `task:${internalTaskRefactorAuth.id}`,
			kind: "internal-task",
			scope: "user",
			label: "Task TASK-42 — Refactor auth middleware",
			content: [
				{
					type: "text",
					text: "Split session-token storage from request handling so we can encrypt at rest.",
				},
			],
			meta: { taskSlug: internalTaskRefactorAuth.slug },
		},
		{
			id: `issue:${githubIssueAuthMiddleware.number}`,
			kind: "github-issue",
			scope: "user",
			label: "Issue #123 — Auth middleware stores tokens in plaintext",
			content: [
				{
					type: "text",
					text: "Legal flagged this. Sessions written to disk without encryption.",
				},
			],
			meta: {
				url: githubIssueAuthMiddleware.url,
				taskSlug: githubIssueAuthMiddleware.slug,
			},
		},
		{
			id: `issue:${githubIssueTokenRotation.number}`,
			kind: "github-issue",
			scope: "user",
			label: "Issue #124 — Rotate session tokens on password change",
			content: [{ type: "text", text: "Follow-up for #123." }],
			meta: {
				url: githubIssueTokenRotation.url,
				taskSlug: githubIssueTokenRotation.slug,
			},
		},
		{
			id: `pr:${githubPrAuthRewrite.number}`,
			kind: "github-pr",
			scope: "user",
			label: "PR #200 — Rewrite auth middleware",
			content: [
				{
					type: "text",
					text: "Replaces plaintext token storage with encrypted KV.",
				},
			],
			meta: { url: githubPrAuthRewrite.url },
		},
		{
			id: "attachment:logs.txt",
			kind: "attachment",
			scope: "user",
			label: "logs.txt",
			content: [
				{
					type: "file",
					data: attachmentLogsTxt.data,
					mediaType: attachmentLogsTxt.mediaType,
					filename: attachmentLogsTxt.filename,
				},
			],
		},
		{
			id: "attachment:screenshot.png",
			kind: "attachment",
			scope: "user",
			label: "screenshot.png",
			content: [
				{
					type: "image",
					data: attachmentScreenshotPng.data,
					mediaType: attachmentScreenshotPng.mediaType,
				},
			],
		},
		{
			id: "agent-instructions:/worktree/AGENTS.md",
			kind: "agent-instructions",
			scope: "system",
			label: "AGENTS.md",
			content: [
				{ type: "text", text: "# Repo conventions\n- Prefer `gh` CLI." },
			],
			cacheControl: "ephemeral",
		},
	],
	failures: [],
	taskSlug: internalTaskRefactorAuth.slug,
	agent: { id: "claude", config: undefined },
};
