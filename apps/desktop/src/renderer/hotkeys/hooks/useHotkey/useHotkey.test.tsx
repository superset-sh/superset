import { afterEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HotkeyId } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";
import type { ShortcutBinding } from "../../types";

const window = new Window({
	url: "http://localhost/",
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
	Event: window.Event,
	navigator: window.navigator,
	localStorage: window.localStorage,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	value: true,
});

const { useHotkey } = await import("./useHotkey");

type MountedComponent = {
	container: HTMLDivElement;
	root: Root;
	unmount: () => Promise<void>;
};

type TestKeyboardEventInit = {
	bubbles?: boolean;
	cancelable?: boolean;
	code?: string;
	key?: string;
};

const voiceId = "VOICE_INPUT_TOGGLE" as HotkeyId;
const fnBinding: ShortcutBinding = {
	version: 2,
	mode: "named",
	chord: "fn",
};

function HotkeyProbe({
	enabled = true,
	onActivate,
}: {
	enabled?: boolean;
	onActivate: (event: KeyboardEvent) => void;
}) {
	useHotkey(voiceId, onActivate, { enabled });
	return <div />;
}

async function mountHotkeyProbe(
	onActivate: (event: KeyboardEvent) => void,
	options: { enabled?: boolean } = {},
): Promise<MountedComponent> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<HotkeyProbe onActivate={onActivate} {...options} />);
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

function dispatchKeydown(init: TestKeyboardEventInit) {
	const event = new window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	});
	window.dispatchEvent(event);
	return event;
}

afterEach(() => {
	document.body.replaceChildren();
	useHotkeyOverridesStore.setState({ overrides: {} });
	localStorage.clear();
});

describe("useHotkey Fn/Globe activation", () => {
	it("fires a named fn binding when macOS reports Globe through event.key", async () => {
		useHotkeyOverridesStore.setState({
			overrides: { [voiceId]: fnBinding },
		});
		const onActivate = mock(() => undefined);
		const page = await mountHotkeyProbe(onActivate);

		try {
			await act(async () => {
				dispatchKeydown({ code: "", key: "Globe" });
			});

			expect(onActivate).toHaveBeenCalledTimes(1);
		} finally {
			await page.unmount();
		}
	});

	it("fires a named fn binding when only modifier state exposes the key", async () => {
		useHotkeyOverridesStore.setState({
			overrides: { [voiceId]: fnBinding },
		});
		const onActivate = mock(() => undefined);
		const page = await mountHotkeyProbe(onActivate);

		try {
			await act(async () => {
				const event = new window.KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					code: "",
					key: "",
				});
				Object.defineProperty(event, "getModifierState", {
					configurable: true,
					value: (modifier: string) => modifier === "Fn",
				});
				window.dispatchEvent(event);
			});

			expect(onActivate).toHaveBeenCalledTimes(1);
		} finally {
			await page.unmount();
		}
	});

	it("does not treat Fn-modified combinations as a standalone Fn shortcut", async () => {
		useHotkeyOverridesStore.setState({
			overrides: { [voiceId]: fnBinding },
		});
		const onActivate = mock(() => undefined);
		const page = await mountHotkeyProbe(onActivate);

		try {
			await act(async () => {
				const event = new window.KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					code: "KeyV",
					key: "v",
				});
				Object.defineProperty(event, "getModifierState", {
					configurable: true,
					value: (modifier: string) => modifier === "Fn",
				});
				window.dispatchEvent(event);
			});

			expect(onActivate).toHaveBeenCalledTimes(0);
		} finally {
			await page.unmount();
		}
	});

	it("does not fire a standalone Fn listener when the hotkey is disabled", async () => {
		useHotkeyOverridesStore.setState({
			overrides: { [voiceId]: fnBinding },
		});
		const onActivate = mock(() => undefined);
		const page = await mountHotkeyProbe(onActivate, { enabled: false });

		try {
			await act(async () => {
				dispatchKeydown({ code: "", key: "Globe" });
			});

			expect(onActivate).toHaveBeenCalledTimes(0);
		} finally {
			await page.unmount();
		}
	});
});
