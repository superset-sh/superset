import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface QuestionOption {
	label: string;
	description?: string;
}

interface PendingQuestion {
	questionId: string;
	question: string;
	options?: Array<{ label: string; description?: string }>;
}

interface AnsweredQuestion {
	questionId: string;
	question: string;
	options: QuestionOption[];
	answer: string;
}

interface QuestionFooterProps {
	question: PendingQuestion;
	isSubmitting: boolean;
	onRespond: (questionId: string, answer: string) => Promise<void>;
}

export function QuestionFooter({
	question,
	isSubmitting,
	onRespond,
}: QuestionFooterProps) {
	const [freeText, setFreeText] = useState("");
	const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null);
	const [selectedOptionLabel, setSelectedOptionLabel] = useState<string | null>(
		null,
	);
	const [history, setHistory] = useState<AnsweredQuestion[]>([]);
	const [viewIndex, setViewIndex] = useState<number | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const inFlightResponseRef = useRef(false);
	const previousQuestionRef = useRef<{
		questionId: string;
		questionText: string;
		options: QuestionOption[];
	} | null>(null);

	const options = useMemo(() => {
		if (!question.options) return [];
		return question.options.filter((option): option is QuestionOption => {
			return (
				typeof option?.label === "string" &&
				option.label.trim().length > 0 &&
				(typeof option?.description === "undefined" ||
					typeof option.description === "string")
			);
		});
	}, [question.options]);

	// When question changes, archive the previous answered question into history
	useEffect(() => {
		const currentQuestionId = question.questionId ?? null;
		const prev = previousQuestionRef.current;

		if (prev !== null && prev.questionId !== currentQuestionId && optimisticAnswer !== null) {
			setHistory((h) => {
				if (h.some((entry) => entry.questionId === prev.questionId)) return h;
				return [
					...h,
					{
						questionId: prev.questionId,
						question: prev.questionText,
						options: prev.options,
						answer: optimisticAnswer,
					},
				];
			});
		}

		previousQuestionRef.current = {
			questionId: question.questionId ?? "",
			questionText: question.question?.trim() || "The agent asked a question.",
			options,
		};

		setFreeText("");
		setOptimisticAnswer(null);
		setSelectedOptionLabel(null);
		setViewIndex(null);
	}, [question.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (viewIndex === null) {
			inputRef.current?.focus();
		}
	}, [question.questionId, viewIndex]);

	const questionId = question.questionId?.trim() ?? "";
	const questionText =
		question.question?.trim() || "The agent asked a question.";
	const answerText = freeText.trim();
	const canRespond = questionId.length > 0;
	const hasOptimisticAnswer = optimisticAnswer !== null;
	const controlsDisabled = isSubmitting || !canRespond || hasOptimisticAnswer;

	const isViewingHistory = viewIndex !== null;
	const viewedEntry = isViewingHistory ? history[viewIndex] : null;

	const totalCount = history.length + 1;
	const currentIndex = viewIndex ?? history.length;

	const canGoBack = currentIndex > 0;
	const canGoForward = isViewingHistory;

	const handleGoBack = useCallback(() => {
		if (!canGoBack) return;
		setViewIndex(currentIndex - 1);
	}, [canGoBack, currentIndex]);

	const handleGoForward = useCallback(() => {
		if (!canGoForward) return;
		const nextIndex = (viewIndex ?? 0) + 1;
		setViewIndex(nextIndex >= history.length ? null : nextIndex);
	}, [canGoForward, viewIndex, history.length]);

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
		<div className="bg-background px-4 py-3">
			<div className="mx-auto w-full max-w-[680px] space-y-3">
				{totalCount > 1 && (
					<div className="flex items-center justify-between">
						<span className="text-xs text-muted-foreground">
							Question {currentIndex + 1} of {totalCount}
						</span>
						<div className="flex items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								disabled={!canGoBack}
								onClick={handleGoBack}
								aria-label="Previous question"
							>
								<ChevronLeftIcon className="size-3.5" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								disabled={!canGoForward}
								onClick={handleGoForward}
								aria-label="Next question"
							>
								<ChevronRightIcon className="size-3.5" />
							</Button>
						</div>
					</div>
				)}

				<div className="rounded-xl border bg-card/50 p-4">
					{isViewingHistory && viewedEntry ? (
						<>
							<div className="mb-3 text-sm text-foreground">
								{viewedEntry.question}
							</div>
							<div className="rounded-md border bg-muted/20 p-3">
								<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									Your answer
								</div>
								<div className="mt-1 text-sm text-foreground">
									{viewedEntry.answer}
								</div>
							</div>
						</>
					) : (
						<>
							<div className="mb-3 text-sm text-foreground">
								{questionText}
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
							) : (
								<>
									{options.length > 0 && (
										<div className="mb-3 flex flex-wrap gap-2">
											{options.map((option, index) => (
												<Button
													key={`${option.label}-${index}`}
													type="button"
													variant="outline"
													size="sm"
													className={`h-auto px-3 py-1.5 text-left ${
														selectedOptionLabel === option.label
															? "border-primary bg-primary/10 text-primary"
															: ""
													}`}
													disabled={controlsDisabled}
													onClick={() => {
														void handleOptionSelect(option.label);
													}}
												>
													{option.label}
												</Button>
											))}
										</div>
									)}

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
											className="flex-1"
										/>
										<Button
											type="submit"
											size="sm"
											disabled={controlsDisabled || answerText.length === 0}
										>
											{isSubmitting || hasOptimisticAnswer
												? "Sending..."
												: "Send"}
										</Button>
									</form>
								</>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
