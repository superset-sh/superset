import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { issueContextKey } from "./issue-context-key";
import { requestContextKey } from "./request-context-key";
import { useNewWorkspacePromptContextStore } from "./store";

export interface BuildSubmitPromptArgs {
	userPrompt: string;
	linkedPR: LinkedPR | null;
	linkedIssues: LinkedIssue[];
	projectId?: string | null;
	hostId?: string | null;
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
		if (
			(issue.source !== "github" && issue.source !== "gitlab") ||
			issue.number == null
		)
			continue;
		const key = issueContextKey(issue, args);
		const entry = useNewWorkspacePromptContextStore.getState().entries.get(key);
		const body =
			issue.source === "gitlab" && issue.body !== undefined
				? issue.body
				: readBody(key);
		const headerLines = [
			`## Linked ${issue.source === "gitlab" ? "GitLab" : "GitHub"} issue — #${issue.number}: ${issue.title}`,
		];
		if (issue.url) headerLines.push(issue.url);
		const header = headerLines.join("\n");
		linkedSections.push(
			body
				? `${header}\n\n${body}`
				: issue.source === "gitlab" && entry?.state === "failed"
					? `${header}\n\nGitLab issue description could not be loaded.`
					: header,
		);
	}

	if (args.linkedPR) {
		const body = readBody(requestContextKey(args.linkedPR, args));
		const isGitLab = args.linkedPR.provider === "gitlab";
		const header = `## Linked ${isGitLab ? "merge request" : "PR"} — ${isGitLab ? "!" : "#"}${args.linkedPR.prNumber}: ${args.linkedPR.title}\n${args.linkedPR.url}`;
		linkedSections.push(body ? `${header}\n\n${body}` : header);
	}

	if (linkedSections.length === 0) return args.userPrompt;
	const trimmedUserPrompt = args.userPrompt.trim();
	const parts = trimmedUserPrompt
		? [trimmedUserPrompt, ...linkedSections]
		: linkedSections;
	return parts.join("\n\n");
}
