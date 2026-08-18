import type { Terminal as XTerm } from "@xterm/xterm";
import { getCellDimensions } from "./cell-dimensions";

// Escape hatch: revert to stock xterm wheel handling without a rebuild.
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_STOCK_WHEEL', '1')
// Checked per wheel event (localStorage reads are sub-microsecond in
// Chromium) because terminal instances are parked and reused across React
// mounts — an install-time check would require a full window reload to
// take effect.
export function isStockWheelForced(): boolean {
	try {
		return localStorage.getItem("SUPERSET_TERMINAL_STOCK_WHEEL") === "1";
	} catch {
		return false;
	}
}

// WheelEvent.DOM_DELTA_* — inlined so pure helpers are testable without a DOM.
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export interface WheelLineState {
	/** Fractional lines carried over between events (signed). */
	partialLines: number;
	/** Buffer/mode fingerprint; a change resets the accumulator. */
	contextKey: string;
}

export function createWheelLineState(): WheelLineState {
	return { partialLines: 0, contextKey: "" };
}

export interface WheelLineInput {
	deltaY: number;
	deltaMode: number;
	altKey: boolean;
	ctrlKey: boolean;
}

export interface WheelLineContext {
	cellHeight: number;
	rows: number;
	scrollSensitivity: number;
	fastScrollSensitivity: number;
	contextKey: string;
}

/**
 * Convert a wheel event into a whole number of terminal lines, carrying the
 * fractional remainder across events.
 *
 * This mirrors xterm's MouseService._consumeWheelEvent with two deliberate
 * differences (the reason this module exists — xterm.js PR #5391 regression):
 * - no 0.3x trackpad damping, so pixels map 1:1 onto cell heights
 * - callers emit one sequence per line instead of capping at one per event
 */
export function consumeWheelLines(
	state: WheelLineState,
	input: WheelLineInput,
	context: WheelLineContext,
): number {
	if (state.contextKey !== context.contextKey) {
		state.partialLines = 0;
		state.contextKey = context.contextKey;
	}

	// Parity with xterm's _applyScrollModifier fast-scroll behavior.
	const sensitivity =
		input.altKey || input.ctrlKey
			? context.fastScrollSensitivity * context.scrollSensitivity
			: context.scrollSensitivity;

	let lines = input.deltaY * sensitivity;
	if (input.deltaMode === DOM_DELTA_LINE) {
		// already in lines
	} else if (input.deltaMode === DOM_DELTA_PAGE) {
		lines *= context.rows;
	} else {
		lines /= context.cellHeight;
	}

	state.partialLines += lines;
	let whole = Math.trunc(state.partialLines);
	state.partialLines -= whole;

	// Guard against pathological single-event floods (e.g. a synthetic event
	// with a huge delta): cap one event at a full page of lines.
	const cap = Math.max(1, context.rows);
	if (Math.abs(whole) > cap) {
		whole = Math.sign(whole) * cap;
		state.partialLines = 0;
	}

	return whole;
}

/**
 * Track whether the application enabled SGR mouse encoding (DECSET 1006).
 *
 * xterm does not expose the active mouse encoding publicly, and synthesizing
 * SGR-format reports while the app expects legacy X10 encoding would corrupt
 * its input, so we observe the DECSET/DECRST traffic ourselves. The handlers
 * return false so xterm's own processing still runs.
 */
export function createSgrMouseModeTracker(xterm: XTerm): {
	isActive: () => boolean;
	dispose: () => void;
} {
	let active = false;

	const hasSgrParam = (params: (number | number[])[]): boolean =>
		params.flat().includes(1006);

	const setHandler = xterm.parser.registerCsiHandler(
		{ prefix: "?", final: "h" },
		(params) => {
			if (hasSgrParam(params)) active = true;
			return false;
		},
	);
	const resetHandler = xterm.parser.registerCsiHandler(
		{ prefix: "?", final: "l" },
		(params) => {
			if (hasSgrParam(params)) active = false;
			return false;
		},
	);

	return {
		isActive: () => active,
		dispose: () => {
			setHandler.dispose();
			resetHandler.dispose();
		},
	};
}

const WHEEL_UP_BUTTON = 64;
const WHEEL_DOWN_BUTTON = 65;
const MODIFIER_ALT = 8;
const MODIFIER_CTRL = 16;

export function buildSgrWheelReport(
	deltaY: number,
	col: number,
	row: number,
	modifiers: { altKey: boolean; ctrlKey: boolean },
): string {
	let button = deltaY < 0 ? WHEEL_UP_BUTTON : WHEEL_DOWN_BUTTON;
	if (modifiers.altKey) button |= MODIFIER_ALT;
	if (modifiers.ctrlKey) button |= MODIFIER_CTRL;
	return `\x1b[<${button};${col};${row}M`;
}

export function buildArrowSequence(
	deltaY: number,
	applicationCursorKeys: boolean,
): string {
	return `\x1b${applicationCursorKeys ? "O" : "["}${deltaY < 0 ? "A" : "B"}`;
}

function getReportCoords(
	xterm: XTerm,
	event: WheelEvent,
	cellWidth: number,
	cellHeight: number,
): { col: number; row: number } {
	// Position matters for TUIs that route wheel by pane (vim splits, tmux).
	// The screen element excludes the terminal's padding; fall back to the
	// root element if it isn't rendered yet.
	const element =
		xterm.element?.querySelector(".xterm-screen") ?? xterm.element;
	if (!element) return { col: 1, row: 1 };

	const rect = element.getBoundingClientRect();
	const col = Math.floor((event.clientX - rect.left) / cellWidth) + 1;
	const row = Math.floor((event.clientY - rect.top) / cellHeight) + 1;
	return {
		col: Math.max(1, Math.min(xterm.cols, col)),
		row: Math.max(1, Math.min(xterm.rows, row)),
	};
}

/**
 * Custom wheel handler restoring full-fidelity scrolling for TUIs that
 * capture the wheel: mouse-tracking apps in any buffer (Claude Code, vim
 * with mouse=a, htop, tmux) and alt-buffer apps without tracking (less).
 *
 * Stock xterm.js damps trackpad wheel deltas to 30% and emits at most one
 * report/arrow per DOM wheel event ("scrolling samples every third tick").
 * This handler converts pixels to lines at full fidelity and emits one
 * sequence per line — the report stream a native terminal (kitty, iTerm,
 * Ghostty) produces.
 *
 * Coupled to terminal identity: TERM_PROGRAM must claim a kitty-class
 * terminal (see TERMINAL_TERM_PROGRAM in @superset/shared/constants).
 * Under a vscode identity Claude Code amplifies each report to compensate
 * for xterm's damped stream, so full-fidelity reports would over-scroll ~3x.
 */
export function createTerminalWheelEventHandler(
	xterm: XTerm,
	isSgrMouseModeActive: () => boolean,
): (event: WheelEvent) => boolean {
	const state = createWheelLineState();

	return (event: WheelEvent): boolean => {
		if (isStockWheelForced()) return true;

		// Shift is xterm's mouse-capture bypass (selection); keep stock behavior.
		if (event.deltaY === 0 || event.shiftKey) return true;

		const bufferType = xterm.buffer.active.type;
		const tracking = xterm.modes.mouseTrackingMode;
		// x10 tracking never reports wheel; in the alt buffer it falls through
		// to arrows below, in the normal buffer to viewport scrollback.
		const wantsMouseReports =
			tracking === "vt200" || tracking === "drag" || tracking === "any";

		if (wantsMouseReports) {
			// Without SGR encoding we cannot safely synthesize reports — legacy
			// X10 byte encoding breaks past column 223. Let stock xterm handle it.
			if (!isSgrMouseModeActive()) return true;
		} else if (bufferType !== "alternate") {
			// Normal buffer without mouse tracking: viewport scrollback.
			return true;
		}

		const cell = getCellDimensions(xterm);
		if (!cell) return true;

		const applicationCursorKeys = xterm.modes.applicationCursorKeysMode;
		const lines = consumeWheelLines(
			state,
			{
				deltaY: event.deltaY,
				deltaMode: event.deltaMode,
				altKey: event.altKey,
				ctrlKey: event.ctrlKey,
			},
			{
				cellHeight: cell.height,
				rows: xterm.rows,
				scrollSensitivity: xterm.options.scrollSensitivity ?? 1,
				fastScrollSensitivity: xterm.options.fastScrollSensitivity ?? 5,
				contextKey: `${bufferType}:${tracking}:${applicationCursorKeys}`,
			},
		);

		if (lines !== 0) {
			let sequence: string;
			if (wantsMouseReports) {
				const { col, row } = getReportCoords(
					xterm,
					event,
					cell.width,
					cell.height,
				);
				sequence = buildSgrWheelReport(event.deltaY, col, row, event);
			} else {
				sequence = buildArrowSequence(event.deltaY, applicationCursorKeys);
			}
			xterm.input(sequence.repeat(Math.abs(lines)), true);
		}

		// Consumed (possibly into the fractional accumulator): stop the event so
		// nothing else scrolls, mirroring stock behavior in mouse-report mode.
		event.preventDefault();
		event.stopPropagation();
		return false;
	};
}

/**
 * Install the full-fidelity wheel handler on a terminal. Returns an
 * uninstaller; xterm.dispose() also cleans everything up implicitly.
 */
export function installTerminalWheelEventHandler(xterm: XTerm): () => void {
	const sgrTracker = createSgrMouseModeTracker(xterm);
	xterm.attachCustomWheelEventHandler(
		createTerminalWheelEventHandler(xterm, sgrTracker.isActive),
	);

	return () => {
		sgrTracker.dispose();
		xterm.attachCustomWheelEventHandler(() => true);
	};
}
