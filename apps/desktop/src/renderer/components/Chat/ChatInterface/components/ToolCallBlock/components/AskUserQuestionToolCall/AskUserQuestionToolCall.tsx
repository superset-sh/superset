import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import {
	CheckIcon,
	CircleXIcon,
	ClockIcon,
	MessageCircleQuestionIcon,
	XIcon,
} from "lucide-react";
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
	isInterrupted?: boolean;
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
				typeof record.multiSelect === "boolean"
					? record.multiSelect
					: undefined;

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

type QuestionStatus = "awaiting" | "answered" | "cancelled";

const QUESTION_STATUS_CONFIG: Record<
	QuestionStatus,
	{ label: string; icon: typeof ClockIcon }
> = {
	awaiting: { label: "Awaiting Response", icon: ClockIcon },
	answered: { label: "Answered", icon: CheckIcon },
	cancelled: { label: "Cancelled", icon: XIcon },
};

function QuestionStatusDescription({ status }: { status: QuestionStatus }) {
	const { label, icon: Icon } = QUESTION_STATUS_CONFIG[status];
	return (
		<span className="ml-2 flex items-center gap-1 font-medium uppercase tracking-wide">
			<Icon className="h-3 w-3 shrink-0" />
			{label}
		</span>
	);
}

function toSingleQuestion(
	args: Record<string, unknown>,
): QuestionToolQuestion[] {
	const question =
		typeof args.question === "string" ? args.question.trim() : "";
	if (!question) return [];

	const options = Array.isArray(args.options)
		? args.options
				.map((opt): QuestionToolOption | null => {
					if (typeof opt !== "object" || opt === null) return null;
					const o = opt as Record<string, unknown>;
					const label = typeof o.label === "string" ? o.label.trim() : "";
					if (!label) return null;
					const description =
						typeof o.description === "string" ? o.description.trim() : "";
					return description ? { label, description } : { label };
				})
				.filter((o): o is QuestionToolOption => o !== null)
		: [];

	return [{ question, options }];
}

export function AskUserQuestionToolCall({
	part,
	args,
	result,
	outputObject,
	nestedResultObject,
	isInterrupted,
}: AskUserQuestionToolCallProps) {
	const questions = useMemo(
		() =>
			Array.isArray(args.questions)
				? toQuestionToolQuestions(args.questions)
				: toSingleQuestion(args),
		[args],
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

	// Mastracode sends { isError: true, content: "..." } for aborted questions
	const isResultError = result.isError === true;

	// Fallback for plain-string results and mastracode's { content: "User answered: <answer>" } format
	const answerFallbackText = useMemo(() => {
		// Error results are not answers
		if (isResultError) return undefined;
		if (typeof result.text === "string" && result.text.trim())
			return result.text.trim();
		if (typeof result.answer === "string" && result.answer.trim())
			return result.answer.trim();
		// ask_user tool returns { content: "User answered: <answer>", isError: false }
		if (typeof result.content === "string" && result.content.trim()) {
			const raw = result.content.trim();
			const prefix = "User answered: ";
			return raw.startsWith(prefix) ? raw.slice(prefix.length).trim() : raw;
		}
		return undefined;
	}, [isResultError, result.text, result.answer, result.content]);

	const isCancelledByStop =
		!!isInterrupted &&
		part.state !== "output-available" &&
		part.state !== "output-error";
	const isPending =
		!isCancelledByStop &&
		part.state !== "output-available" &&
		part.state !== "output-error";
	const isCancelledByError = part.state === "output-error" || isResultError;
	const hasAnswers =
		Object.keys(answers).length > 0 || answerFallbackText !== undefined;

	const answeredQAs = useMemo(
		() =>
			questions
				.map((q) => ({
					question: q.question,
					answer: findAnswerForQuestion({ answers, questionText: q.question }),
				}))
				.filter(
					(qa): qa is { question: string; answer: string } =>
						qa.answer !== undefined,
				),
		[questions, answers],
	);

	// No args available (tool_result-only path with input: {}) — nothing useful to show
	if (questions.length === 0 && !isCancelledByError && !isCancelledByStop)
		return null;

	const isAnswered =
		!isPending && !isCancelledByError && !isCancelledByStop && hasAnswers;
	const isCancelled =
		!isPending && !isCancelledByError && !isCancelledByStop && !hasAnswers;

	// Fallback for plain-string result when questions array has one entry
	const fallbackQA =
		answeredQAs.length === 0 && answerFallbackText && questions[0]
			? { question: questions[0].question, answer: answerFallbackText }
			: null;

	const qasToShow =
		answeredQAs.length > 0 ? answeredQAs : fallbackQA ? [fallbackQA] : [];

	return (
		<ToolCallRow
			icon={MessageCircleQuestionIcon}
			isPending={false}
			isError={false}
			title="Question"
			description={
				isPending ? (
					<QuestionStatusDescription status="awaiting" />
				) : isAnswered ? (
					<QuestionStatusDescription status="answered" />
				) : isCancelled || isCancelledByError || isCancelledByStop ? (
					<QuestionStatusDescription status="cancelled" />
				) : undefined
			}
		>
			{isAnswered && qasToShow.length > 0
				? qasToShow.map((qa) => (
						<div key={qa.question} className="space-y-1 px-3 py-2">
							<div className="text-xs text-muted-foreground">{qa.question}</div>
							<div className="text-sm text-foreground">{qa.answer}</div>
						</div>
					))
				: (isCancelledByError || isCancelledByStop) && questions.length > 0
					? questions.map((q) => (
							<div key={q.question} className="space-y-1 px-3 py-2">
								<div className="text-xs text-muted-foreground">
									{q.question}
								</div>
								<div className="flex items-center gap-1 text-sm text-destructive">
									<CircleXIcon className="h-3 w-3 shrink-0" />
									Aborted by the user
								</div>
							</div>
						))
					: undefined}
		</ToolCallRow>
	);
}
