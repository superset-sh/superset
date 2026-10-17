import {
	createLeakedInputModeReclaimer,
	SHELL_READY_MARKER_PAYLOAD,
	SHELL_READY_OSC_ID,
} from "@superset/shared/leaked-input-mode-reclaim";

import type { TerminalModeState, TerminalModesSnapshot } from "./types.ts";
import { ControlSequenceScanner } from "./utils/ControlSequenceScanner/index.ts";

const DEC_MODES = [1, 6, 7, 25, 45, 66, 1004, 2004, 2026, 2031] as const;
const MOUSE_MODES = [9, 1000, 1002, 1003] as const;
const MAX_KEYBOARD_STACK = 16;

function defaults(): TerminalModeState {
	return {
		decModes: [7, 25],
		insert: false,
		mouseMode: 0,
		mouseEncoding: 0,
		alternate: false,
		keyboard: {
			flags: 0,
			mainFlags: 0,
			altFlags: 0,
			mainStack: [],
			altStack: [],
		},
	};
}

export class TerminalModes {
	private value = defaults();
	private reclaimer = createLeakedInputModeReclaimer();
	private scanner = new ControlSequenceScanner({
		escape: (sequence, final) => this.applyEscape(sequence, final),
		csi: (sequence, final) => this.applyCsi(sequence, final),
		osc: (sequence) => {
			if (sequence === `${SHELL_READY_OSC_ID};${SHELL_READY_MARKER_PAYLOAD}`)
				this.reclaimer.noteShellReady({
					alternateScreen: this.value.alternate,
				});
		},
	});

	snapshot(): TerminalModesSnapshot {
		return {
			version: 1,
			...structuredClone(this.value),
			parser: this.scanner.snapshot(),
			reclaimer: this.reclaimer.snapshot(),
		};
	}

	restore(snapshot: TerminalModesSnapshot): void {
		if (snapshot.version !== 1)
			throw new Error("Unsupported terminal mode snapshot");
		const { decModes, insert, mouseMode, mouseEncoding, alternate, keyboard } =
			snapshot;
		this.value = structuredClone({
			decModes,
			insert,
			mouseMode,
			mouseEncoding,
			alternate,
			keyboard,
		});
		this.scanner.restore(snapshot.parser);
		this.reclaimer = createLeakedInputModeReclaimer(snapshot.reclaimer);
	}

	collectDisarm(): Uint8Array | null {
		const disarm = this.reclaimer.collectDisarm();
		return disarm ? new TextEncoder().encode(disarm) : null;
	}

	isEnabled(mode: number): boolean {
		return this.value.decModes.includes(mode);
	}

	feed(bytes: Uint8Array): void {
		this.scanner.feed(bytes);
	}

	buildPreamble(): Uint8Array {
		const parts: string[] = [];
		for (const mode of DEC_MODES) {
			const enabled = this.isEnabled(mode);
			// DECOM homes the cursor; synchronized output suspends rendering.
			if ((mode === 6 && !enabled) || (mode === 2026 && enabled)) continue;
			parts.push(`\x1b[?${mode}${enabled ? "h" : "l"}`);
		}
		parts.push(`\x1b[4${this.value.insert ? "h" : "l"}`);
		parts.push(
			this.value.mouseMode ? `\x1b[?${this.value.mouseMode}h` : "\x1b[?1003l",
		);
		parts.push(
			this.value.mouseEncoding
				? `\x1b[?${this.value.mouseEncoding}h`
				: "\x1b[?1006l",
		);
		parts.push(`\x1b[=${this.value.keyboard.flags};1u`);
		return new TextEncoder().encode(parts.join(""));
	}

	private applyEscape(sequence: string, final: string): void {
		if (sequence !== "") return;
		if (final === "c") {
			this.value = defaults();
			this.reclaimer = createLeakedInputModeReclaimer();
		}
		if (final === "=" || final === ">") this.setDecMode(66, final === "=");
	}

	private applyCsi(sequence: string, final: string): void {
		if (sequence === "!" && final === "p") {
			const { mouseMode, mouseEncoding, alternate } = this.value;
			this.value = {
				...defaults(),
				mouseMode,
				mouseEncoding,
				alternate,
			};
			this.reclaimer = createLeakedInputModeReclaimer();
			return;
		}
		const match = /^([?<=>]?)([0-9;]*)$/.exec(sequence);
		if (!match) return;
		const prefix = match[1];
		const params = (match[2] ?? "")
			.split(";")
			.slice(0, 32)
			.map((n) => Math.min(Number(n), 0x7fffffff));
		if (final === "h" || final === "l") {
			for (const mode of params) {
				if (prefix === "?") this.setDecMode(mode, final === "h");
				else if (prefix === "" && mode === 4) this.value.insert = final === "h";
			}
		} else if (final === "u") {
			const keyboard = this.value.keyboard;
			const stack = this.value.alternate
				? keyboard.altStack
				: keyboard.mainStack;
			const flags = params[0] ?? 0;
			if (prefix === ">") {
				if (stack.length === MAX_KEYBOARD_STACK) stack.shift();
				stack.push(keyboard.flags);
				keyboard.flags = flags;
				this.reclaimer.noteArm("kitty", true);
			} else if (prefix === "<") {
				for (let i = 0; i < (flags || 1) && stack.length > 0; i++)
					keyboard.flags = stack.pop() ?? 0;
				if (stack.length === 0) keyboard.flags = 0;
				this.reclaimer.noteArm("kitty", keyboard.flags !== 0);
			} else if (prefix === "=") {
				this.reclaimer.noteArm("kitty", flags !== 0);
				switch (params[1] || 1) {
					case 1:
						keyboard.flags = flags;
						break;
					case 2:
						keyboard.flags |= flags;
						break;
					case 3:
						keyboard.flags &= ~flags;
						break;
				}
			}
		}
	}

	private setDecMode(mode: number, enabled: boolean): void {
		if ((MOUSE_MODES as readonly number[]).includes(mode))
			this.reclaimer.noteArm("mouse", enabled);
		if (mode === 1004) this.reclaimer.noteArm("focus", enabled);
		if ((DEC_MODES as readonly number[]).includes(mode)) {
			this.value.decModes = this.value.decModes.filter((m) => m !== mode);
			if (enabled) this.value.decModes.push(mode);
		} else if ((MOUSE_MODES as readonly number[]).includes(mode)) {
			this.value.mouseMode = enabled ? mode : 0;
		} else if (mode === 1006 || mode === 1016) {
			this.value.mouseEncoding = enabled ? mode : 0;
		} else if (mode === 47 || mode === 1047 || mode === 1049) {
			const keyboard = this.value.keyboard;
			if (enabled) {
				keyboard.mainFlags = keyboard.flags;
				keyboard.flags = keyboard.altFlags;
			} else {
				keyboard.altFlags = keyboard.flags;
				keyboard.flags = keyboard.mainFlags;
			}
			this.value.alternate = enabled;
		}
	}
}
