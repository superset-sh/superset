import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { MessageCircleQuestionIcon } from "lucide-react";
import { useMemo } from "react";
import type { ToolPart } from "../../../../utils/tool-helpers";

interface QuestionToolOption {
	label: string;
	description?: string;
}

interface QuestionToolQuestion {
	question: string;
	header?: string;
	options: QuestionToolOption[];
	multiSelect?: boolean;
}

interface AskUserQuestionToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	outputObject?: Record<string, unknown>;
	nestedResultObject?: Record<string, unknown>;
	isStreaming?: boolean;
	onAnswer?: (
		toolCallId: string,
		answers: Record<string, string>,
	) => Promise<void> | void;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
}

function toQuestionToolQuestions(value: unknown): QuestionToolQuestion[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item): QuestionToolQuestion | null => {
			if (typeof item !== "object" || item === null) return null;
			const record = item as Record<string, unknown>;
			const question =
				typeof record.question === "string" ? record.question.trim() : "";
			if (!question) return null;

			const options = Array.isArray(record.options)
				? record.options
						.map((option): QuestionToolOption | null => {
							if (typeof option !== "object" || option === null) return null;
							const optionRecord = option as Record<string, unknown>;
							const label =
								typeof optionRecord.label === "string"
									? optionRecord.label.trim()
									: "";
							if (!label) return null;
							const description =
								typeof optionRecord.description === "string"
									? optionRecord.description.trim()
									: "";
							return description ? { label, description } : { label };
						})
						.filter((option): option is QuestionToolOption => option !== null)
				: [];

			const header =
				typeof record.header === "string" ? record.header.trim() : "";
			const multiSelect =
				typeof record.multiSelect === "boolean" ? record.multiSelect : undefined;

			return {
				question,
				...(header ? { header } : {}),
				options,
				...(multiSelect === undefined ? {} : { multiSelect }),
			};
		})
		.filter((question): question is QuestionToolQuestion => question !== null);
}

function toQuestionToolAnswers(value: unknown): Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {};
	}

	const answers: Record<string, string> = {};
	for (const [key, answer] of Object.entries(value)) {
		if (typeof answer !== "string") continue;
		const trimmedKey = key.trim();
		const trimmedAnswer = answer.trim();
		if (!trimmedKey || !trimmedAnswer) continue;
		answers[trimmedKey] = trimmedAnswer;
	}

	return answers;
}

function findAnswerForQuestion({
	answers,
	questionText,
}: {
	answers: Record<string, string>;
	questionText: string;
}): string | undefined {
	const directAnswer = answers[questionText];
	if (directAnswer) return directAnswer;

	const trimmedQuestion = questionText.trim();
	for (const [answerKey, answerValue] of Object.entries(answers)) {
		if (answerKey.trim() === trimmedQuestion) return answerValue;
	}

	return undefined;
}

export function AskUserQuestionToolCall({
	part,
	args,
	result,
	outputObject,
	nestedResultObject,
}: AskUserQuestionToolCallProps) {
	const questions = useMemo(
		() => toQuestionToolQuestions(args.questions),
		[args.questions],
	);

	const answers = useMemo(
		() =>
			toQuestionToolAnswers(
				toRecord(result.answers) ??
					toRecord(outputObject?.answers) ??
					toRecord(nestedResultObject?.answers),
			),
		[nestedResultObject?.answers, outputObject?.answers, result.answers],
	);

	// Fallback for plain-string results: getResult() wraps them as { text: "..." }
	const answerFallbackText = useMemo(() => {
		if (typeof result.text === "string" && result.text.trim())
			return result.text.trim();
		if (typeof result.answer === "string" && result.answer.trim())
			return result.answer.trim();
		return undefined;
	}, [result.text, result.answer]);

	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const isError = part.state === "output-error";
	const hasAnswers =
		Object.keys(answers).length > 0 || answerFallbackText !== undefined;

	// No args available (tool_result-only path with input: {}) — nothing useful to show
	if (questions.length === 0 && !isError) return null;

	const isAnswered = !isPending && !isError && hasAnswers;
	// Skipped = pending-but-stopped, or result with no answers
	const isSkipped = !isPending && !isError && !hasAnswers;

	const description =
		questions.length > 1
			? `${questions.length} questions`
			: (questions[0]?.question ?? undefined);

	const answerTexts = useMemo(
		() =>
			questions
				.map((q) =>
					findAnswerForQuestion({ answers, questionText: q.question }),
				)
				.filter((a): a is string => a !== undefined),
		[questions, answers],
	);

	const questionContent =
		questions.length > 0 ? (
			<div className="space-y-2.5 py-1.5 pl-2">
				{questions.map((q, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: questions don't have unique keys
					<div key={i} className="text-xs text-muted-foreground">
						{q.question}
					</div>
				))}
			</div>
		) : undefined;

	return (
		<>
			<ToolCallRow
				description={description}
				icon={MessageCircleQuestionIcon}
				isError={isError}
				isPending={false}
				title="Question"
			>
				{questionContent}
			</ToolCallRow>
			{isSkipped && (
				<div className="flex items-center gap-2 px-1 py-0.5 text-xs text-muted-foreground">
					<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
						Question skipped
					</span>
				</div>
			)}
			{isAnswered && (answerTexts.length > 0 || answerFallbackText) && (
				<div className="flex flex-col items-end">
					<div className="rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground">
						{answerTexts.length > 0
							? answerTexts.join("\n")
							: answerFallbackText}
					</div>
				</div>
			)}
		</>
	);
}
