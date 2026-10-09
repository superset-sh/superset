import { Trans, useLingui } from "@lingui/react/macro";
import type { FormField } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { Check, PencilLine } from "lucide-react";
import {
	answerText,
	type FormValues,
	isInvalidNumber,
	type QuestionPage as Page,
} from "../../utils/questionPages";

type Choice = NonNullable<FormField["options"]>[number];

export function QuestionPage({
	page,
	question,
	choices,
	values,
	onPick,
	onType,
	onEnter,
}: {
	page: Page;
	question: string;
	choices: Choice[];
	values: FormValues;
	onPick: (value: string) => void;
	onType: (fieldId: string, text: string) => void;
	onEnter: () => void;
}) {
	const { t } = useLingui();
	const { field, other } = page;
	const multi = field.input === "multi";
	const numeric = field.input === "number" || field.input === "integer";
	const freeform = field.input === "text" || numeric;
	const current = values[field.id];
	const isPicked = (value: string) =>
		Array.isArray(current) ? current.includes(value) : current === value;
	const textField = freeform ? field : other;
	const typed = textField ? answerText(values[textField.id]) : "";
	const invalid = isInvalidNumber(field, values[field.id]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<p className="text-[15px] font-medium leading-snug text-foreground">
					{question}
				</p>
				{multi && (
					<p className="text-muted-foreground text-xs">
						<Trans>Select all that apply</Trans>
					</p>
				)}
			</div>
			<div className="flex flex-col gap-1">
				{choices.map((option, index) => {
					const picked = isPicked(option.value);
					return (
						<button
							aria-pressed={picked}
							className={cn(
								"group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none transition-all",
								"focus-visible:ring-2 focus-visible:ring-ring/50",
								picked
									? "border-foreground/25 bg-foreground/[0.07]"
									: "border-transparent hover:bg-foreground/[0.04]",
							)}
							key={option.value}
							onClick={() => onPick(option.value)}
							type="button"
						>
							<span
								className={cn(
									"flex size-[18px] shrink-0 items-center justify-center border transition-colors",
									multi ? "rounded-[5px]" : "rounded-full",
									picked
										? "border-foreground bg-foreground text-background"
										: "border-muted-foreground/40 group-hover:border-muted-foreground/70",
								)}
							>
								{picked && <Check className="size-3" strokeWidth={3} />}
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="font-medium leading-5">{option.label}</span>
								{option.description && (
									<span className="text-muted-foreground text-xs leading-relaxed">
										{option.description}
									</span>
								)}
							</span>
							{index < 9 && (
								<kbd className="hidden shrink-0 rounded border border-border/60 px-1.5 font-mono text-[10px] text-muted-foreground/70 group-hover:inline-block">
									{index + 1}
								</kbd>
							)}
						</button>
					);
				})}
				{textField && (
					<label
						className={cn(
							"flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
							"focus-within:border-foreground/25 focus-within:bg-foreground/[0.04]",
							typed
								? "border-foreground/25 bg-foreground/[0.07]"
								: "border-transparent hover:bg-foreground/[0.04]",
						)}
					>
						<PencilLine className="size-[18px] shrink-0 p-0.5 text-muted-foreground" />
						<input
							aria-invalid={invalid || undefined}
							aria-label={textField.description ?? textField.title ?? t`Other`}
							className="h-6 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
							inputMode={
								field.input === "integer"
									? "numeric"
									: field.input === "number"
										? "decimal"
										: undefined
							}
							onChange={(event) => onType(textField.id, event.target.value)}
							onKeyDown={(event) => {
								event.stopPropagation();
								if (event.key === "Enter") onEnter();
							}}
							placeholder={
								field.input === "integer"
									? t`Enter a whole number`
									: field.input === "number"
										? t`Enter a number`
										: freeform
											? t`Type your answer`
											: multi
												? t`Something else? Add it here`
												: t`Something else? Type your own answer`
							}
							step={field.input === "integer" ? 1 : "any"}
							type={numeric ? "number" : "text"}
							value={typed}
						/>
					</label>
				)}
				{invalid && (
					<p className="px-3 text-destructive text-xs">
						{field.input === "integer" ? (
							<Trans>Enter a whole number</Trans>
						) : (
							<Trans>Enter a number</Trans>
						)}
					</p>
				)}
			</div>
		</div>
	);
}
