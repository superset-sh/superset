import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { useEffect, useMemo, useRef, useState } from "react";

interface QuestionOption {
	label: string;
	description?: string;
}

interface PendingQuestion {
	questionId: string;
	question: string;
	options?: QuestionOption[];
}

interface QuestionDialogProps {
	question: PendingQuestion | null;
	isSubmitting: boolean;
	onRespond: (questionId: string, answer: string) => Promise<void>;
}

export function QuestionDialog({
	question,
	isSubmitting,
	onRespond,
}: QuestionDialogProps) {
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

	const open = Boolean(question);
	const questionText =
		question?.question?.trim() || "The agent asked a question.";
	const answerText = freeText.trim();
	const canRespond = Boolean(question?.questionId);

	return (
		<Dialog modal open={open}>
			<DialogContent
				showCloseButton={false}
				className="max-w-lg"
				onEscapeKeyDown={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Question from agent</DialogTitle>
					<DialogDescription>{questionText}</DialogDescription>
				</DialogHeader>

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
									if (!question) return;
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
						className="space-y-3"
						onSubmit={(event) => {
							event.preventDefault();
							if (!question || !answerText || isSubmitting) return;
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
						<DialogFooter>
							<Button
								type="submit"
								disabled={
									isSubmitting || !canRespond || answerText.length === 0
								}
							>
								{isSubmitting ? "Sending..." : "Submit"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
