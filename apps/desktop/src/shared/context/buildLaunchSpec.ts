import { renderPromptTemplate } from "@superset/shared/agent-prompt-template";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import type {
	AgentLaunchSpec,
	ContentPart,
	ContextSection,
	LaunchContext,
	LaunchSourceKind,
} from "./types";

/**
 * Build a V2-native AgentLaunchSpec from a resolved LaunchContext and the
 * selected agent's config.
 *
 * - Returns null for the "none" agent or when config is missing (matches
 *   V1's buildPromptAgentLaunchRequest semantics).
 * - Renders per-kind markdown sub-blocks into the template variables
 *   (userPrompt, tasks, issues, prs, attachments).
 * - Fills the agent's system + user templates to produce ContentPart[].
 * - Collects non-text parts (from user-prompt inline drops + explicit
 *   attachment sections) into `attachments` — keeps them structured for
 *   chat agents; terminal adapters flatten later in executeAgentLaunch.
 */
export function buildLaunchSpec(
	ctx: LaunchContext,
	agentConfig: ResolvedAgentConfig | undefined,
): AgentLaunchSpec | null {
	if (ctx.agent.id === "none" || !agentConfig) return null;

	const variables = buildTemplateVariables(ctx.sections);

	const systemText = renderPromptTemplate(
		agentConfig.contextPromptTemplateSystem,
		variables,
	);
	const userText = renderPromptTemplate(
		agentConfig.contextPromptTemplateUser,
		variables,
	);

	const system: ContentPart[] = systemText
		? [{ type: "text", text: systemText }]
		: [];
	const user: ContentPart[] = userText
		? [{ type: "text", text: userText }]
		: [];

	return {
		agentId: ctx.agent.id,
		system,
		user,
		attachments: collectAttachments(ctx.sections),
		taskSlug: ctx.taskSlug,
	};
}

function buildTemplateVariables(
	sections: ContextSection[],
): Record<string, string> {
	return {
		userPrompt: renderUserPromptText(sectionsOfKind(sections, "user-prompt")),
		tasks: renderKindBlock(sectionsOfKind(sections, "internal-task")),
		issues: renderKindBlock(sectionsOfKind(sections, "github-issue")),
		prs: renderKindBlock(sectionsOfKind(sections, "github-pr")),
		attachments: renderAttachmentsList(sectionsOfKind(sections, "attachment")),
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
		.filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
		.map((p) => p.text);
}

function renderUserPromptText(sections: ContextSection[]): string {
	return sections
		.flatMap(textPartsOf)
		.join("\n\n")
		.trim();
}

function renderKindBlock(sections: ContextSection[]): string {
	if (sections.length === 0) return "";
	return sections
		.map((s) => textPartsOf(s).join("\n\n"))
		.filter(Boolean)
		.join("\n\n");
}

function renderAttachmentsList(sections: ContextSection[]): string {
	if (sections.length === 0) return "";
	return sections.map((s) => `- .superset/attachments/${s.label}`).join("\n");
}

function collectAttachments(sections: ContextSection[]): ContentPart[] {
	const parts: ContentPart[] = [];
	for (const section of sections) {
		// explicit attachments (file/image parts) + inline non-text parts
		// anywhere else (e.g. rich-editor user prompt with inline image)
		for (const part of section.content) {
			if (part.type !== "text") parts.push(part);
		}
	}
	return parts;
}
