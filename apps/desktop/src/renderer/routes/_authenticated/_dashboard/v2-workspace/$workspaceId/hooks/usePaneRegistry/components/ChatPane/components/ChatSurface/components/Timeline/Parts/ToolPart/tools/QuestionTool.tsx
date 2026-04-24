/**
 * In-timeline Question tool renderer. Only shows the answered state —
 * while pending, the QuestionDock above the composer handles it.
 * OpenCode port of message-part.tsx:2259-2299.
 */

import type { ToolPart } from "@superset/chat/shared";
import { MessageCircleQuestion } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import { inputAsRecord, isToolError, statusFromToolState } from "../toolHelpers";

interface QuestionItem {
	question: string;
	answers?: string[];
	answer?: string;
}

function extractQuestions(state: ToolPart["state"]): QuestionItem[] {
	const input = inputAsRecord(state);
	const output =
		state.kind === "completed" && state.output && typeof state.output === "object"
			? (state.output as Record<string, unknown>)
			: undefined;

	const raw =
		(input?.questions as unknown) ??
		(output?.questions as unknown) ??
		(output?.answers as unknown);
	if (!Array.isArray(raw)) return [];

	const out: QuestionItem[] = [];
	for (const q of raw) {
		if (typeof q === "string") {
			out.push({ question: q });
			continue;
		}
		if (!q || typeof q !== "object") continue;
		const rec = q as Record<string, unknown>;
		const question =
			(typeof rec.question === "string" && rec.question) ||
			(typeof rec.prompt === "string" && rec.prompt) ||
			"";
		if (!question) continue;

		const answers: string[] = [];
		const ansField = rec.answers ?? rec.answer;
		if (typeof ansField === "string") answers.push(ansField);
		else if (Array.isArray(ansField)) {
			for (const a of ansField) if (typeof a === "string") answers.push(a);
		}
		out.push({ question, answers });
	}
	return out;
}

export function QuestionTool({ part }: { part: ToolPart }) {
	if (isToolError(part) && part.state.kind === "error") {
		return <ToolErrorCard tool="Question" error={part.state.error.message} />;
	}

	// While pending/running, the QuestionDock above the composer is in
	// charge. Suppress the inline card to avoid duplication.
	if (
		part.state.kind === "input-streaming" ||
		part.state.kind === "running"
	) {
		return null;
	}

	const questions = extractQuestions(part.state);
	const subtitle =
		questions.length === 1
			? "1 question"
			: `${questions.length} questions`;

	return (
		<BasicTool
			icon={MessageCircleQuestion}
			status={statusFromToolState(part.state)}
			defaultOpen
			hideDetails={questions.length === 0}
			trigger={{ title: "Q&A", subtitle }}
		>
			<ul className="space-y-2">
				{questions.map((q, idx) => (
					<li key={`${idx}:${q.question}`} className="text-[12px]">
						<div className="text-muted-foreground mb-0.5">{q.question}</div>
						<div className="text-foreground">
							{q.answers && q.answers.length > 0
								? q.answers.join(", ")
								: "(no answer)"}
						</div>
					</li>
				))}
			</ul>
		</BasicTool>
	);
}
