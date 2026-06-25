import {
	ChevronDownIcon,
	ChevronUpIcon,
	CornerDownLeftIcon,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

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
	const [isSubmitting, setIsSubmitting] = useState(false);

	const current = questions[currentIndex] as Question | undefined;
	const options = current?.options ?? [];
	const isMulti = current?.multiSelect ?? false;
	const isLast = currentIndex === questions.length - 1;

	const currentHasAnswer = (answers[current?.question ?? ""] ?? []).length > 0;
	const allAnswered = questions.every(
		(q) => (answers[q.question] ?? []).length > 0,
	);

	const handleOptionPress = useCallback(
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
				}, 150);
			}
		},
		[questions],
	);

	const handleContinue = useCallback(() => {
		if (isSubmitting || !currentHasAnswer) return;

		if (!isLast) {
			setCurrentIndex((i) => i + 1);
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

	if (questions.length === 0 || !current) return null;

	return (
		<View
			className={cn(
				"overflow-hidden rounded-xl border border-border bg-card",
				className,
			)}
		>
			{/* Header */}
			<View className="flex-row items-center justify-between border-border/60 border-b bg-muted/20 px-3 py-1.5">
				<View className="flex-row items-center gap-1.5">
					<Text className="text-muted-foreground text-xs">
						{current.header ?? "Question"}
					</Text>
					<Text className="text-muted-foreground/50 text-xs">·</Text>
					<Text className="text-muted-foreground text-xs">
						{isMulti ? "Multi-select" : "Single-select"}
					</Text>
				</View>

				{questions.length > 1 ? (
					<View className="flex-row items-center gap-1">
						<Pressable
							accessibilityRole="button"
							className={cn(
								"rounded p-0.5 active:bg-muted",
								currentIndex === 0 && "opacity-30",
							)}
							disabled={currentIndex === 0}
							onPress={() => setCurrentIndex((i) => i - 1)}
						>
							<Icon
								as={ChevronUpIcon}
								className="size-4 text-muted-foreground"
							/>
						</Pressable>
						<Text className="px-1 text-muted-foreground text-xs">
							{currentIndex + 1} / {questions.length}
						</Text>
						<Pressable
							accessibilityRole="button"
							className={cn(
								"rounded p-0.5 active:bg-muted",
								currentIndex === questions.length - 1 && "opacity-30",
							)}
							disabled={currentIndex === questions.length - 1}
							onPress={() => setCurrentIndex((i) => i + 1)}
						>
							<Icon
								as={ChevronDownIcon}
								className="size-4 text-muted-foreground"
							/>
						</Pressable>
					</View>
				) : null}
			</View>

			{/* Current question */}
			<Animated.View
				className="px-1 pb-2"
				entering={FadeIn.duration(150)}
				key={currentIndex}
			>
				<View className="mb-3 flex-row px-2 pt-1">
					<Text className="text-foreground text-sm">
						<Text className="text-muted-foreground text-sm">
							{currentIndex + 1}.
						</Text>{" "}
						{current.question}
					</Text>
				</View>

				{/* Options */}
				<View className="gap-1">
					{options.map((option, optIndex) => {
						const selected =
							answers[current.question]?.includes(option.label) ?? false;

						return (
							<Pressable
								accessibilityRole="button"
								className={cn(
									"w-full flex-row items-start gap-3 rounded-md p-2 active:bg-muted/50",
									isSubmitting && "opacity-50",
								)}
								disabled={isSubmitting}
								key={option.label}
								onPress={() => {
									if (isSubmitting) return;
									handleOptionPress({
										questionText: current.question,
										optionLabel: option.label,
										questionIndex: currentIndex,
									});
								}}
							>
								<View
									className={cn(
										"mt-0.5 size-5 shrink-0 items-center justify-center rounded",
										selected ? "bg-foreground" : "bg-muted",
									)}
								>
									<Text
										className={cn(
											"font-medium text-[10px]",
											selected ? "text-background" : "text-muted-foreground",
										)}
									>
										{optIndex + 1}
									</Text>
								</View>
								<View className="min-w-0 flex-1 gap-0.5">
									<Text className="font-medium text-foreground text-sm">
										{option.label}
									</Text>
									{option.description ? (
										<Text className="text-muted-foreground text-xs">
											{option.description}
										</Text>
									) : null}
								</View>
							</Pressable>
						);
					})}
				</View>
			</Animated.View>

			{/* Footer */}
			<View className="flex-row items-center justify-end gap-2 border-border/60 border-t bg-muted/10 px-2 py-2">
				<Button
					className="h-8 px-2"
					disabled={isSubmitting}
					onPress={handleSkip}
					size="sm"
					variant="ghost"
				>
					<Text className="text-muted-foreground text-xs">Skip All</Text>
				</Button>
				<Button
					className="h-8 rounded-md px-3"
					disabled={isSubmitting || (isLast ? !allAnswered : !currentHasAnswer)}
					onPress={handleContinue}
					size="sm"
				>
					<Text className="text-xs">
						{isSubmitting ? "Sending..." : isLast ? "Submit" : "Continue"}
					</Text>
					{isSubmitting ? null : (
						<Icon as={CornerDownLeftIcon} className="size-3 opacity-60" />
					)}
				</Button>
			</View>
		</View>
	);
};
