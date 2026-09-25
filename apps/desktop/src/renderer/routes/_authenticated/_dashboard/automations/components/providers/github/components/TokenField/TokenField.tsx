import { Input } from "@superset/ui/input";
import { useRef, useState } from "react";
import { LuX } from "react-icons/lu";

/**
 * What ends a value. Commas and newlines always do, so one paste can carry a
 * whole list; a space only where the value itself cannot contain one — a
 * GitHub login cannot, a label like "good first issue" very much can.
 */
const SEPARATORS = /[,\n]/;
export const SEPARATORS_WITH_SPACE = /[\s,]/;

/**
 * Free-typed values as removable chips.
 *
 * GitHub's people, labels and branches all share a problem: the list we could
 * offer is either unavailable (members needs a permission most installations
 * never granted) or unbounded, so a picker over "what we managed to enumerate"
 * is missing exactly the entry someone came to add. Typing is the way in, and
 * a chip per value keeps a multi-value filter readable once it holds more than
 * one.
 *
 * A comma commits, the way every recipient field works — that and pasting a
 * comma-separated list are the two things people try first, and for values
 * that cannot contain one, so does a space. Enter and leaving the field commit
 * as well, so text that has been typed cannot be silently dropped on the way
 * out.
 */
export function TokenField({
	values,
	onChange,
	placeholder,
	valueLabel = (value) => value,
	header,
	onReset,
	separators = SEPARATORS,
	stripLeadingAt = false,
}: {
	values: string[];
	onChange: (next: string[]) => void;
	placeholder: string;
	/** Labels values that stand for something else — a numeric GitHub user id. */
	valueLabel?: (value: string) => string;
	/** Heading above the field, with `onReset` as its trailing action. */
	header?: string;
	onReset?: () => void;
	/** Defaults to commas and newlines; see SEPARATORS_WITH_SPACE. */
	separators?: RegExp;
	/**
	 * Drops a leading "@" on commit. Only for logins, where the @ is display
	 * sugar people paste along with the name — a branch may legitimately be
	 * called "@next", and stripping it there stores a ref that does not exist.
	 */
	stripLeadingAt?: boolean;
}) {
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	/** Adds every value in `text`, keeping the order typed and ignoring repeats. */
	const commit = (text: string) => {
		const added = text
			.split(separators)
			.map((part) => {
				const trimmed = part.trim();
				// People copy names with the @ still attached; it is not part of a
				// login. Values that can legitimately start with one keep it.
				return stripLeadingAt ? trimmed.replace(/^@/, "") : trimmed;
			})
			.filter(Boolean);
		if (added.length === 0) return false;
		const next = [...values];
		for (const value of added) if (!next.includes(value)) next.push(value);
		if (next.length !== values.length) onChange(next);
		return true;
	};

	return (
		<>
			{header !== undefined && (
				<div className="flex items-center justify-between px-1 pb-1.5">
					<span className="text-muted-foreground text-xs">{header}</span>
					{onReset && (
						<button
							type="button"
							onClick={onReset}
							className="text-muted-foreground text-xs transition-colors hover:text-foreground"
						>
							Reset
						</button>
					)}
				</div>
			)}

			{/* One field: the chips sit inside it so the caret always follows the
			    last value added, the way a recipient field behaves. */}
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the click only
			    forwards focus to the input this wraps; every control inside is a
			    real button, reachable without it. */}
			<div
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					inputRef.current?.focus();
				}}
				className="flex w-full cursor-text flex-wrap items-center gap-1 rounded-[6px] border border-input px-1.5 py-1.5 text-left focus-within:ring-1 focus-within:ring-ring"
			>
				{values.map((value) => (
					<span
						key={value}
						className="flex max-w-full items-center gap-1 rounded-[4px] bg-accent px-1.5 py-0.5 text-[13px]"
					>
						<span className="truncate">{valueLabel(value)}</span>
						<button
							type="button"
							aria-label={`Remove ${valueLabel(value)}`}
							onClick={() => onChange(values.filter((v) => v !== value))}
							className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
						>
							<LuX className="size-3" />
						</button>
					</span>
				))}
				<Input
					ref={inputRef}
					autoFocus
					value={draft}
					placeholder={values.length ? "" : placeholder}
					onChange={(event) => {
						// A typed or auto-completed separator commits what precedes it
						// rather than sitting in the field as punctuation.
						if (separators.test(event.target.value)) {
							commit(event.target.value);
							setDraft("");
							return;
						}
						setDraft(event.target.value);
					}}
					onPaste={(event) => {
						const text = event.clipboardData.getData("text");
						if (!separators.test(text)) return;
						event.preventDefault();
						commit(`${draft}${text}`);
						setDraft("");
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							if (commit(draft)) setDraft("");
							return;
						}
						// Backspace on an empty field deletes the last chip.
						if (event.key === "Backspace" && !draft && values.length) {
							onChange(values.slice(0, -1));
						}
					}}
					// Closing the popover unmounts this, so anything still in the field
					// would be lost without committing it on the way out.
					onBlur={() => {
						if (commit(draft)) setDraft("");
					}}
					className="h-6 min-w-24 flex-1 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
				/>
			</div>
		</>
	);
}
