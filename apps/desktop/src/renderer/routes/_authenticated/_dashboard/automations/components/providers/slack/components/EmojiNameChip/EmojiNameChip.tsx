import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { ChipButton } from "../../../../TriggerSentence/components/ChipButton";
import { emojiLabel, parseEmojiNames } from "../../emoji";

/**
 * One or more emoji names, typed rather than picked.
 *
 * Slack has no API that lists standard emoji, and a workspace's custom emoji
 * are the ones people most want to react with, so a picker would always be
 * missing the one that matters. Typing ":deployparrot:" or "bug, eyes" is the
 * whole interaction; the chip normalizes it to the bare names Slack sends.
 */
export function EmojiNameChip({
	names,
	onChange,
	emptyLabel,
	placeholder,
	disabled,
	className,
}: {
	names: string[];
	onChange: (names: string[]) => void;
	emptyLabel: string;
	placeholder: string;
	disabled?: boolean;
	className?: string;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	// The field holds whatever was typed until the popover closes, so a
	// trailing comma or colon does not vanish under the person's cursor.
	const [draft, setDraft] = useState<string | null>(null);

	const label =
		names.length === 0
			? emptyLabel
			: names.length === 1
				? emojiLabel(names[0] ?? "")
				: t({
						id: "dashboard.automations.emojiNameChip.reactionCount",
						message: plural(names.length, {
							one: "# reaction",
							other: "# reactions",
						}),
					});

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
						empty={names.length === 0}
						disabled={disabled}
						className={className}
					/>
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-2">
				<Input
					autoFocus
					value={draft ?? names.map((n) => `:${n}:`).join(" ")}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(event) => {
						setDraft(event.target.value);
						onChange(parseEmojiNames(event.target.value));
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") setOpen(false);
					}}
					className="h-8 text-[13px]"
				/>
			</PopoverContent>
		</Popover>
	);
}
