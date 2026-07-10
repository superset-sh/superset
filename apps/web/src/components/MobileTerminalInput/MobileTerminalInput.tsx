"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const KEY_BUTTONS: Array<{ label: string; sequence: string }> = [
	{ label: "Tab", sequence: "\t" },
	{ label: "Esc", sequence: "\x1b" },
	{ label: "Ctrl-C", sequence: "\x03" },
	{ label: "Ctrl-D", sequence: "\x04" },
	{ label: "↑", sequence: "\x1b[A" },
	{ label: "↓", sequence: "\x1b[B" },
	{ label: "←", sequence: "\x1b[D" },
	{ label: "→", sequence: "\x1b[C" },
];

interface MobileTerminalInputProps {
	onSend: (sequence: string) => void;
	visibility?: "always" | "mobile";
}

export function MobileTerminalInput({
	onSend,
	visibility = "mobile",
}: MobileTerminalInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const isComposingRef = useRef(false);
	const [focused, setFocused] = useState(false);
	const [coarsePointer, setCoarsePointer] = useState(false);

	useEffect(() => {
		const query = window.matchMedia("(pointer: coarse)");
		setCoarsePointer(query.matches);
		const onChange = (event: MediaQueryListEvent) => {
			setCoarsePointer(event.matches);
		};
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	const flushTextareaValue = useCallback(
		(textarea: HTMLTextAreaElement) => {
			const value = textarea.value;
			if (!value) return;
			onSend(value);
			textarea.value = "";
		},
		[onSend],
	);

	const sendButtonSequence = useCallback(
		(sequence: string) => {
			textareaRef.current?.focus({ preventScroll: true });
			onSend(sequence);
		},
		[onSend],
	);

	if (visibility === "mobile" && !coarsePointer) return null;

	return (
		<div
			className="flex flex-col gap-2 border-t px-2 py-2"
			style={{
				borderColor: "#2a2827",
				backgroundColor: "#1a1716",
				paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
			}}
		>
			<textarea
				ref={textareaRef}
				aria-label="Terminal input"
				autoCapitalize="none"
				autoComplete="off"
				autoCorrect="off"
				className="w-full resize-none overflow-hidden rounded border px-3 py-2 text-sm outline-none"
				enterKeyHint="enter"
				inputMode="text"
				placeholder={focused ? undefined : "Type here to send to the terminal"}
				rows={1}
				spellCheck={false}
				style={{
					borderColor: focused ? "#e07850" : "#2a2827",
					backgroundColor: "#151110",
					color: "#eae8e6",
				}}
				onBlur={() => setFocused(false)}
				onFocus={() => setFocused(true)}
				onBeforeInput={(event) => {
					const nativeEvent = event.nativeEvent as InputEvent;
					switch (nativeEvent.inputType) {
						case "deleteContentBackward":
							if (event.currentTarget.value === "") {
								event.preventDefault();
								onSend("\x7f");
							}
							return;
						case "insertLineBreak":
						case "insertParagraph":
							event.preventDefault();
							event.currentTarget.value = "";
							onSend("\r");
							return;
					}
				}}
				onCompositionEnd={(event) => {
					isComposingRef.current = false;
					flushTextareaValue(event.currentTarget);
				}}
				onCompositionStart={() => {
					isComposingRef.current = true;
				}}
				onInput={(event) => {
					if (isComposingRef.current) return;
					flushTextareaValue(event.currentTarget);
				}}
				onKeyDown={(event) => {
					if (event.defaultPrevented || event.metaKey) return;

					switch (event.key) {
						case "Enter":
							event.preventDefault();
							event.currentTarget.value = "";
							onSend("\r");
							return;
						case "Backspace":
							if (event.currentTarget.value === "") {
								event.preventDefault();
								onSend("\x7f");
							}
							return;
						case "Tab":
							event.preventDefault();
							onSend("\t");
							return;
						case "Escape":
							event.preventDefault();
							onSend("\x1b");
							return;
						case "ArrowUp":
							event.preventDefault();
							onSend("\x1b[A");
							return;
						case "ArrowDown":
							event.preventDefault();
							onSend("\x1b[B");
							return;
						case "ArrowLeft":
							event.preventDefault();
							onSend("\x1b[D");
							return;
						case "ArrowRight":
							event.preventDefault();
							onSend("\x1b[C");
							return;
						default:
							if (event.ctrlKey && event.key.length === 1) {
								const code = event.key.toUpperCase().charCodeAt(0) - 64;
								if (code > 0 && code < 32) {
									event.preventDefault();
									onSend(String.fromCharCode(code));
								}
							}
					}
				}}
				onPaste={(event) => {
					const text = event.clipboardData.getData("text");
					if (!text) return;
					event.preventDefault();
					event.currentTarget.value = "";
					onSend(text);
				}}
			/>
			<div className="flex flex-wrap gap-1">
				{KEY_BUTTONS.map((button) => (
					<button
						key={button.label}
						type="button"
						onPointerDown={(event) => event.preventDefault()}
						onClick={() => sendButtonSequence(button.sequence)}
						className="rounded border px-2 py-1 text-xs"
						style={{ borderColor: "#2a2827", color: "#eae8e6" }}
					>
						{button.label}
					</button>
				))}
			</div>
		</div>
	);
}
