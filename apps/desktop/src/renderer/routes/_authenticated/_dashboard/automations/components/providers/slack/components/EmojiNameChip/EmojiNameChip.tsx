import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuCheck } from "react-icons/lu";
import { ChipButton } from "../../../../TriggerSentence/components/ChipButton";
import { emojiLabel, parseEmojiNames } from "../../emoji";

const ROW =
	"flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-sm hover:bg-accent";

/**
 * One or more emoji names: the obvious choices as rows, anything else typed.
 *
 * Slack has no API that lists standard emoji, and a workspace's custom emoji
 * are the ones people most want to react with, so a full picker would always
 * be missing the one that matters. The rows cover "none" and the default;
 * typing in the field below takes over the selection, and the chip shows the
 * typed name back as ":name:" — colons and commas optional on the way in.
 */
export function EmojiNameChip({
	names,
	onChange,
	emptyLabel,
	placeholder,
	noneLabel,
	defaultName,
	disabled,
	className,
}: {
	names: string[];
	onChange: (names: string[]) => void;
	emptyLabel: string;
	placeholder: string;
	/**
	 * Label for an explicit "none" row. Absent where empty is not a choice —
	 * a reaction trigger has to name its reaction, so there is no row for
	 * clearing it, only the field.
	 */
	noneLabel?: string;
	/** A canonical choice worth its own row — the ✅ a completion defaults to. */
	defaultName?: string;
	disabled?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	// The field holds whatever was typed until the popover closes, so a
	// trailing comma or colon does not vanish under the person's cursor.
	const [draft, setDraft] = useState<string | null>(null);

	const isNone = names.length === 0;
	const isDefault =
		defaultName !== undefined && names.length === 1 && names[0] === defaultName;
	// Only a typed selection belongs in the field — echoing the default row's
	// name into it would read as two selections at once.
	const isTyped = !isNone && !isDefault;

	const label = isNone
		? emptyLabel
		: names.length === 1
			? emojiLabel(names[0] ?? "")
			: `${names.length} reactions`;

	const pick = (next: string[]) => {
		onChange(next);
		setDraft(null);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (disabled) return;
				setOpen(next);
				if (!next) setDraft(null);
			}}
		>
			<PopoverTrigger asChild>
				<span>
					<ChipButton
						label={label}
						empty={isNone}
						disabled={disabled}
						className={className}
					/>
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-1.5">
				{noneLabel !== undefined && (
					<button type="button" className={ROW} onClick={() => pick([])}>
						{noneLabel}
						{isNone && <LuCheck className="size-4" />}
					</button>
				)}
				{defaultName !== undefined && (
					<button
						type="button"
						className={ROW}
						onClick={() => pick([defaultName])}
					>
						{emojiLabel(defaultName)}
						{isDefault && <LuCheck className="size-4" />}
					</button>
				)}
				<Input
					value={draft ?? (isTyped ? names.map((n) => `:${n}:`).join(" ") : "")}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(event) => {
						setDraft(event.target.value);
						onChange(parseEmojiNames(event.target.value));
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") setOpen(false);
					}}
					className={
						noneLabel !== undefined || defaultName !== undefined
							? "mt-1.5 h-8 text-[13px]"
							: "h-8 text-[13px]"
					}
				/>
			</PopoverContent>
		</Popover>
	);
}
