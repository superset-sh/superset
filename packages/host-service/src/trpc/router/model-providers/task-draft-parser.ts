import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const TASK_PRIORITIES = [
	"none",
	"urgent",
	"high",
	"medium",
	"low",
] as const;

const rawTaskDraftSchema = z.object({
	title: z.string().trim().min(1).max(180),
	description: z.string().trim().nullish(),
	priority: z.enum(TASK_PRIORITIES).nullish(),
	labels: z.array(z.string()).nullish(),
	dueDate: z.string().trim().nullish(),
});

export type GeneratedTaskDraft = {
	title: string;
	description: string | null;
	priority: (typeof TASK_PRIORITIES)[number];
	labels: string[];
	dueDate: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLabel(value: string): string | null {
	const label = value.trim().replace(/\s+/g, " ").slice(0, 40);
	return label.length > 0 ? label : null;
}

function normalizeLabels(labels: string[] | null | undefined): string[] {
	if (!labels) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of labels) {
		const label = normalizeLabel(raw);
		if (!label) continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(label);
	}
	return out.slice(0, 8);
}

function normalizeDueDate(value: string | null | undefined): string | null {
	const date = value?.trim();
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const parsed = new Date(`${date}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : date;
}

export function parseTaskDraft(value: unknown): GeneratedTaskDraft {
	const draft = rawTaskDraftSchema.parse(value);
	return {
		title: draft.title,
		description: draft.description?.trim() || null,
		priority: draft.priority ?? "none",
		labels: normalizeLabels(draft.labels),
		dueDate: normalizeDueDate(draft.dueDate),
	};
}

function extractTextFromContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			if (!isRecord(block)) return "";
			return block.type === "text" && typeof block.text === "string"
				? block.text
				: "";
		})
		.filter(Boolean)
		.join("\n");
}

function parseJsonText(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const candidate = (fenced ?? text).trim();
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error("No JSON object found");
	}
	return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export function extractTaskDraftFromGatewayResponse(
	response: unknown,
): GeneratedTaskDraft {
	const content = isRecord(response) ? response.content : null;
	if (Array.isArray(content)) {
		const toolUse = content.find(
			(block) =>
				isRecord(block) &&
				block.type === "tool_use" &&
				block.name === "propose_task_draft" &&
				isRecord(block.input),
		);
		if (isRecord(toolUse) && isRecord(toolUse.input)) {
			return parseTaskDraft(toolUse.input);
		}

		const text = extractTextFromContent(content);
		if (text.trim()) {
			return parseTaskDraft(parseJsonText(text));
		}
	}

	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Model did not return a valid task draft",
	});
}
