"use client";

import {
	ChevronDownIcon,
	ChevronUpIcon,
	CornerDownLeftIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

type QuestionOption = {
	label: string;
	description?: string;
};

type Question = {
	question: string;
	header?: string;
	options: QuestionOption[];
	multiSelect?: boolean;
};

type UserQuestionToolProps = {
	questions: Question[];
	onAnswer: (answers: Record<string, string>) => void;
	onSkip: () => void;
	className?: string;
};

export const UserQuestionTool = ({
	questions,
	onAnswer,
	onSkip,
	className,
}: UserQuestionToolProps) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string[]>>({});
	const [focusedOption, setFocusedOption] = useState(0);
	const [isVisible, setIsVisible] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const prevIndexRef = useRef(currentIndex);

	const current = questions[currentIndex] as Question | undefined;
	const options = current?.options ?? [];
	const isMulti = current?.multiSelect ?? false;
	const isLast = currentIndex === questions.length - 1;
	const currentQuestion = current?.question ?? "";

	const currentHasAnswer = (answers[currentQuestion] ?? []).length > 0;
	const allAnswered = questions.every(
		(q) => (answers[q.question] ?? []).length > 0,
	);

	// Animate on question change
	useEffect(() => {
		if (prevIndexRef.current !== currentIndex) {
			setIsVisible(false);
			const timer = setTimeout(() => setIsVisible(true), 50);
			prevIndexRef.current = currentIndex;
			return () => clearTimeout(timer);
		}
	}, [currentIndex]);

	const handleOptionClick = useCallback(
		({
			questionText,
			optionLabel,
			questionIndex,
		}: {
			questionText: string;
			optionLabel: string;
			questionIndex: number;
		}) => {
			const question = questions[questionIndex];
			const allowMultiple = question?.multiSelect ?? false;
			const isLastQ = questionIndex === questions.length - 1;

			setAnswers((prev) => {
				const selected = prev[questionText] ?? [];
				if (allowMultiple) {
					return {
						...prev,
						[questionText]: selected.includes(optionLabel)
							? selected.filter((l) => l !== optionLabel)
							: [...selected, optionLabel],
					};
				}
				return { ...prev, [questionText]: [optionLabel] };
			});

			// Auto-advance for single-select
			if (!allowMultiple && !isLastQ) {
				setTimeout(() => {
					setCurrentIndex(questionIndex + 1);
					setFocusedOption(0);
				}, 150);
			}
		},
		[questions],
	);

	const handleContinue = useCallback(() => {
		if (isSubmitting || !currentHasAnswer) return;

		if (!isLast) {
			setCurrentIndex((i) => i + 1);
			setFocusedOption(0);
			return;
		}

		if (!allAnswered) return;
		setIsSubmitting(true);

		const formatted: Record<string, string> = {};
		for (const q of questions) {
			const selected = answers[q.question] ?? [];
			formatted[q.question] = selected.join(", ");
		}
		onAnswer(formatted);
	}, [
		isSubmitting,
		currentHasAnswer,
		isLast,
		allAnswered,
		questions,
		answers,
		onAnswer,
	]);

	const handleSkip = useCallback(() => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		onSkip();
	}, [isSubmitting, onSkip]);

	// Keyboard navigation
	useEffect(() => {
		if (questions.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (isSubmitting) return;

			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				active?.getAttribute("contenteditable") === "true"
			) {
				return;
			}

			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (focusedOption < options.length - 1) {
					setFocusedOption(focusedOption + 1);
				} else if (currentIndex < questions.length - 1) {
					setCurrentIndex(currentIndex + 1);
					setFocusedOption(0);
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (focusedOption > 0) {
					setFocusedOption(focusedOption - 1);
				} else if (currentIndex > 0) {
					const prevOptions = questions[currentIndex - 1]?.options ?? [];
					setCurrentIndex(currentIndex - 1);
					setFocusedOption(prevOptions.length - 1);
				}
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (currentHasAnswer) {
					handleContinue();
				} else if (options[focusedOption] && currentQuestion) {
					handleOptionClick({
						questionText: currentQuestion,
						optionLabel: options[focusedOption].label,
						questionIndex: currentIndex,
					});
				}
			} else if (e.key >= "1" && e.key <= "9") {
				const idx = Number.parseInt(e.key, 10) - 1;
				const opt = options[idx];
				if (opt && currentQuestion) {
					e.preventDefault();
					handleOptionClick({
						questionText: currentQuestion,
						optionLabel: opt.label,
						questionIndex: currentIndex,
					});
					setFocusedOption(idx);
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [
		options,
		currentQuestion,
		currentIndex,
		focusedOption,
		handleOptionClick,
		currentHasAnswer,
		handleContinue,
		questions,
		isSubmitting,
	]);

	if (questions.length === 0 || !current) return null;

	return (
		<div
			className={cn(
				"overflow-hidden rounded-t-xl border border-b-0 border-border bg-muted/30",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-1.5">
				<div className="flex items-center gap-1.5">
					<span className="text-xs text-muted-foreground">
						{current.header ?? "Question"}
					</span>
					<span className="text-muted-foreground/50">&middot;</span>
					<span className="text-xs text-muted-foreground">
						{isMulti ? "Multi-select" : "Single-select"}
					</span>
				</div>

				{questions.length > 1 && (
					<div className="flex items-center gap-1">
						<button
							className="rounded p-0.5 outline-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
							disabled={currentIndex === 0}
							onClick={() => {
								setCurrentIndex((i) => i - 1);
								setFocusedOption(0);
							}}
							type="button"
						>
							<ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
						</button>
						<span className="px-1 text-xs text-muted-foreground">
							{currentIndex + 1} / {questions.length}
						</span>
						<button
							className="rounded p-0.5 outline-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
							disabled={currentIndex === questions.length - 1}
							onClick={() => {
								setCurrentIndex((i) => i + 1);
								setFocusedOption(0);
							}}
							type="button"
						>
							<ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
						</button>
					</div>
				)}
			</div>

			{/* Current question */}
			<div
				className={cn(
					"px-1 pb-2 transition-opacity duration-150 ease-out",
					isVisible ? "opacity-100" : "opacity-0",
				)}
			>
				<div className="mb-3 px-2 pt-1 text-sm font-[450] text-foreground">
					<span className="text-muted-foreground">{currentIndex + 1}.</span>{" "}
					{current.question}
				</div>

				{/* Options */}
				<div className="space-y-1">
					{options.map((option, optIndex) => {
						const selected =
							answers[current.question]?.includes(option.label) ?? false;
						const focused = focusedOption === optIndex;

						return (
							<button
								className={cn(
									"flex w-full items-start gap-3 rounded-md p-2 text-left text-[13px] text-foreground outline-none transition-colors",
									focused ? "bg-muted/70" : "hover:bg-muted/50",
									isSubmitting && "cursor-not-allowed opacity-50",
								)}
								disabled={isSubmitting}
								key={option.label}
								onClick={() => {
									if (isSubmitting) return;
									handleOptionClick({
										questionText: current.question,
										optionLabel: option.label,
										questionIndex: currentIndex,
									});
									setFocusedOption(optIndex);
								}}
								type="button"
							>
								<div
									className={cn(
										"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-medium transition-colors",
										selected
											? "bg-foreground text-background"
											: "bg-muted text-muted-foreground",
									)}
								>
									{optIndex + 1}
								</div>
								<div className="flex flex-col gap-0.5">
									<span className="text-[13px] font-medium text-foreground">
										{option.label}
									</span>
									{option.description && (
										<span className="text-xs text-muted-foreground">
											{option.description}
										</span>
									)}
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-end gap-2 px-2 py-2">
				<Button
					className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
					disabled={isSubmitting}
					onClick={handleSkip}
					size="sm"
					variant="ghost"
				>
					Skip All
				</Button>
				<Button
					className="h-6 rounded-md px-3 text-xs"
					disabled={isSubmitting || (isLast ? !allAnswered : !currentHasAnswer)}
					onClick={handleContinue}
					size="sm"
				>
					{isSubmitting ? (
						"Sending..."
					) : (
						<>
							{isLast ? "Submit" : "Continue"}
							<CornerDownLeftIcon className="ml-1 h-3 w-3 opacity-60" />
						</>
					)}
				</Button>
			</div>
		</div>
	);
};
