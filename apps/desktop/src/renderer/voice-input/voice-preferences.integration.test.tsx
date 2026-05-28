import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, {
	act,
	type ComponentPropsWithoutRef,
	type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { ShortcutBinding } from "renderer/hotkeys";

type ToggleHandler = (checked: boolean) => void;
type MicrophoneStatus = "granted" | "denied" | "promptable" | "unknown";

const window = new Window({
	url: "http://localhost/#/settings/behavior",
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

let voiceInputEnabled = false;
let voiceInputLoading = false;
let microphoneStatus: MicrophoneStatus | undefined = "granted";
let microphoneStatusLoading = false;
let voiceToggleHandler: ToggleHandler | undefined;

const settingsInvalidations: string[] = [];
const setVoiceInputEnabledMutateMock = mock((input: { enabled: boolean }) => {
	voiceInputEnabled = input.enabled;
});
const requestMicrophoneMutateMock = mock(() => undefined);

const passthrough =
	(tag: keyof React.JSX.IntrinsicElements) =>
	({ children, ...props }: { children?: ReactNode }) =>
		React.createElement(tag, props, children);

mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

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
mock.module("@superset/ui/badge", () => ({
	Badge: ({
		children,
		variant: _variant,
		...props
	}: ComponentPropsWithoutRef<"span"> & { variant?: string }) => (
		<span {...props}>{children}</span>
	),
}));
mock.module("@superset/ui/button", () => ({
	Button: ({
		children,
		size: _size,
		variant: _variant,
		...props
	}: ComponentPropsWithoutRef<"button"> & {
		size?: string;
		variant?: string;
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
mock.module("@superset/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<button type="button">{children}</button>
	),
	SelectValue: () => <span />,
}));
mock.module("@superset/ui/sonner", () => ({
	toast: {
		error: mock(() => {}),
		warning: mock(() => {}),
	},
}));
mock.module("@superset/ui/switch", () => ({
	Switch: ({
		id,
		checked,
		disabled,
		onCheckedChange,
		"aria-describedby": ariaDescribedBy,
	}: ComponentPropsWithoutRef<"button"> & {
		checked?: boolean;
		onCheckedChange?: ToggleHandler;
	}) => {
		if (id === "voice-input") {
			voiceToggleHandler = onCheckedChange;
		}

		return (
			<button
				aria-checked={checked}
				aria-describedby={ariaDescribedBy}
				disabled={disabled}
				id={id}
				role="switch"
				type="button"
			/>
		);
	},
}));
mock.module("@superset/ui/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		useUtils: () => ({
			permissions: {
				getStatus: {
					invalidate: mock(() => undefined),
				},
			},
			settings: {
				getConfirmOnQuit: queryUtils("getConfirmOnQuit", true),
				getFileOpenMode: queryUtils("getFileOpenMode", "split-pane"),
				getOpenLinksInApp: queryUtils("getOpenLinksInApp", false),
				getShowResourceMonitor: queryUtils("getShowResourceMonitor", false),
				getVoiceInputEnabled: {
					cancel: mock(async () => undefined),
					getData: mock(() => voiceInputEnabled),
					invalidate: mock(() => settingsInvalidations.push("voice-input")),
					setData: mock((_input: undefined, enabled: boolean) => {
						voiceInputEnabled = enabled;
					}),
				},
			},
		}),
		permissions: {
			getStatus: {
				useQuery: () => ({
					data: microphoneStatus
						? {
								accessibility: true,
								fullDiskAccess: true,
								microphone: microphoneStatus === "granted",
								microphoneStatus,
							}
						: undefined,
					isLoading: microphoneStatusLoading,
				}),
			},
			requestMicrophone: {
				useMutation: () => ({
					isPending: false,
					mutate: requestMicrophoneMutateMock,
				}),
			},
		},
		settings: {
			getConfirmOnQuit: {
				useQuery: () => ({ data: true, isLoading: false }),
			},
			setConfirmOnQuit: {
				useMutation: () => mutationMock(),
			},
			getFileOpenMode: {
				useQuery: () => ({ data: "split-pane", isLoading: false }),
			},
			setFileOpenMode: {
				useMutation: () => mutationMock(),
			},
			getShowResourceMonitor: {
				useQuery: () => ({ data: false, isLoading: false }),
			},
			setShowResourceMonitor: {
				useMutation: () => mutationMock(),
			},
			getOpenLinksInApp: {
				useQuery: () => ({ data: false, isLoading: false }),
			},
			setOpenLinksInApp: {
				useMutation: () => mutationMock(),
			},
			getVoiceInputEnabled: {
				useQuery: () => ({
					data: voiceInputEnabled,
					isLoading: voiceInputLoading,
				}),
			},
			setVoiceInputEnabled: {
				useMutation: () => ({
					isError: false,
					isPending: false,
					mutate: setVoiceInputEnabledMutateMock,
				}),
			},
		},
	},
}));
mock.module("renderer/lib/trpc-client", () => ({
	electronReactClient: {},
	electronTrpcClient: {
		keyboardLayout: {
			changes: {
				subscribe: mock(() => undefined),
			},
		},
	},
}));

function queryUtils<T>(_name: string, data: T) {
	return {
		cancel: mock(async () => undefined),
		getData: mock(() => data),
		invalidate: mock(() => undefined),
		setData: mock(() => undefined),
	};
}

function mutationMock() {
	return {
		isError: false,
		isPending: false,
		mutate: mock(() => undefined),
	};
}

const { BehaviorSettings } = await import(
	"../routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings"
);
const keyboardPageModule = await import(
	"../routes/_authenticated/settings/keyboard/page"
);
const voiceGuardModule = await import("./useVoiceActivationGuard");
const hotkeysModule = await import("renderer/hotkeys");

const { HOTKEYS, getBinding, useHotkeyOverridesStore } = hotkeysModule;
const { runVoiceActivationHotkeyEvent, runVoiceActivationShortcut } =
	voiceGuardModule;

type MountedPage = {
	container: HTMLDivElement;
	root: Root;
	unmount: () => Promise<void>;
};

function resetState() {
	document.body.replaceChildren();
	window.history.replaceState(null, "", "/#/settings/behavior");
	localStorage.clear();
	voiceInputEnabled = false;
	voiceInputLoading = false;
	microphoneStatus = "granted";
	microphoneStatusLoading = false;
	voiceToggleHandler = undefined;
	settingsInvalidations.length = 0;
	setVoiceInputEnabledMutateMock.mockClear();
	requestMicrophoneMutateMock.mockClear();
	useHotkeyOverridesStore.setState({ overrides: {} });
}

function renderBehaviorSettings() {
	voiceToggleHandler = undefined;
	return renderToStaticMarkup(<BehaviorSettings />);
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

function getShortcutRow(id = "VOICE_INPUT_TOGGLE") {
	return getByTestId(`keyboard-shortcut-row-${id}`);
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
				altKey,
				bubbles: true,
				cancelable: true,
				code,
				ctrlKey,
				key,
				metaKey,
				shiftKey,
			}),
		);
	});
}

async function mountKeyboardShortcutsPage(): Promise<MountedPage> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<keyboardPageModule.KeyboardShortcutsPage />);
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

function expectStructuredBinding(
	binding: ShortcutBinding | null,
): Exclude<ShortcutBinding, string> {
	if (!binding || typeof binding === "string") {
		throw new Error("Expected structured shortcut binding");
	}
	return binding;
}

beforeEach(() => {
	resetState();
});

afterEach(() => {
	resetState();
});

describe("voice input preference and shortcut integration", () => {
	it("persistsVoiceInputPreferenceAcrossSettingsNavigation", () => {
		let behaviorMarkup = renderBehaviorSettings();
		expect(behaviorMarkup).toContain('id="voice-input"');
		expect(behaviorMarkup).toContain('aria-checked="false"');

		expect(voiceToggleHandler).toBeFunction();
		voiceToggleHandler?.(true);
		expect(setVoiceInputEnabledMutateMock).toHaveBeenCalledWith({
			enabled: true,
		});

		window.history.replaceState(null, "", "/#/settings/keyboard");
		window.history.replaceState(null, "", "/#/settings/behavior");
		behaviorMarkup = renderBehaviorSettings();

		expect(behaviorMarkup).toContain("Voice input is enabled");
		expect(behaviorMarkup).toContain('aria-checked="true"');
	});

	it("linksToKeyboardShortcutAndReflectsOverride", async () => {
		let behaviorMarkup = renderBehaviorSettings();
		expect(behaviorMarkup).toContain("Voice Shortcut");
		expect(behaviorMarkup).toContain("⌘");
		expect(behaviorMarkup).toContain("V");
		expect(behaviorMarkup).toContain(
			'href="#/settings/keyboard?shortcut=VOICE_INPUT_TOGGLE"',
		);

		window.history.replaceState(
			null,
			"",
			"/#/settings/keyboard?shortcut=VOICE_INPUT_TOGGLE",
		);
		const page = await mountKeyboardShortcutsPage();
		try {
			expect(getShortcutRow().getAttribute("data-focused-shortcut")).toBe(
				"true",
			);
			await recordVoiceShortcut({
				code: "KeyU",
				key: "U",
				metaKey: true,
				shiftKey: true,
			});
			expect(
				expectStructuredBinding(getBinding("VOICE_INPUT_TOGGLE")).chord,
			).toBe("meta+shift+u");
		} finally {
			await page.unmount();
		}

		window.history.replaceState(null, "", "/#/settings/behavior");
		behaviorMarkup = renderBehaviorSettings();
		expect(behaviorMarkup).toContain("Voice Shortcut");
		expect(behaviorMarkup).toContain("U");
		expect(behaviorMarkup).not.toContain("Shortcut unavailable");
	});

	it("protectsExistingShortcutOnVoiceShortcutConflict", async () => {
		const conflictingBinding = HOTKEYS.QUICK_OPEN.key;
		if (!conflictingBinding || typeof conflictingBinding === "string") {
			throw new Error("Expected QUICK_OPEN to have a structured binding");
		}

		window.history.replaceState(
			null,
			"",
			"/#/settings/keyboard?shortcut=VOICE_INPUT_TOGGLE",
		);
		const page = await mountKeyboardShortcutsPage();
		try {
			await recordVoiceShortcut({
				code: "KeyP",
				key: "p",
				metaKey: true,
			});

			const conflictDialog = getByTestId("mock-alert-dialog");
			expect(conflictDialog.textContent).toContain("Shortcut already in use");
			expect(conflictDialog.textContent).toContain("Quick Open File");
			expect(conflictDialog.textContent).toContain(
				"Would you like to reassign it?",
			);
			expect(getBinding("VOICE_INPUT_TOGGLE")).toEqual(
				HOTKEYS.VOICE_INPUT_TOGGLE.key,
			);
			expect(getBinding("QUICK_OPEN")).toEqual(conflictingBinding);

			await click(getButton("keyboard-shortcuts-conflict-cancel"));
			expect(findByTestId("mock-alert-dialog")).toBeUndefined();
			expect(getBinding("VOICE_INPUT_TOGGLE")).toEqual(
				HOTKEYS.VOICE_INPUT_TOGGLE.key,
			);
			expect(getBinding("QUICK_OPEN")).toEqual(conflictingBinding);
		} finally {
			await page.unmount();
		}
	});

	it("disablesVoiceActivationWithoutBlockingNormalInput", () => {
		voiceInputEnabled = false;
		const chatInput = document.createElement("textarea");
		chatInput.setAttribute("data-voice-input-target", "chat");
		const terminalInput = document.createElement("textarea");
		terminalInput.setAttribute("data-voice-input-target", "terminal");
		document.body.append(chatInput, terminalInput);

		let activationCount = 0;
		const voiceHotkeyEvent = new window.KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			code: "KeyV",
			key: "V",
			metaKey: true,
			shiftKey: true,
		});

		const result = runVoiceActivationHotkeyEvent(
			voiceHotkeyEvent as unknown as Pick<KeyboardEvent, "preventDefault">,
			() =>
				runVoiceActivationShortcut({
					voiceInputEnabled,
					getActiveTarget: () => "chat",
					onActivate: () => {
						activationCount += 1;
					},
				}),
		);

		expect(result).toEqual({ status: "disabled" });
		expect(activationCount).toBe(0);
		expect(voiceHotkeyEvent.defaultPrevented).toBe(false);

		chatInput.focus();
		chatInput.value = "typed normally";
		chatInput.dispatchEvent(
			new window.Event("input", { bubbles: true }) as unknown as Event,
		);
		terminalInput.focus();
		terminalInput.value = "pasted normally";
		terminalInput.dispatchEvent(
			new window.Event("input", { bubbles: true }) as unknown as Event,
		);

		expect(chatInput.value).toBe("typed normally");
		expect(terminalInput.value).toBe("pasted normally");
	});

	it("showsMicrophoneReadinessWithoutVendorSetup", () => {
		microphoneStatus = "promptable";
		let behaviorMarkup = renderBehaviorSettings();

		expect(behaviorMarkup).toContain("Microphone readiness");
		expect(behaviorMarkup).toContain("Microphone access is needed");
		expect(behaviorMarkup).toContain("Grant access");
		expect(behaviorMarkup).toContain("Voice Shortcut");

		microphoneStatus = "granted";
		behaviorMarkup = renderBehaviorSettings();
		expect(behaviorMarkup).toContain("Microphone is ready");
		expect(behaviorMarkup).toContain("Voice input can use the microphone");

		const searchableCopy = behaviorMarkup.toLowerCase();
		for (const prohibitedCopy of [
			"api key",
			"account",
			"sdk",
			"provider",
			"wispr flow",
		]) {
			expect(searchableCopy).not.toContain(prohibitedCopy);
		}
	});
});
