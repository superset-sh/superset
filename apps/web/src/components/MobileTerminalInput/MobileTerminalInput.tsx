"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";

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
	focusTargetRef: RefObject<HTMLElement | null>;
	onSend: (sequence: string) => void;
	onFocusTerminal?: () => void;
	enabled?: boolean;
	toolbarVisibility?: "always" | "mobile";
}

export function MobileTerminalInput({
	focusTargetRef,
	onSend,
	onFocusTerminal,
	enabled = true,
	toolbarVisibility = "mobile",
}: MobileTerminalInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const isComposingRef = useRef(false);

	const focusKeyboardInput = useCallback(() => {
		if (!enabled) return;
		textareaRef.current?.focus({ preventScroll: true });
	}, [enabled]);

	useEffect(() => {
		const target = focusTargetRef.current;
		if (!target) return;

		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === "mouse") {
				onFocusTerminal?.();
				return;
			}
			focusKeyboardInput();
		};
		const onTouchStart = () => {
			focusKeyboardInput();
		};

		target.addEventListener("pointerdown", onPointerDown, { passive: true });
		target.addEventListener("touchstart", onTouchStart, { passive: true });
		return () => {
			target.removeEventListener("pointerdown", onPointerDown);
			target.removeEventListener("touchstart", onTouchStart);
		};
	}, [focusKeyboardInput, focusTargetRef, onFocusTerminal]);

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
			focusKeyboardInput();
			onSend(sequence);
		},
		[focusKeyboardInput, onSend],
	);

	const toolbarClassName =
		toolbarVisibility === "mobile"
			? "border-t px-2 py-1 sm:hidden"
			: "border-t p-1";

	return (
		<>
			<textarea
				ref={textareaRef}
				aria-label="Terminal input"
				autoCapitalize="none"
				autoComplete="off"
				autoCorrect="off"
				className="fixed bottom-0 left-0 h-px w-px resize-none opacity-0"
				enterKeyHint="enter"
				inputMode="text"
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
				spellCheck={false}
			/>
			<div
				className={toolbarClassName}
				style={{ borderColor: "#2a2827", backgroundColor: "#1a1716" }}
			>
				<div className="flex flex-wrap gap-1">
					{KEY_BUTTONS.map((button) => (
						<button
							key={button.label}
							type="button"
							onClick={() => sendButtonSequence(button.sequence)}
							className="rounded border px-2 py-1 text-xs"
							style={{ borderColor: "#2a2827", color: "#eae8e6" }}
						>
							{button.label}
						</button>
					))}
				</div>
			</div>
		</>
	);
}
