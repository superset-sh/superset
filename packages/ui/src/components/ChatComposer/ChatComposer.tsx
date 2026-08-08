"use client";

import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { isEnterSubmit } from "../../lib/keyboard";
import { cn } from "../../lib/utils";

export type ChatComposerStatus = "ready" | "streaming";

export type ChatComposerSuggestion = {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
};

export type ChatComposerProps = {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	onSubmit?: (value: string) => void;
	onStop?: () => void;
	onAttach?: () => void;
	status?: ChatComposerStatus;
	placeholder?: string;
	focusShortcut?: boolean;
	toolbar?: ReactNode;
	mentions?: ChatComposerSuggestion[];
	commands?: ChatComposerSuggestion[];
	autoFocus?: boolean;
	disabled?: boolean;
	className?: string;
};

const MAX_HEIGHT = 192;
const MAX_SUGGESTIONS = 8;

type SuggestionKind = "mention" | "command";

type ActiveToken = {
	kind: SuggestionKind;
	start: number;
	end: number;
	query: string;
};

function activeTokenAt(value: string, caret: number): ActiveToken | null {
	const before = value.slice(0, caret);
	const match = /(^|\s)([@/])([\w./-]*)$/.exec(before);
	if (!match) return null;
	const trigger = match[2];
	const query = match[3] ?? "";
	const start = caret - query.length - 1;
	if (trigger === "/" && start !== 0) return null;
	return {
		kind: trigger === "@" ? "mention" : "command",
		start,
		end: caret,
		query,
	};
}

function isMacPlatform() {
	return (
		typeof navigator !== "undefined" &&
		navigator.platform.toUpperCase().includes("MAC")
	);
}

export function ChatComposer({
	value: controlledValue,
	defaultValue = "",
	onValueChange,
	onSubmit,
	onStop,
	onAttach,
	status = "ready",
	placeholder = "Ask to make changes, @mention files, run /commands",
	focusShortcut = true,
	toolbar,
	mentions,
	commands,
	autoFocus,
	disabled,
	className,
}: ChatComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const suggestionListRef = useRef<HTMLDivElement>(null);
	const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
	const [focused, setFocused] = useState(false);
	const [token, setToken] = useState<ActiveToken | null>(null);
	const [dismissedStart, setDismissedStart] = useState<number | null>(null);
	const [highlight, setHighlight] = useState(0);
	const [pendingCaret, setPendingCaret] = useState<number | null>(null);
	const value = controlledValue ?? uncontrolledValue;
	const canSend = !disabled && value.trim().length > 0;

	const setValue = (next: string) => {
		if (controlledValue === undefined) setUncontrolledValue(next);
		onValueChange?.(next);
	};

	const syncToken = (textarea: HTMLTextAreaElement) => {
		const caret = textarea.selectionStart ?? textarea.value.length;
		const next =
			textarea.selectionStart === textarea.selectionEnd
				? activeTokenAt(textarea.value, caret)
				: null;
		if (token?.start !== next?.start || token?.kind !== next?.kind) {
			setHighlight(0);
			setDismissedStart(null);
		}
		setToken(next);
	};

	const source = token?.kind === "mention" ? mentions : commands;
	const suggestions =
		token && source
			? source
					.filter((item) =>
						item.label.toLowerCase().includes(token.query.toLowerCase()),
					)
					.slice(0, MAX_SUGGESTIONS)
			: [];
	const suggestionsOpen =
		token != null && suggestions.length > 0 && token.start !== dismissedStart;
	const activeIndex = Math.min(highlight, suggestions.length - 1);

	const acceptSuggestion = (item: ChatComposerSuggestion) => {
		if (!token) return;
		const trigger = token.kind === "mention" ? "@" : "/";
		const inserted = `${trigger}${item.label} `;
		const next =
			value.slice(0, token.start) + inserted + value.slice(token.end);
		setValue(next);
		setToken(null);
		setPendingCaret(token.start + inserted.length);
	};

	useLayoutEffect(() => {
		if (pendingCaret == null) return;
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.focus();
			textarea.setSelectionRange(pendingCaret, pendingCaret);
			textarea.style.height = "auto";
			textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
		}
		setPendingCaret(null);
	}, [pendingCaret]);

	useEffect(() => {
		suggestionListRef.current
			?.querySelector('[data-highlighted="true"]')
			?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
	}, []);

	useEffect(() => {
		if (!focusShortcut) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() === "l" &&
				(event.metaKey || event.ctrlKey) &&
				!event.shiftKey &&
				!event.altKey
			) {
				event.preventDefault();
				textareaRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [focusShortcut]);

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed || disabled || status === "streaming") return;
		onSubmit?.(trimmed);
		if (controlledValue === undefined) setUncontrolledValue("");
		setToken(null);
	};

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		if (suggestionsOpen) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlight((activeIndex + 1) % suggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlight(
					(activeIndex - 1 + suggestions.length) % suggestions.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				const item = suggestions[activeIndex];
				if (item) {
					event.preventDefault();
					acceptSuggestion(item);
					return;
				}
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setDismissedStart(token?.start ?? null);
				return;
			}
		}
		if (isEnterSubmit(event)) {
			event.preventDefault();
			submit();
		}
	};

	const showFocusHint = focusShortcut && !focused;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: click-to-focus convenience; the textarea is the interactive element
		<div
			className={cn(
				"relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
				className,
			)}
			onClick={(event) => {
				if (event.target === event.currentTarget) textareaRef.current?.focus();
			}}
		>
			{suggestionsOpen && (
				<div
					ref={suggestionListRef}
					role="listbox"
					aria-label={token.kind === "mention" ? "Mentions" : "Commands"}
					className="absolute bottom-full left-3 z-50 mb-2 max-h-72 w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl bg-popover/95 p-1 shadow-xl ring-1 ring-border backdrop-blur-sm"
				>
					{suggestions.map((item, index) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the textarea (arrows + enter)
						<div
							key={item.id}
							role="option"
							aria-selected={index === activeIndex}
							data-highlighted={index === activeIndex || undefined}
							className={cn(
								"flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
								index === activeIndex
									? "bg-accent text-accent-foreground"
									: "text-foreground",
							)}
							onMouseEnter={() => setHighlight(index)}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => acceptSuggestion(item)}
						>
							{item.icon && (
								<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
									{item.icon}
								</span>
							)}
							<span className="min-w-0 truncate">
								{token.kind === "command" ? `/${item.label}` : item.label}
							</span>
							{item.description && (
								<span className="ml-auto min-w-0 shrink-[2] truncate text-xs text-muted-foreground">
									{item.description}
								</span>
							)}
						</div>
					))}
				</div>
			)}
			<div className="relative">
				<textarea
					ref={textareaRef}
					value={value}
					rows={1}
					// biome-ignore lint/a11y/noAutofocus: opt-in via prop, standard for composers
					autoFocus={autoFocus}
					disabled={disabled}
					placeholder={placeholder}
					className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
					style={{ maxHeight: MAX_HEIGHT }}
					onChange={(event) => {
						setValue(event.target.value);
						const textarea = event.target;
						textarea.style.height = "auto";
						textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
						syncToken(textarea);
					}}
					onSelect={(event) => syncToken(event.currentTarget)}
					onKeyDown={handleKeyDown}
					onFocus={() => setFocused(true)}
					onBlur={() => {
						setFocused(false);
						setToken(null);
					}}
				/>
				{showFocusHint && (
					<span className="pointer-events-none absolute top-3.5 right-4 text-sm text-muted-foreground/60">
						{isMacPlatform() ? "⌘L" : "Ctrl L"} to focus
					</span>
				)}
			</div>
			<div className="flex min-h-14 items-center gap-1 px-3 pb-2.5">
				<div className="flex min-w-0 flex-1 items-center gap-1">{toolbar}</div>
				{onAttach && (
					<button
						type="button"
						aria-label="Add attachment"
						disabled={disabled}
						onClick={onAttach}
						className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<PlusIcon className="size-4.5" />
					</button>
				)}
				{status === "streaming" ? (
					<button
						type="button"
						aria-label="Stop response"
						onClick={onStop}
						className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
					>
						<SquareIcon className="size-3.5 fill-current" />
					</button>
				) : (
					<button
						type="button"
						aria-label="Send message"
						disabled={!canSend}
						onClick={submit}
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
							canSend
								? "cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
								: "cursor-not-allowed bg-secondary text-muted-foreground",
						)}
					>
						<ArrowUpIcon className="size-4.5" />
					</button>
				)}
			</div>
		</div>
	);
}
