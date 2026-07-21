import type { IDisposable, Terminal } from "@xterm/xterm";
import {
	createLeakedInputModeReclaimer,
	SHELL_READY_MARKER_PAYLOAD,
	SHELL_READY_OSC_ID,
} from "shared/leaked-input-mode-reclaim";

/**
 * Renderer adapter that wires xterm's parser to the shared leaked-input-mode
 * reclaimer (#4949).
 *
 * v2 workspace terminals stream PTY output straight to this xterm and never route
 * through the terminal-host daemon's HeadlessEmulator, so the host-side foreground
 * reclaim never runs for them. A TUI (mastracode/pi-tui, Claude Code) that arms
 * the kitty keyboard protocol / mouse / focus reporting and is killed while
 * attached leaves every keystroke CSI-u encoded — Ctrl+C dead, shell unusable
 * until `reset`. #5519's renderer disarm only fires on cold restore / terminal
 * restart, not a live kill.
 *
 * This observes mode arming and the OSC 777 shell-ready marker via xterm parser
 * handlers (chunk-safe, exact) and feeds them to the shared reclaimer, which
 * decides what to disarm. The disarm is written back on a microtask so a TUI that
 * re-arms right after the marker (fg after ^Z, or a new TUI racing the prompt)
 * keeps its modes. The decision logic lives in the shared module so a host-side
 * surface can reuse it later.
 */
export function installInputModeReclaimer(terminal: Terminal): IDisposable {
	const reclaimer = createLeakedInputModeReclaimer();
	const parser = terminal.parser;
	const disposables: IDisposable[] = [];
	let scheduled = false;

	// Kitty keyboard protocol: `CSI > flags u` push/arm, `CSI = flags ; mode u`
	// set (0 disarms), `CSI < n u` pop/disarm. Return false so xterm still applies.
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "u" }, () => {
			reclaimer.noteArm("kitty", true);
			return false;
		}),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "=", final: "u" }, (params) => {
			const raw = params[0];
			const flags = typeof raw === "number" ? raw : (raw?.[0] ?? 0);
			reclaimer.noteArm("kitty", flags !== 0);
			return false;
		}),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "<", final: "u" }, () => {
			reclaimer.noteArm("kitty", false);
			return false;
		}),
	);

	// Mouse tracking (?1000/1002/1003) and focus reporting (?1004).
	const applyDecMode = (
		params: (number | number[])[],
		armed: boolean,
	): void => {
		for (const param of params) {
			const primary = typeof param === "number" ? param : param[0];
			if (primary === 1000 || primary === 1002 || primary === 1003) {
				reclaimer.noteArm("mouse", armed);
			} else if (primary === 1004) {
				reclaimer.noteArm("focus", armed);
			}
		}
	};
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
			applyDecMode(params, true);
			return false;
		}),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
			applyDecMode(params, false);
			return false;
		}),
	);

	disposables.push(
		parser.registerOscHandler(SHELL_READY_OSC_ID, (data) => {
			// Exact match: OSC 777 is also urxvt's notification channel.
			if (data !== SHELL_READY_MARKER_PAYLOAD) return false;
			reclaimer.noteShellReady();
			if (!scheduled) {
				scheduled = true;
				queueMicrotask(() => {
					scheduled = false;
					const disarm = reclaimer.collectDisarm();
					if (disarm) terminal.write(disarm);
				});
			}
			return false;
		}),
	);

	return {
		dispose(): void {
			for (const d of disposables) d.dispose();
		},
	};
}
