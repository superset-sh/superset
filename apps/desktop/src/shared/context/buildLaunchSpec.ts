import { renderPromptTemplate } from "@superset/shared/agent-prompt-template";
import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import type {
	AgentLaunchSpec,
	ContentPart,
	ContextSection,
	LaunchContext,
	LaunchSourceKind,
} from "./types";

const USER_PROMPT_PLACEHOLDER_RE = /\{\{\s*userPrompt\s*\}\}/;
const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Build a V2-native AgentLaunchSpec from a resolved LaunchContext and the
 * selected agent's config.
 *
 * - Returns null for the "none" agent or when config is missing (matches
 *   V1's buildPromptAgentLaunchRequest semantics).
 * - The user-prompt section's content parts are spliced into spec.user
 *   *in place* at the template's {{userPrompt}} position — so a
 *   text + image + text rich-editor prompt keeps its inline ordering for
 *   chat agents. Terminal adapters flatten later (step 7) by rendering
 *   file/image parts as markdown refs at their inline position.
 * - Text from {{tasks}}/{{issues}}/{{prs}}/{{attachments}} renders as
 *   surrounding text parts.
 * - spec.attachments carries only *explicit* attachment-kind sections
 *   (dragged/dropped files). Inline file/image parts from the user
 *   prompt stay inline in spec.user.
 */
export function buildLaunchSpec(
	ctx: LaunchContext,
	agentConfig: ResolvedAgentConfig | undefined,
): AgentLaunchSpec | null {
	if (ctx.agent.id === "none" || !agentConfig) return null;

	const nonUserVariables = buildNonUserPromptVariables(ctx.sections);
	const userPromptParts = collectUserPromptContent(ctx.sections);

	const system = renderScalarTemplate(
		agentConfig.contextPromptTemplateSystem,
		nonUserVariables,
	);
	const user = renderUserTemplate(
		agentConfig.contextPromptTemplateUser,
		userPromptParts,
		nonUserVariables,
	);

	return {
		agentId: ctx.agent.id,
		system,
		user,
		attachments: collectExplicitAttachments(ctx.sections),
		taskSlug: ctx.taskSlug,
	};
}

function renderScalarTemplate(
	template: string,
	variables: Record<string, string>,
): ContentPart[] {
	const text = renderPromptTemplate(template, { ...variables, userPrompt: "" });
	return text ? [{ type: "text", text }] : [];
}

/**
 * Render the user template as a ContentPart sequence. The template is
 * split on {{userPrompt}}; the text before/after has its other
 * placeholders substituted raw (no trim / no line collapse) so
 * whitespace around {{userPrompt}} is preserved. The user-prompt
 * section's content parts are spliced in at that position. A final
 * pass collapses excess blank lines and trims document boundaries.
 */
function renderUserTemplate(
	template: string,
	userPromptParts: ContentPart[],
	nonUserVariables: Record<string, string>,
): ContentPart[] {
	// Whitespace-tolerant split on {{userPrompt}} / {{ userPrompt }} / etc.
	const match = template.match(USER_PROMPT_PLACEHOLDER_RE);
	const splitIndex = match?.index ?? -1;
	const [beforeRaw, afterRaw] =
		splitIndex === -1 || !match
			? ["", template]
			: [
					template.slice(0, splitIndex),
					template.slice(splitIndex + match[0].length),
				];

	const beforeText = substituteVariables(beforeRaw, nonUserVariables);
	const afterText = substituteVariables(afterRaw, nonUserVariables);

	const parts: ContentPart[] = [];
	if (splitIndex === -1) {
		// Template doesn't reference userPrompt: prepend parts so they
		// still reach the agent (rare; misconfigured template).
		parts.push(...userPromptParts);
		if (afterText) parts.push({ type: "text", text: afterText });
	} else {
		if (beforeText) parts.push({ type: "text", text: beforeText });
		parts.push(...userPromptParts);
		if (afterText) parts.push({ type: "text", text: afterText });
	}

	return finalize(mergeAdjacentTextParts(parts));
}

/**
 * Placeholder substitution with no trim / no newline collapse — for
 * template halves where surrounding whitespace is structural.
 */
function substituteVariables(
	template: string,
	variables: Record<string, string>,
): string {
	return template.replace(PLACEHOLDER_RE, (match, rawKey: string) => {
		const key = rawKey.trim();
		return Object.hasOwn(variables, key) ? variables[key] : match;
	});
}

/**
 * Normalize runs of 3+ newlines to 2 inside each text part, trim
 * leading whitespace on the first text part, trim trailing whitespace
 * on the last text part. Drops text parts that become empty.
 */
function finalize(parts: ContentPart[]): ContentPart[] {
	const out: ContentPart[] = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (!part) continue;
		if (part.type !== "text") {
			out.push(part);
			continue;
		}
		let text = part.text.replace(/\n{3,}/g, "\n\n");
		if (i === 0) text = text.replace(/^\s+/, "");
		if (i === parts.length - 1) text = text.replace(/\s+$/, "");
		if (text.length === 0) continue;
		out.push({ type: "text", text });
	}
	return out;
}

function buildNonUserPromptVariables(
	sections: ContextSection[],
): Record<string, string> {
	return {
		tasks: renderKindBlock(sectionsOfKind(sections, "internal-task")),
		issues: renderKindBlock(sectionsOfKind(sections, "github-issue")),
		prs: renderKindBlock(sectionsOfKind(sections, "github-pr")),
		attachments: renderAttachmentsList(sections),
	};
}

function sectionsOfKind(
	sections: ContextSection[],
	kind: LaunchSourceKind,
): ContextSection[] {
	return sections.filter((s) => s.kind === kind);
}

function textPartsOf(section: ContextSection): string[] {
	return section.content
		.filter(
			(p): p is Extract<ContentPart, { type: "text" }> => p.type === "text",
		)
		.map((p) => p.text);
}

function collectUserPromptContent(sections: ContextSection[]): ContentPart[] {
	return sectionsOfKind(sections, "user-prompt").flatMap((s) => s.content);
}

function renderKindBlock(sections: ContextSection[]): string {
	if (sections.length === 0) return "";
	return sections
		.map((s) => textPartsOf(s).join("\n\n"))
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Attachments block covers (a) explicit attachment-kind sections and
 * (b) inline non-text parts from the user prompt — so CLI agents
 * reading just the prompt text still see a reference to every
 * file/image, with a framing header cueing the agent to actually read
 * them rather than treating them as passive metadata.
 */
function renderAttachmentsList(sections: ContextSection[]): string {
	const refs: string[] = [];
	for (const section of sectionsOfKind(sections, "attachment")) {
		refs.push(`- .superset/attachments/${section.label}`);
	}
	for (const section of sectionsOfKind(sections, "user-prompt")) {
		for (const part of section.content) {
			if (part.type === "text") continue;
			const label = part.type === "file" ? part.filename : undefined;
			refs.push(`- .superset/attachments/${label ?? "inline-attachment"}`);
		}
	}
	if (refs.length === 0) return "";
	return [
		"# Attached files",
		"",
		"The user attached these files alongside the prompt. They've been",
		"written into the worktree at `.superset/attachments/`. Read them",
		"to understand the request — they're part of the task, not",
		"optional reference.",
		"",
		refs.join("\n"),
	].join("\n");
}

function collectExplicitAttachments(sections: ContextSection[]): ContentPart[] {
	return sectionsOfKind(sections, "attachment").flatMap((s) =>
		s.content.filter((p) => p.type !== "text"),
	);
}

function mergeAdjacentTextParts(parts: ContentPart[]): ContentPart[] {
	const merged: ContentPart[] = [];
	for (const part of parts) {
		const last = merged[merged.length - 1];
		if (part.type === "text" && last?.type === "text") {
			merged[merged.length - 1] = {
				type: "text",
				text: last.text + part.text,
			};
		} else {
			merged.push(part);
		}
	}
	return merged;
}
