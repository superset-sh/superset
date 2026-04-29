export interface NamingInputArgs {
	/** Free-form composer prompt. May be empty/undefined when the user only attached tickets/PRs. */
	prompt?: string;
	/** Titles of linked GitHub/internal issues. */
	linkedIssueTitles?: string[];
	/** Title of the linked PR, if any. */
	linkedPrTitle?: string;
}

/**
 * Combines the user's prompt with the titles of any linked tickets/PRs into a
 * single string the AI namer can use as context. Returns `null` when nothing
 * naming-worthy is present so the caller can skip the LLM call entirely.
 *
 * Linked context takes priority — issue tracker titles are usually the most
 * accurate signal of what a workspace is for. The composer prompt (the
 * "active agent convo") is appended as supporting context. This addresses
 * the case where the workspace would otherwise inherit its name purely from
 * the conversation prompt while the user had already linked a clearer source
 * of truth.
 */
export function buildWorkspaceNamingInput(
	args: NamingInputArgs,
): string | null {
	const issueTitles = (args.linkedIssueTitles ?? [])
		.map((t) => t.trim())
		.filter(Boolean);
	const prTitle = args.linkedPrTitle?.trim() ?? "";
	const prompt = args.prompt?.trim() ?? "";

	const sections: string[] = [];

	if (issueTitles.length > 0) {
		sections.push(
			`Linked issues:\n${issueTitles.map((t) => `- ${t}`).join("\n")}`,
		);
	}
	if (prTitle) {
		sections.push(`Linked pull request: ${prTitle}`);
	}
	if (prompt) {
		sections.push(`Prompt: ${prompt}`);
	}

	if (sections.length === 0) return null;
	return sections.join("\n\n");
}
