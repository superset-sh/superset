import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import React, { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HotkeyId, ShortcutBinding } from "renderer/hotkeys";

type StorageLike = {
	clear: () => void;
	getItem: (key: string) => string | null;
	removeItem: (key: string) => void;
	setItem: (key: string, value: string) => void;
};

function createMemoryStorage(): StorageLike {
	const values = new Map<string, string>();
	return {
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
}

const storage = createMemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: storage,
});
Object.defineProperty(globalThis, "electronTRPC", {
	configurable: true,
	value: {
		onMessage: mock(() => {}),
		sendMessage: mock(() => {}),
	},
});

mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

const passthrough =
	(tag: keyof React.JSX.IntrinsicElements) =>
	({ children, ...props }: { children?: ReactNode }) =>
		React.createElement(tag, props, children);

mock.module("@superset/ui/alert-dialog", () => ({
	AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? <div data-testid="mock-alert-dialog">{children}</div> : null,
	AlertDialogContent: passthrough("section"),
	AlertDialogDescription: ({
		children,
		asChild: _asChild,
		...props
	}: ComponentPropsWithoutRef<"div"> & { asChild?: boolean }) => (
		<div {...props}>{children}</div>
	),
	AlertDialogFooter: passthrough("footer"),
	AlertDialogHeader: passthrough("header"),
	AlertDialogTitle: passthrough("h2"),
}));
mock.module("@superset/ui/button", () => ({
	Button: ({
		children,
		...props
	}: ComponentPropsWithoutRef<"button"> & {
		variant?: string;
		size?: string;
	}) => <button {...props}>{children}</button>,
}));
mock.module("@superset/ui/input", () => ({
	Input: (props: ComponentPropsWithoutRef<"input">) => <input {...props} />,
}));
mock.module("@superset/ui/kbd", () => ({
	Kbd: ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>,
	KbdGroup: ({ children }: { children: ReactNode }) => (
		<span data-testid="mock-kbd-group">{children}</span>
	),
}));
mock.module("@superset/ui/label", () => ({
	Label: (props: ComponentPropsWithoutRef<"label">) =>
		React.createElement("label", props),
}));
mock.module("@superset/ui/sonner", () => ({
	toast: {
		error: mock(() => {}),
		warning: mock(() => {}),
	},
}));
mock.module("@superset/ui/switch", () => ({
	Switch: ({
		onCheckedChange: _onCheckedChange,
		...props
	}: ComponentPropsWithoutRef<"button"> & {
		onCheckedChange?: (checked: boolean) => void;
	}) => <button {...props} />,
}));
mock.module("@superset/ui/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

const pageModule = await import("./page");
const hotkeysModule = await import("renderer/hotkeys");
const recordHotkeysModule = await import(
	"renderer/hotkeys/hooks/useRecordHotkeys/useRecordHotkeys"
);

const {
	HOTKEYS,
	formatHotkeyDisplay,
	getBinding,
	serializeBinding,
	useHotkeyOverridesStore,
} = hotkeysModule;
const { captureHotkeyFromEvent, resolveCapturedBinding } = recordHotkeysModule;
const { saveRecordedHotkeyBinding } = recordHotkeysModule;

const voiceId = "VOICE_INPUT_TOGGLE" as const;

function renderKeyboardShortcutsPage(): string {
	const Page = pageModule.KeyboardShortcutsPage;
	expect(Page).toBeFunction();
	return renderToStaticMarkup(<Page />);
}

function keyboardEvent({
	code,
	key,
	metaKey = false,
	ctrlKey = false,
	altKey = false,
	shiftKey = false,
}: {
	code: string;
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}): KeyboardEvent {
	return {
		code,
		key,
		metaKey,
		ctrlKey,
		altKey,
		shiftKey,
		preventDefault() {},
		stopPropagation() {},
	} as unknown as KeyboardEvent;
}

function recordVoiceShortcutFromKeyboardEvent(binding: {
	code: string;
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}): ShortcutBinding {
	const captured = captureHotkeyFromEvent(keyboardEvent(binding));
	if (!captured) {
		throw new Error("Expected voice shortcut keyboard event to be captured");
	}
	const resolved = resolveCapturedBinding(captured, "logical");
	const shortcutBinding = serializeBinding(resolved);
	saveRecordedHotkeyBinding(
		voiceId,
		shortcutBinding,
		useHotkeyOverridesStore.getState(),
	);
	return shortcutBinding;
}

function expectStructuredBinding(
	binding: ShortcutBinding | null,
): Exclude<ShortcutBinding, string> {
	if (!binding || typeof binding === "string") {
		throw new Error("Expected structured shortcut binding");
	}
	return binding;
}

function extractShortcutRow(html: string, id: string): string {
	const start = html.indexOf(`<div data-testid="keyboard-shortcut-row-${id}"`);
	expect(start).toBeGreaterThanOrEqual(0);
	const nextRow = html.indexOf(
		'<div data-testid="keyboard-shortcut-row-',
		start + 1,
	);
	return html.slice(start, nextRow === -1 ? undefined : nextRow);
}

function reloadHotkeyOverridesFromStorage() {
	const stored = storage.getItem("hotkey-overrides");
	expect(stored).toBeString();
	const parsed = JSON.parse(stored ?? "{}") as {
		state?: { overrides?: Record<string, ShortcutBinding | null> };
	};
	useHotkeyOverridesStore.setState({
		overrides: parsed.state?.overrides ?? {},
	});
}

beforeEach(() => {
	storage.clear();
	useHotkeyOverridesStore.setState({ overrides: {} });
});

afterEach(() => {
	useHotkeyOverridesStore.setState({ overrides: {} });
	storage.clear();
});

describe("voice activation keyboard shortcut settings", () => {
	it("rendersVoiceActivationShortcutRow", () => {
		const html = renderKeyboardShortcutsPage();
		const row = extractShortcutRow(html, voiceId);

		expect(row).toContain("Toggle Voice Input");
		expect(row).toContain("Start or stop voice input for the active workspace");
		expect(row).toContain("<kbd>⌘</kbd>");
		expect(row).toContain("<kbd>⇧</kbd>");
		expect(row).toContain("<kbd>V</kbd>");
	});

	it("recordsAndPersistsVoiceShortcutFromRecorderCapture", () => {
		const capturedBinding = recordVoiceShortcutFromKeyboardEvent({
			code: "KeyU",
			key: "U",
			metaKey: true,
			shiftKey: true,
		});

		expect(capturedBinding).toEqual({
			version: 2,
			mode: "logical",
			chord: "meta+shift+u",
		});
		expect(
			formatHotkeyDisplay(expectStructuredBinding(capturedBinding).chord, "mac")
				.keys,
		).toEqual(["⌘", "⇧", "U"]);

		reloadHotkeyOverridesFromStorage();
		const reloadedBinding = getBinding(voiceId);
		expect(reloadedBinding).toEqual({
			version: 2,
			mode: "logical",
			chord: "meta+shift+u",
		});
		const reloadedChord = expectStructuredBinding(reloadedBinding).chord;
		expect(formatHotkeyDisplay(reloadedChord, "mac").keys).toContain("U");
		expect(formatHotkeyDisplay(reloadedChord, "mac").keys).not.toContain("V");
	});

	it("showsStandardConflictPromptForVoiceShortcutAndRequiresConfirmation", () => {
		const conflictingBinding = HOTKEYS.QUICK_OPEN.key;
		if (!conflictingBinding || typeof conflictingBinding === "string") {
			throw new Error("Expected QUICK_OPEN to have a logical binding object");
		}

		const captured = captureHotkeyFromEvent(
			keyboardEvent({ code: "KeyP", key: "p", metaKey: true }),
		);
		if (!captured) {
			throw new Error("Expected conflicting keyboard event to be captured");
		}
		const attemptedBinding = serializeBinding(
			resolveCapturedBinding(captured, "logical"),
		);
		expect(attemptedBinding).toEqual(conflictingBinding);

		const conflictDisplay = formatHotkeyDisplay(
			expectStructuredBinding(attemptedBinding).chord,
			"mac",
		);
		const prompt = pageModule.buildHotkeyConflictPrompt({
			conflictDisplayText: conflictDisplay.text,
			conflictId: "QUICK_OPEN",
		});

		expect(prompt.title).toBe("Shortcut already in use");
		expect(prompt.description).toContain("Quick Open File");
		expect(prompt.description).toContain("Would you like to reassign it?");
		expect(getBinding(voiceId)).toEqual(HOTKEYS[voiceId].key);
		expect(getBinding("QUICK_OPEN")).toEqual(conflictingBinding);

		const didReassign = pageModule.confirmHotkeyConflictReassign(
			{
				targetId: voiceId,
				binding: attemptedBinding,
				conflictId: "QUICK_OPEN",
			},
			useHotkeyOverridesStore.getState(),
		);

		expect(didReassign).toBeTrue();
		expect(getBinding(voiceId)).toEqual(conflictingBinding);
		expect(getBinding("QUICK_OPEN")).toBeNull();
	});

	it("resetsVoiceShortcutToDefaultAfterRecorderOverride", () => {
		recordVoiceShortcutFromKeyboardEvent({
			code: "KeyU",
			key: "U",
			metaKey: true,
			shiftKey: true,
		});

		expect(getBinding(voiceId)).toMatchObject({ chord: "meta+shift+u" });

		let recordingId: HotkeyId | null = voiceId;
		pageModule.resetHotkeyRowOverride(voiceId, {
			resetOverride: useHotkeyOverridesStore.getState().resetOverride,
			setRecordingId: (updater) => {
				recordingId = updater(recordingId);
			},
		});

		expect(recordingId).toBeNull();
		expect(getBinding(voiceId)).toEqual(HOTKEYS[voiceId].key);
		const html = renderKeyboardShortcutsPage();
		const row = extractShortcutRow(html, voiceId);
		expect(row).toContain("<kbd>V</kbd>");
		expect(row).not.toContain("<kbd>U</kbd>");
	});
});
