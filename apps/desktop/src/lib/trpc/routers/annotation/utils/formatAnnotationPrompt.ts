/**
 * Formats annotation data into a CLI command with heredoc prompt.
 * Supports both Claude Code and Codex agents.
 */

export type AgentType = "claude" | "codex";

const CODEX_BASE_COMMAND =
	'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true';

export function formatAnnotationPrompt({
	output,
	pageUrl,
	additionalContext,
	agent = "claude",
}: {
	output: string;
	pageUrl: string;
	additionalContext?: string;
	agent?: AgentType;
}): string {
	const additionalSection = additionalContext?.trim()
		? `\n## Additional Context\n\n${additionalContext.trim()}\n`
		: "";

	const prompt = `You are working on visual feedback for: ${pageUrl}

## Annotations

${output}
${additionalSection}
## Instructions

1. Explore the codebase to find the components/files corresponding to the annotated elements
2. Use the CSS selectors, React component paths, and element paths to locate the exact code
3. Implement the requested changes
4. Verify your changes work correctly (run relevant tests, typecheck, lint)`;

	const delimiter = `SUPERSET_PROMPT_${crypto.randomUUID().replaceAll("-", "")}`;

	if (agent === "codex") {
		return [
			`${CODEX_BASE_COMMAND} "$(cat <<'${delimiter}'`,
			prompt,
			delimiter,
			')"',
		].join("\n");
	}

	return [
		`claude --dangerously-skip-permissions "$(cat <<'${delimiter}'`,
		prompt,
		delimiter,
		')"',
	].join("\n");
}

/**
 * Formats a single annotation into a CLI command for immediate execution.
 */
export function formatSingleAnnotationPrompt({
	annotation,
	pageUrl,
	agent = "claude",
}: {
	annotation: {
		comment?: string;
		element?: string;
		elementPath?: string;
		cssClasses?: string;
		fullPath?: string;
		reactComponents?: string;
		selectedText?: string;
		computedStyles?: string;
	};
	pageUrl: string;
	agent?: AgentType;
}): string {
	const parts: string[] = [];
	if (annotation.element) parts.push(`**Element:** ${annotation.element}`);
	if (annotation.elementPath)
		parts.push(`**Selector:** ${annotation.elementPath}`);
	if (annotation.fullPath) parts.push(`**Full path:** ${annotation.fullPath}`);
	if (annotation.cssClasses)
		parts.push(`**CSS classes:** ${annotation.cssClasses}`);
	if (annotation.reactComponents)
		parts.push(`**React components:** ${annotation.reactComponents}`);
	if (annotation.selectedText)
		parts.push(`**Selected text:** "${annotation.selectedText}"`);
	if (annotation.computedStyles)
		parts.push(`**Computed styles:** ${annotation.computedStyles}`);

	const prompt = `You are working on visual feedback for: ${pageUrl}

## Annotation

${parts.join("\n")}

**Feedback:** ${annotation.comment || "No comment provided"}

## Instructions

1. Explore the codebase to find the component/file corresponding to the annotated element
2. Use the CSS selectors, React component paths, and element paths to locate the exact code
3. Implement the requested change
4. Verify your changes work correctly`;

	const delimiter = `SUPERSET_PROMPT_${crypto.randomUUID().replaceAll("-", "")}`;

	if (agent === "codex") {
		return [
			`${CODEX_BASE_COMMAND} "$(cat <<'${delimiter}'`,
			prompt,
			delimiter,
			')"',
		].join("\n");
	}

	return [
		`claude --dangerously-skip-permissions "$(cat <<'${delimiter}'`,
		prompt,
		delimiter,
		')"',
	].join("\n");
}
