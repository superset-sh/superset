import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ArrowUpIcon, Loader2Icon, PencilIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type QuestionOption = { label: string; description?: string };

interface QuestionInputOverlayProps {
	question: {
		questionId: string;
		question: string;
		description?: string;
		options?: QuestionOption[];
	};
	isSubmitting: boolean;
	onRespond: (questionId: string, answer: string) => Promise<void>;
	onCancel: () => void;
}

export function QuestionInputOverlay({
	question,
	isSubmitting,
	onRespond,
	onCancel,
}: QuestionInputOverlayProps) {
	const [customText, setCustomText] = useState("");
	// Tracks which label was submitted: an option label, "__custom__", or "__skip__".
	// null = nothing submitted yet.
	const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: question.questionId is an intentional re-run trigger
	useEffect(() => {
		setSubmittedLabel(null);
		setCustomText("");
	}, [question.questionId]);

	const options = question.options ?? [];
	const submitted = submittedLabel !== null;
	const isDisabled = isSubmitting || submitted;
	const hasCustomText = customText.trim().length > 0;
	// Spinner goes on the pencil icon when the answer came from the text input row.
	const isInputRowSubmitted =
		submitted && !options.some((o) => o.label === submittedLabel);

	const handleSubmitAnswer = (answer: string, label: string) => {
		if (isDisabled) return;
		setSubmittedLabel(label);
		onRespond(question.questionId, answer).catch(() => {
			setSubmittedLabel(null);
			setCustomText("");
		});
	};

	const handleOption = (label: string) => handleSubmitAnswer(label, label);
	const handleCustom = () => {
		const trimmed = customText.trim();
		if (!trimmed) return;
		handleSubmitAnswer(trimmed, "__custom__");
	};
	const handleSkip = () => handleSubmitAnswer("skip", "__skip__");

	return (
		<div className="flex max-h-[300px] flex-col overflow-hidden rounded-[13px] border-[0.5px] border-border bg-foreground/[0.02]">
			{/* Question — pinned header */}
			<div className="flex shrink-0 items-start gap-2 px-3 pt-3 pb-3">
				<div className="flex-1 space-y-1">
					<p className="text-sm leading-snug text-foreground">
						{question.question}
					</p>
					{question.description && (
						<p className="text-xs leading-snug text-muted-foreground">
							{question.description}
						</p>
					)}
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="-mr-0.5 shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
							onClick={onCancel}
							aria-label="Cancel"
						>
							<XIcon className="h-3.5 w-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Cancel</TooltipContent>
				</Tooltip>
			</div>

			{/* Options — scrollable */}
			{options.length > 0 && (
				<div
					className={cn(
						"overflow-y-auto px-2 transition-opacity duration-200",
						hasCustomText && !submitted && "opacity-25",
					)}
				>
					{options.map((option, i) => {
						const isChosen = submittedLabel === option.label;
						return (
							<div key={option.label} className="border-t border-border/60">
								<button
									type="button"
									className={cn(
										"group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
										isChosen ? "bg-foreground/[0.06]" : "hover:bg-muted/40",
										isDisabled && !isChosen && "cursor-not-allowed opacity-40",
									)}
									disabled={isDisabled}
									onClick={() => handleOption(option.label)}
								>
									<span className="flex size-6 shrink-0 items-center justify-center rounded-[3px] bg-muted/60 font-mono text-xs leading-none text-muted-foreground/70">
										{isChosen ? (
											<Loader2Icon className="size-3.5 animate-spin" />
										) : (
											i + 1
										)}
									</span>
									<span
										className={cn(
											"text-sm transition-colors",
											isChosen
												? "text-foreground"
												: "text-muted-foreground group-hover:text-foreground",
										)}
									>
										{option.label}
									</span>
								</button>
							</div>
						);
					})}
				</div>
			)}

			{/* Text input / skip — pinned footer */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: click-to-focus affordance */}
			<form
				className="mx-2 mb-2 mt-px shrink-0 flex cursor-text items-center gap-3 rounded-lg bg-black/20 px-2.5 py-2 ring-1 ring-inset ring-border/60"
				onSubmit={(e) => {
					e.preventDefault();
					handleCustom();
				}}
				onClick={() => inputRef.current?.focus()}
			>
				<span className="flex size-6 shrink-0 items-center justify-center rounded-[3px] bg-muted/60">
					{isInputRowSubmitted ? (
						<Loader2Icon className="size-3.5 animate-spin text-muted-foreground/70" />
					) : (
						<PencilIcon className="size-3.5 text-muted-foreground/70" />
					)}
				</span>
				<input
					ref={inputRef}
					value={customText}
					onChange={(e) => setCustomText(e.target.value)}
					placeholder={
						options.length > 0 ? "Something else" : "Type your answer..."
					}
					disabled={isDisabled}
					className="flex-1 cursor-text bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed"
				/>
				{!isDisabled && (
					<div className="relative shrink-0">
						<button
							type="button"
							className={cn(
								"rounded-sm border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-foreground/30 hover:text-foreground",
								hasCustomText ? "pointer-events-none opacity-0" : "opacity-100",
							)}
							onClick={(e) => {
								e.stopPropagation();
								handleSkip();
							}}
						>
							Skip
						</button>
						<button
							type="submit"
							className={cn(
								"absolute right-0 top-1/2 -translate-y-1/2 size-[23px] rounded-full bg-foreground p-[5px] transition-all duration-150 hover:bg-foreground/80",
								hasCustomText ? "opacity-100" : "pointer-events-none opacity-0",
							)}
							aria-label="Submit"
							onClick={(e) => e.stopPropagation()}
						>
							<ArrowUpIcon className="size-3.5 text-background" />
						</button>
					</div>
				)}
			</form>
		</div>
	);
}
