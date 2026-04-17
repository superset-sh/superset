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
];

export const launchContextMultiSource: LaunchContext = {
	projectId: "project-1",
	sources,
	sections: [
		{
			id: "user-prompt",
			kind: "user-prompt",
			label: "Prompt",
			content: [{ type: "text", text: "refactor the auth middleware" }],
		},
		{
			id: `task:${internalTaskRefactorAuth.id}`,
			kind: "internal-task",
			label: `Task ${internalTaskRefactorAuth.id} — ${internalTaskRefactorAuth.title}`,
			content: [
				{
					type: "text",
					text: `# ${internalTaskRefactorAuth.title}\n\n${internalTaskRefactorAuth.description}`,
				},
			],
			meta: { taskSlug: internalTaskRefactorAuth.slug },
		},
		{
			id: `issue:${githubIssueAuthMiddleware.number}`,
			kind: "github-issue",
			label: `Issue #${githubIssueAuthMiddleware.number} — ${githubIssueAuthMiddleware.title}`,
			content: [
				{
					type: "text",
					text: `# ${githubIssueAuthMiddleware.title}\n\n${githubIssueAuthMiddleware.body}`,
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
			label: `Issue #${githubIssueTokenRotation.number} — ${githubIssueTokenRotation.title}`,
			content: [
				{
					type: "text",
					text: `# ${githubIssueTokenRotation.title}\n\n${githubIssueTokenRotation.body}`,
				},
			],
			meta: {
				url: githubIssueTokenRotation.url,
				taskSlug: githubIssueTokenRotation.slug,
			},
		},
		{
			id: `pr:${githubPrAuthRewrite.number}`,
			kind: "github-pr",
			label: `PR #${githubPrAuthRewrite.number} — ${githubPrAuthRewrite.title}`,
			content: [
				{
					type: "text",
					text: `# ${githubPrAuthRewrite.title}\n\nBranch: \`${githubPrAuthRewrite.branch}\`\n\n${githubPrAuthRewrite.body}`,
				},
			],
			meta: { url: githubPrAuthRewrite.url },
		},
		{
			id: "attachment:logs.txt",
			kind: "attachment",
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
			label: "screenshot.png",
			content: [
				{
					type: "image",
					data: attachmentScreenshotPng.data,
					mediaType: attachmentScreenshotPng.mediaType,
				},
			],
		},
	],
	failures: [],
	taskSlug: internalTaskRefactorAuth.slug,
	agent: { id: "claude", config: undefined },
};
