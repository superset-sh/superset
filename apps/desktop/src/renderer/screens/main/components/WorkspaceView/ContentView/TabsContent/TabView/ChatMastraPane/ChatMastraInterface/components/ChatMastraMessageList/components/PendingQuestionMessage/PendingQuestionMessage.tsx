import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useEffect, useMemo, useRef, useState } from "react";

type PendingQuestion = UseMastraChatDisplayReturn["pendingQuestion"];

interface QuestionOption {
	label: string;
	description?: string;
}

interface PendingQuestionMessageProps {
	question: PendingQuestion;
	isSubmitting: boolean;
	onRespond: (questionId: string, answer: string) => Promise<void>;
}

export function PendingQuestionMessage({
	question,
	isSubmitting,
	onRespond,
}: PendingQuestionMessageProps) {
	const [freeText, setFreeText] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const previousQuestionIdRef = useRef<string | null>(null);

	const options = useMemo(() => {
		if (!question?.options) return [];
		return question.options.filter((option): option is QuestionOption => {
			return (
				typeof option?.label === "string" && option.label.trim().length > 0
			);
		});
	}, [question?.options]);

	useEffect(() => {
		const currentQuestionId = question?.questionId ?? null;
		if (previousQuestionIdRef.current === currentQuestionId) return;
		previousQuestionIdRef.current = currentQuestionId;
		setFreeText("");
	}, [question]);

	useEffect(() => {
		if (!question || options.length > 0) return;
		inputRef.current?.focus();
	}, [options.length, question]);

	if (!question) return null;

	const questionText =
		question?.question?.trim() || "The agent asked a question.";
	const answerText = freeText.trim();
	const canRespond = Boolean(question?.questionId);

	return (
		<Message from="assistant">
			<MessageContent>
				<div className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3">
					<div className="text-sm text-foreground">{questionText}</div>

					{options.length > 0 ? (
						<div className="space-y-2">
							{options.map((option) => (
								<Button
									key={option.label}
									type="button"
									variant="outline"
									className="h-auto w-full justify-start px-3 py-2 text-left"
									disabled={isSubmitting || !canRespond}
									onClick={() => {
										if (!question?.questionId) return;
										void onRespond(question.questionId, option.label);
									}}
								>
									<span className="flex flex-col">
										<span className="font-medium">{option.label}</span>
										{option.description ? (
											<span className="text-xs text-muted-foreground">
												{option.description}
											</span>
										) : null}
									</span>
								</Button>
							))}
						</div>
					) : (
						<form
							className="flex items-center gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (!question?.questionId || !answerText || isSubmitting)
									return;
								void onRespond(question.questionId, answerText);
							}}
						>
							<Input
								ref={inputRef}
								value={freeText}
								onChange={(event) => setFreeText(event.target.value)}
								placeholder="Type your answer..."
								disabled={isSubmitting || !canRespond}
							/>
							<Button
								type="submit"
								disabled={
									isSubmitting || !canRespond || answerText.length === 0
								}
							>
								{isSubmitting ? "Sending..." : "Submit"}
							</Button>
						</form>
					)}
				</div>
			</MessageContent>
		</Message>
	);
}
