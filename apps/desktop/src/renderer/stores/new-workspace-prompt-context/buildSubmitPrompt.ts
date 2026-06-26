import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import {
	makePromptContextKey,
	useNewWorkspacePromptContextStore,
} from "./store";

export interface BuildSubmitPromptArgs {
	userPrompt: string;
	linkedPR: LinkedPR | null;
	linkedIssues: LinkedIssue[];
	contextScope?: string | null;
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
		const body = readBody(
			makePromptContextKey("task", issue.taskId, args.contextScope),
		);
		const header = `## Linked task — ${issue.slug}: ${issue.title}`;
		linkedSections.push(body ? `${header}\n${body}` : header);
	}

	for (const issue of args.linkedIssues) {
		if (issue.source !== "github" || issue.number == null) continue;
		const body = readBody(
			makePromptContextKey("github-issue", issue.number, args.contextScope),
		);
		const headerLines = [
			`## Linked GitHub issue — #${issue.number}: ${issue.title}`,
		];
		if (issue.url) headerLines.push(issue.url);
		const header = headerLines.join("\n");
		linkedSections.push(body ? `${header}\n\n${body}` : header);
	}

	if (args.linkedPR) {
		const body = readBody(
			makePromptContextKey("pr", args.linkedPR.prNumber, args.contextScope),
		);
		const header = `## Linked PR — #${args.linkedPR.prNumber}: ${args.linkedPR.title}\n${args.linkedPR.url}`;
		linkedSections.push(body ? `${header}\n\n${body}` : header);
	}

	if (linkedSections.length === 0) return args.userPrompt;
	const trimmedUserPrompt = args.userPrompt.trim();
	const parts = trimmedUserPrompt
		? [trimmedUserPrompt, ...linkedSections]
		: linkedSections;
	return parts.join("\n\n");
}
