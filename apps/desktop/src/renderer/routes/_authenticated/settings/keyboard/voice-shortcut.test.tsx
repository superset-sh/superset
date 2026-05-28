import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, {
	act,
	type ComponentPropsWithoutRef,
	type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShortcutBinding } from "renderer/hotkeys";

const window = new Window({
	url: "http://localhost/settings/keyboard",
});

Object.defineProperty(window.navigator, "platform", {
	configurable: true,
	value: "MacIntel",
});
Object.assign(globalThis, {
	window,
	document: window.document,
	HTMLElement: window.HTMLElement,
	KeyboardEvent: window.KeyboardEvent,
	MouseEvent: window.MouseEvent,
	Event: window.Event,
	navigator: window.navigator,
	localStorage: window.localStorage,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	value: true,
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
		size: _size,
		variant: _variant,
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

const { HOTKEYS, getBinding, useHotkeyOverridesStore } = hotkeysModule;

const voiceId = "VOICE_INPUT_TOGGLE" as const;

function getShortcutRow(id = voiceId) {
	const row = findByTestId(`keyboard-shortcut-row-${id}`);
	expect(row).toBeInstanceOf(HTMLElement);
	return row as HTMLElement;
}

function findByTestId(testId: string) {
	return Array.from(document.getElementsByTagName("*")).find(
		(element) => element.getAttribute("data-testid") === testId,
	);
}

function getByTestId(testId: string) {
	const element = findByTestId(testId);
	expect(element).toBeInstanceOf(HTMLElement);
	return element as HTMLElement;
}

function getButton(testId: string) {
	const element = getByTestId(testId);
	expect(element.tagName).toBe("BUTTON");
	return element as HTMLButtonElement;
}

function getVoiceRecordButton() {
	return getButton("keyboard-shortcut-row-VOICE_INPUT_TOGGLE-record");
}

async function click(element: HTMLElement) {
	await act(async () => {
		element.dispatchEvent(
			new window.MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			}) as unknown as Event,
		);
	});
}

async function pressShortcut({
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
}) {
	await act(async () => {
		window.dispatchEvent(
			new window.KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code,
				key,
				metaKey,
				ctrlKey,
				altKey,
				shiftKey,
			}),
		);
	});
}

type MountedPage = {
	container: HTMLDivElement;
	root: Root;
	unmount: () => Promise<void>;
};

async function mountKeyboardShortcutsPage(): Promise<MountedPage> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<pageModule.KeyboardShortcutsPage />);
	});
	return {
		container,
		root,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
		},
	};
}

function expectStructuredBinding(
	binding: ShortcutBinding | null,
): Exclude<ShortcutBinding, string> {
	if (!binding || typeof binding === "string") {
		throw new Error("Expected structured shortcut binding");
	}
	return binding;
}

function reloadHotkeyOverridesFromStorage() {
	const stored = localStorage.getItem("hotkey-overrides");
	expect(stored).toBeString();
	const parsed = JSON.parse(stored ?? "{}") as {
		state?: { overrides?: Record<string, ShortcutBinding | null> };
	};
	useHotkeyOverridesStore.setState({
		overrides: parsed.state?.overrides ?? {},
	});
}

async function recordVoiceShortcut(binding: {
	code: string;
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}) {
	await click(getVoiceRecordButton());
	await pressShortcut(binding);
}

beforeEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
	useHotkeyOverridesStore.setState({ overrides: {} });
});

afterEach(() => {
	document.body.replaceChildren();
	useHotkeyOverridesStore.setState({ overrides: {} });
	localStorage.clear();
});

describe("voice activation keyboard shortcut settings", () => {
	it("rendersVoiceActivationShortcutRow", async () => {
		const page = await mountKeyboardShortcutsPage();
		try {
			const row = getShortcutRow();

			expect(row.textContent).toContain("Toggle Voice Input");
			expect(row.textContent).toContain(
				"Start or stop voice input for the active workspace",
			);
			expect(row.textContent).toContain("⌘");
			expect(row.textContent).toContain("⇧");
			expect(getVoiceRecordButton().textContent).toContain("V");
		} finally {
			await page.unmount();
		}
	});

	it("recordsVoiceShortcutThroughMountedHotkeyRecorderAndPersistsAfterRemount", async () => {
		let page = await mountKeyboardShortcutsPage();
		try {
			await recordVoiceShortcut({
				code: "KeyU",
				key: "U",
				metaKey: true,
				shiftKey: true,
			});

			const recordedBinding = expectStructuredBinding(getBinding(voiceId));
			expect(recordedBinding).toEqual({
				version: 2,
				mode: "logical",
				chord: "meta+shift+u",
			});
			expect(getShortcutRow().textContent).toContain("U");
			expect(getVoiceRecordButton().textContent).not.toContain("V");
		} finally {
			await page.unmount();
		}

		const persistedOverrides = localStorage.getItem("hotkey-overrides");
		useHotkeyOverridesStore.setState({ overrides: {} });
		if (persistedOverrides) {
			localStorage.setItem("hotkey-overrides", persistedOverrides);
		}
		reloadHotkeyOverridesFromStorage();

		page = await mountKeyboardShortcutsPage();
		try {
			const reloadedBinding = expectStructuredBinding(getBinding(voiceId));
			expect(reloadedBinding.chord).toBe("meta+shift+u");
			expect(getShortcutRow().textContent).toContain("U");
			expect(getVoiceRecordButton().textContent).not.toContain("V");
		} finally {
			await page.unmount();
		}
	});

	it("opensConflictDialogFromMountedPageAndSupportsCancelAndReassign", async () => {
		const page = await mountKeyboardShortcutsPage();
		const conflictingBinding = HOTKEYS.QUICK_OPEN.key;
		if (!conflictingBinding || typeof conflictingBinding === "string") {
			throw new Error("Expected QUICK_OPEN to have a logical binding object");
		}

		try {
			await recordVoiceShortcut({
				code: "KeyP",
				key: "p",
				metaKey: true,
			});

			expect(getByTestId("mock-alert-dialog").textContent).toContain(
				"Shortcut already in use",
			);
			expect(getByTestId("mock-alert-dialog").textContent).toContain(
				"Quick Open File",
			);
			expect(getBinding(voiceId)).toEqual(HOTKEYS[voiceId].key);
			expect(getBinding("QUICK_OPEN")).toEqual(conflictingBinding);

			await click(getButton("keyboard-shortcuts-conflict-cancel"));

			expect(findByTestId("mock-alert-dialog")).toBeUndefined();
			expect(getBinding(voiceId)).toEqual(HOTKEYS[voiceId].key);
			expect(getBinding("QUICK_OPEN")).toEqual(conflictingBinding);

			await recordVoiceShortcut({
				code: "KeyP",
				key: "p",
				metaKey: true,
			});
			await click(getButton("keyboard-shortcuts-conflict-reassign"));

			expect(findByTestId("mock-alert-dialog")).toBeUndefined();
			expect(getBinding(voiceId)).toEqual(conflictingBinding);
			expect(getBinding("QUICK_OPEN")).toBeNull();
			expect(getShortcutRow().textContent).toContain("P");
		} finally {
			await page.unmount();
		}
	});

	it("resetsVoiceShortcutToDefaultThroughMountedRowResetButton", async () => {
		const page = await mountKeyboardShortcutsPage();
		try {
			await recordVoiceShortcut({
				code: "KeyU",
				key: "U",
				metaKey: true,
				shiftKey: true,
			});

			expect(expectStructuredBinding(getBinding(voiceId)).chord).toBe(
				"meta+shift+u",
			);
			expect(getShortcutRow().textContent).toContain("U");

			await click(getButton("keyboard-shortcut-row-VOICE_INPUT_TOGGLE-reset"));

			expect(getBinding(voiceId)).toEqual(HOTKEYS[voiceId].key);
			expect(getVoiceRecordButton().textContent).toContain("V");
			expect(getVoiceRecordButton().textContent).not.toContain("U");
		} finally {
			await page.unmount();
		}
	});
});
