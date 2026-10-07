import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	type GitLabIssuePromptTarget,
	gitLabIssuePromptKey,
} from "renderer/routes/_authenticated/utils/linkedIssueFromGitLab";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { pullRequestPromptKey } from "./pullRequestPromptKey";
import { useNewWorkspacePromptContextStore } from "./store";

export interface BuildSubmitPromptArgs {
	userPrompt: string;
	linkedPR: LinkedPR | null;
	linkedIssues: LinkedIssue[];
	pullRequestTarget?: { projectId: string; hostUrl: string };
	gitlabTarget?: GitLabIssuePromptTarget;
	gitlabSourceTargets?: readonly GitLabIssuePromptTarget[];
}

function readBody(key: string): string | null {
	const entry = useNewWorkspacePromptContextStore.getState().entries.get(key);
	if (entry?.state === "ready") return entry.body.text;
	return null;
}

export function buildSubmitPrompt(args: BuildSubmitPromptArgs): string {
	const linkedSections: string[] = [];

	for (const issue of args.linkedIssues) {
		if (issue.source !== "internal" || !issue.taskId) continue;
		const body = readBody(`task:${issue.taskId}`);
		const header = `## Linked task — ${issue.slug}: ${issue.title}`;
		linkedSections.push(body ? `${header}\n${body}` : header);
	}

	for (const issue of args.linkedIssues) {
		if (issue.source !== "linear") continue;
		const body = readBody(`linear-issue:${issue.slug}`);
		const headerLines = [
			`## Linked Linear issue — ${issue.slug}: ${issue.title}`,
		];
		if (issue.url) headerLines.push(issue.url);
		const header = headerLines.join("\n");
		linkedSections.push(body ? `${header}\n\n${body}` : header);
	}

	for (const issue of args.linkedIssues) {
		if (issue.source !== "github" || issue.number == null) continue;
		const body = readBody(`github-issue:${issue.number}`);
		const headerLines = [
			`## Linked GitHub issue — #${issue.number}: ${issue.title}`,
		];
		if (issue.url) headerLines.push(issue.url);
		const header = headerLines.join("\n");
		linkedSections.push(body ? `${header}\n\n${body}` : header);
	}

	for (const issue of args.linkedIssues) {
		if (issue.source !== "gitlab") continue;
		const target =
			args.gitlabSourceTargets?.find(
				(value) =>
					value.projectId === issue.gitlab?.projectId &&
					value.hostId === issue.gitlab?.hostId,
			) ?? args.gitlabTarget;
		const key = gitLabIssuePromptKey(issue, target);
		const entry = key
			? useNewWorkspacePromptContextStore.getState().entries.get(key)
			: undefined;
		if (entry?.state !== "ready")
			throw Error(
				i18n._(msg({ message: "GitLab issue content could not be verified" })),
			);
		const header = `## Linked GitLab issue — #${issue.number}: ${issue.title}\n${issue.url}`;
		linkedSections.push(
			entry.body.text ? `${header}\n\n${entry.body.text}` : header,
		);
	}

	if (args.linkedPR) {
		const key = pullRequestPromptKey(args.linkedPR, args.pullRequestTarget);
		const body = key ? readBody(key) : null;
		const native = args.linkedPR.url.includes("/-/merge_requests/");
		const header = `## Linked ${native ? "GitLab MR" : "PR"} — #${args.linkedPR.prNumber}: ${args.linkedPR.title}\n${args.linkedPR.url}`;
		linkedSections.push(body ? `${header}\n\n${body}` : header);
	}

	if (linkedSections.length === 0) return args.userPrompt;
	const trimmedUserPrompt = args.userPrompt.trim();
	const parts = trimmedUserPrompt
		? [trimmedUserPrompt, ...linkedSections]
		: linkedSections;
	return parts.join("\n\n");
}
