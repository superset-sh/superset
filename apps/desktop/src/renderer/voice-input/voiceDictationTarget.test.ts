import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import { VOICE_DICTATION_INSERT_EVENT } from "./events";
import { rememberVoiceInputTargetElement } from "./focusTracking";
import { registerTerminalVoiceTarget } from "./terminalVoiceTargets";

const window = new Window();

Object.defineProperty(window, "SyntaxError", {
	configurable: true,
	value: SyntaxError,
});

Object.assign(globalThis, {
	window,
	document: window.document,
	HTMLElement: window.HTMLElement,
	HTMLInputElement: window.HTMLInputElement,
	HTMLTextAreaElement: window.HTMLTextAreaElement,
	Event: window.Event,
	CustomEvent: window.CustomEvent,
});

const writeInput = mock(() => undefined);
const focusTerminal = mock(() => undefined);
let connectionState = "open";

mock.module("renderer/lib/terminal/terminal-runtime-registry", () => ({
	terminalRuntimeRegistry: {
		getConnectionState: mock(() => connectionState),
		getTerminal: mock(() => ({ focus: focusTerminal })),
		writeInput,
	},
}));

const { getFocusedVoiceDictationTarget } = await import(
	"./voiceDictationTarget"
);

describe("getFocusedVoiceDictationTarget", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		connectionState = "open";
		writeInput.mockClear();
		focusTerminal.mockClear();
	});

	it("resolves chat targets and dispatches dictation insert events", async () => {
		const root = document.createElement("div");
		root.setAttribute("data-voice-input-target", "chat");
		const input = document.createElement("textarea");
		root.append(input);
		document.body.append(root);
		input.focus();

		let insertedText = "";
		root.addEventListener(VOICE_DICTATION_INSERT_EVENT, (event) => {
			const detail = (event as CustomEvent<{ text: string; handled: boolean }>)
				.detail;
			insertedText = detail.text;
			detail.handled = true;
		});

		const target = getFocusedVoiceDictationTarget();

		expect(target?.kind).toBe("chat");
		expect(await Promise.resolve(target?.insertTranscript("hello chat"))).toBe(
			true,
		);
		expect(insertedText).toBe("hello chat");
	});

	it("falls back to the remembered chat target when focus is on the document body", async () => {
		const root = document.createElement("div");
		root.setAttribute("data-voice-input-target", "chat");
		document.body.append(root);
		rememberVoiceInputTargetElement(root);

		let insertedText = "";
		root.addEventListener(VOICE_DICTATION_INSERT_EVENT, (event) => {
			const detail = (event as CustomEvent<{ text: string; handled: boolean }>)
				.detail;
			insertedText = detail.text;
			detail.handled = true;
		});

		const target = getFocusedVoiceDictationTarget();

		expect(target?.kind).toBe("chat");
		expect(await Promise.resolve(target?.insertTranscript("remembered"))).toBe(
			true,
		);
		expect(insertedText).toBe("remembered");
	});

	it("writes terminal transcripts to the focused terminal session", async () => {
		const root = document.createElement("div");
		root.setAttribute("data-voice-input-target", "terminal");
		root.setAttribute("data-voice-terminal-id", "terminal-1");
		root.setAttribute("data-voice-terminal-instance-id", "pane-1");
		const focusable = document.createElement("button");
		root.append(focusable);
		document.body.append(root);
		focusable.focus();

		const target = getFocusedVoiceDictationTarget();

		expect(target?.kind).toBe("terminal");
		expect(
			await Promise.resolve(target?.insertTranscript("hello terminal")),
		).toBe(true);
		expect(focusTerminal).toHaveBeenCalled();
		expect(writeInput).toHaveBeenCalledWith(
			"terminal-1",
			"hello terminal",
			"pane-1",
		);
	});

	it("refuses to write when the focused terminal is not connected", async () => {
		connectionState = "closed";
		const root = document.createElement("div");
		root.setAttribute("data-voice-input-target", "terminal");
		root.setAttribute("data-voice-terminal-id", "terminal-1");
		const focusable = document.createElement("button");
		root.append(focusable);
		document.body.append(root);
		focusable.focus();

		const target = getFocusedVoiceDictationTarget();

		expect(await Promise.resolve(target?.insertTranscript("ignored"))).toBe(
			false,
		);
		expect(writeInput).not.toHaveBeenCalled();
	});

	it("writes terminal transcripts through registered terminal targets", async () => {
		const root = document.createElement("div");
		root.setAttribute("data-voice-input-target", "terminal");
		root.setAttribute("data-voice-terminal-registry-id", "pane-2");
		const focusable = document.createElement("button");
		root.append(focusable);
		document.body.append(root);
		focusable.focus();

		const write = mock(() => true);
		const focus = mock(() => undefined);
		const unregister = registerTerminalVoiceTarget("pane-2", {
			focus,
			write,
		});

		try {
			const target = getFocusedVoiceDictationTarget();

			expect(target?.kind).toBe("terminal");
			expect(
				await Promise.resolve(target?.insertTranscript("registered terminal")),
			).toBe(true);
			expect(focus).toHaveBeenCalled();
			expect(write).toHaveBeenCalledWith("registered terminal");
		} finally {
			unregister();
		}
	});
});
