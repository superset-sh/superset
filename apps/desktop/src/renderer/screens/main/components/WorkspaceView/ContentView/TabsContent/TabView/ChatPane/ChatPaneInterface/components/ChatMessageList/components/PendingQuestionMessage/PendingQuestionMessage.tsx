import type { UseChatDisplayReturn } from "@superset/chat/client";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useEffect, useMemo, useRef, useState } from "react";

type PendingQuestion = UseChatDisplayReturn["pendingQuestion"];

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
	const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null);
	const [selectedOptionLabel, setSelectedOptionLabel] = useState<string | null>(
		null,
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const inFlightResponseRef = useRef(false);
	const previousQuestionIdRef = useRef<string | null>(null);

	const options = useMemo(() => {
		if (!question?.options) return [];
		return question.options.filter((option): option is QuestionOption => {
			return (
				typeof option?.label === "string" &&
				option.label.trim().length > 0 &&
				(typeof option?.description === "undefined" ||
					typeof option.description === "string")
			);
		});
	}, [question?.options]);

	useEffect(() => {
		const currentQuestionId = question?.questionId ?? null;
		if (previousQuestionIdRef.current === currentQuestionId) return;
		previousQuestionIdRef.current = currentQuestionId;
		setFreeText("");
		setOptimisticAnswer(null);
		setSelectedOptionLabel(null);
	}, [question]);

	useEffect(() => {
		if (!question || options.length > 0) return;
		inputRef.current?.focus();
	}, [options.length, question]);

	if (!question) return null;

	const questionId = question.questionId?.trim() ?? "";
	const questionText =
		question.question?.trim() || "The agent asked a question.";
	const answerText = freeText.trim();
	const canRespond = questionId.length > 0;
	const hasOptimisticAnswer = optimisticAnswer !== null;
	const controlsDisabled = isSubmitting || !canRespond || hasOptimisticAnswer;

	const handleOptionSelect = async (optionLabel: string): Promise<void> => {
		if (!canRespond || isSubmitting || inFlightResponseRef.current) return;
		inFlightResponseRef.current = true;
		const previousSelection = selectedOptionLabel;
		setSelectedOptionLabel(optionLabel);
		setOptimisticAnswer(optionLabel);
		try {
			await onRespond(questionId, optionLabel);
		} catch (error) {
			console.error("Failed to submit question option response", error);
			setOptimisticAnswer(null);
			setSelectedOptionLabel(previousSelection);
		} finally {
			inFlightResponseRef.current = false;
		}
	};

	const handleFreeTextSubmit = async (): Promise<void> => {
		if (
			!canRespond ||
			!answerText ||
			isSubmitting ||
			inFlightResponseRef.current
		) {
			return;
		}
		inFlightResponseRef.current = true;
		setOptimisticAnswer(answerText);
		try {
			await onRespond(questionId, answerText);
		} catch (error) {
			console.error("Failed to submit question free-text response", error);
			setOptimisticAnswer(null);
		} finally {
			inFlightResponseRef.current = false;
		}
	};

	return (
		<Message from="assistant">
			<MessageContent>
				<div className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3">
					<div className="rounded-md border bg-muted/20 p-3">
						<MessageResponse
							animated={false}
							isAnimating={false}
							mermaid={{
								config: {
									theme: "default",
								},
							}}
						>
							{questionText}
						</MessageResponse>
					</div>

					{hasOptimisticAnswer ? (
						<div className="rounded-md border bg-muted/20 p-3">
							<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
								Submitted answer
							</div>
							<div className="mt-1 text-sm text-foreground">
								{optimisticAnswer}
							</div>
							<div className="mt-1 text-xs text-muted-foreground">
								Waiting for agent confirmation...
							</div>
						</div>
					) : options.length > 0 ? (
						<div className="space-y-2">
							{options.map((option, index) => (
								<Button
									key={`${option.label}-${index}`}
									type="button"
									variant="outline"
									className={`h-auto w-full justify-start px-3 py-2 text-left ${
										selectedOptionLabel === option.label
											? "border-primary bg-primary/10 text-primary"
											: ""
									}`}
									disabled={controlsDisabled}
									onClick={() => {
										void handleOptionSelect(option.label);
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
							onSubmit={async (event) => {
								event.preventDefault();
								await handleFreeTextSubmit();
							}}
						>
							<Input
								ref={inputRef}
								value={freeText}
								onChange={(event) => setFreeText(event.target.value)}
								placeholder="Type your answer..."
								disabled={controlsDisabled}
							/>
							<Button
								type="submit"
								disabled={controlsDisabled || answerText.length === 0}
							>
								{isSubmitting || hasOptimisticAnswer ? "Sending..." : "Submit"}
							</Button>
						</form>
					)}
				</div>
			</MessageContent>
		</Message>
	);
}
