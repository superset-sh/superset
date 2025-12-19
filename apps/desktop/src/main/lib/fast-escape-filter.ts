/**
 * High-performance single-pass escape sequence filter.
 *
 * This replaces the regex-based TerminalEscapeFilter with a state machine
 * that processes data in a single O(n) pass with minimal allocations.
 *
 * Filters terminal query responses that appear as garbage when stored in scrollback:
 * - CPR (Cursor Position Report): ESC[row;colR
 * - DA1 (Primary Device Attributes): ESC[?...c
 * - DA2 (Secondary Device Attributes): ESC[>...c
 * - DA (no prefix): ESC[digits;...c
 * - DA3 (Tertiary Device Attributes): ESC P ! | ... ESC \
 * - DECRPM (DEC Private Mode Report): ESC[?...;...$y
 * - Standard Mode Report: ESC[...;...$y
 * - OSC Color Responses: ESC]1digit;rgb:... BEL or ESC\
 * - XTVERSION: ESC P > | ... ESC \
 * - Unknown CSI: ESC[O
 */

const ESC = 0x1b; // \x1b
const BEL = 0x07; // \x07
const BACKSLASH = 0x5c; // \

// Character codes for fast comparison
const BRACKET = 0x5b; // [
const RBRACKET = 0x5d; // ]
const QUESTION = 0x3f; // ?
const GREATER = 0x3e; // >
const DOLLAR = 0x24; // $
const SEMICOLON = 0x3b; // ;
const EXCLAIM = 0x21; // !
const PIPE = 0x7c; // |
const P = 0x50; // P

// Final bytes for CSI sequences
const CHAR_R = 0x52; // R (CPR)
const CHAR_c = 0x63; // c (Device Attributes)
const CHAR_y = 0x79; // y (Mode Report)
const CHAR_O = 0x4f; // O (Unknown)

// State machine states
enum State {
	Normal,
	Escape, // Saw ESC
	CSI, // Saw ESC [
	CSIQuery, // Saw ESC [ ?
	CSIGreater, // Saw ESC [ >
	CSIDigits, // Saw ESC [ digit
	CSIDollar, // Saw ESC [ ... $
	OSC, // Saw ESC ]
	OSC1, // Saw ESC ] 1
	OSC1x, // Saw ESC ] 1 digit
	OSCBody, // In OSC body, waiting for BEL or ESC \
	DCS, // Saw ESC P
	DCSExclaim, // Saw ESC P !
	DCSGreater, // Saw ESC P >
	DCSBody, // In DCS body, waiting for ESC \
	DCSEscape, // Saw ESC in DCS body
	OSCEscape, // Saw ESC in OSC body
}

function isDigit(c: number): boolean {
	return c >= 0x30 && c <= 0x39; // 0-9
}

/**
 * Fast single-pass escape filter using a state machine.
 * Maintains buffer state for sequences split across chunks.
 */
export class FastEscapeFilter {
	private state: State = State.Normal;
	private pending: number[] = []; // Buffered bytes during escape sequence

	/**
	 * Filter terminal query responses from data in a single O(n) pass.
	 */
	filter(data: string): string {
		const len = data.length;
		if (len === 0) return "";

		// Pre-allocate output array (will be at most input length)
		const output: number[] = [];

		for (let i = 0; i < len; i++) {
			const c = data.charCodeAt(i);
			this.processChar(c, output);
		}

		return String.fromCharCode(...output);
	}

	private processChar(ch: number, output: number[]): void {
		switch (this.state) {
			case State.Normal:
				if (ch === ESC) {
					this.state = State.Escape;
					this.pending = [ESC];
				} else {
					output.push(ch);
				}
				break;

			case State.Escape:
				this.pending.push(ch);
				if (ch === BRACKET) {
					this.state = State.CSI;
				} else if (ch === RBRACKET) {
					this.state = State.OSC;
				} else if (ch === P) {
					this.state = State.DCS;
				} else {
					// Not a sequence we care about, emit pending
					this.emitPending(output);
				}
				break;

			case State.CSI:
				this.pending.push(ch);
				if (ch === QUESTION) {
					this.state = State.CSIQuery;
				} else if (ch === GREATER) {
					this.state = State.CSIGreater;
				} else if (isDigit(ch)) {
					this.state = State.CSIDigits;
				} else if (ch === CHAR_O) {
					// ESC [ O - unknown CSI, filter it
					this.discardPending();
				} else {
					// Not a query response pattern, emit pending
					this.emitPending(output);
				}
				break;

			case State.CSIQuery: // ESC [ ? ...
				this.pending.push(ch);
				if (isDigit(ch) || ch === SEMICOLON) {
					// Continue accumulating
				} else if (ch === CHAR_c) {
					// ESC [ ? ... c - DA1, filter it
					this.discardPending();
				} else if (ch === DOLLAR) {
					this.state = State.CSIDollar;
				} else {
					// Not a query response, emit pending
					this.emitPending(output);
				}
				break;

			case State.CSIGreater: // ESC [ > ...
				this.pending.push(ch);
				if (isDigit(ch) || ch === SEMICOLON) {
					// Continue accumulating
				} else if (ch === CHAR_c) {
					// ESC [ > ... c - DA2, filter it
					this.discardPending();
				} else {
					// Not a query response, emit pending
					this.emitPending(output);
				}
				break;

			case State.CSIDigits: // ESC [ digit ...
				this.pending.push(ch);
				if (isDigit(ch) || ch === SEMICOLON) {
					// Continue accumulating
				} else if (ch === CHAR_R) {
					// ESC [ digits R or ESC [ digits ; digits R - CPR, filter it
					this.discardPending();
				} else if (ch === CHAR_c) {
					// ESC [ digits ; ... c - DA without prefix, filter it
					this.discardPending();
				} else if (ch === DOLLAR) {
					this.state = State.CSIDollar;
				} else {
					// Not a query response (probably a color code), emit pending
					this.emitPending(output);
				}
				break;

			case State.CSIDollar: // ESC [ ... $
				this.pending.push(ch);
				if (ch === CHAR_y) {
					// ESC [ ... $ y - Mode report, filter it
					this.discardPending();
				} else {
					// Not a mode report, emit pending
					this.emitPending(output);
				}
				break;

			case State.OSC: // ESC ]
				this.pending.push(ch);
				if (ch === 0x31) {
					// '1'
					this.state = State.OSC1;
				} else {
					// Not OSC 10-19, emit pending
					this.emitPending(output);
				}
				break;

			case State.OSC1: // ESC ] 1
				this.pending.push(ch);
				if (isDigit(ch)) {
					// OSC 10-19
					this.state = State.OSC1x;
				} else {
					// Not a color query response, emit pending
					this.emitPending(output);
				}
				break;

			case State.OSC1x: // ESC ] 1 digit
				this.pending.push(ch);
				if (ch === SEMICOLON) {
					// Now in the body, looking for rgb:... and terminator
					this.state = State.OSCBody;
				} else {
					// Unexpected, emit pending
					this.emitPending(output);
				}
				break;

			case State.OSCBody: // In OSC body
				this.pending.push(ch);
				if (ch === BEL) {
					// OSC terminated with BEL, filter it
					this.discardPending();
				} else if (ch === ESC) {
					this.state = State.OSCEscape;
				}
				// Otherwise keep accumulating
				break;

			case State.OSCEscape: // Saw ESC in OSC body
				this.pending.push(ch);
				if (ch === BACKSLASH) {
					// OSC terminated with ESC \, filter it
					this.discardPending();
				} else {
					// False alarm, back to OSC body
					this.state = State.OSCBody;
				}
				break;

			case State.DCS: // ESC P
				this.pending.push(ch);
				if (ch === EXCLAIM) {
					this.state = State.DCSExclaim;
				} else if (ch === GREATER) {
					this.state = State.DCSGreater;
				} else {
					// Not a query response DCS, emit pending
					this.emitPending(output);
				}
				break;

			case State.DCSExclaim: // ESC P !
				this.pending.push(ch);
				if (ch === PIPE) {
					// ESC P ! | - DA3, enter body
					this.state = State.DCSBody;
				} else {
					// Not DA3, emit pending
					this.emitPending(output);
				}
				break;

			case State.DCSGreater: // ESC P >
				this.pending.push(ch);
				if (ch === PIPE) {
					// ESC P > | - XTVERSION, enter body
					this.state = State.DCSBody;
				} else {
					// Not XTVERSION, emit pending
					this.emitPending(output);
				}
				break;

			case State.DCSBody: // In DCS body
				this.pending.push(ch);
				if (ch === ESC) {
					this.state = State.DCSEscape;
				}
				// Otherwise keep accumulating
				break;

			case State.DCSEscape: // Saw ESC in DCS body
				this.pending.push(ch);
				if (ch === BACKSLASH) {
					// DCS terminated with ESC \, filter it
					this.discardPending();
				} else {
					// False alarm, back to DCS body
					this.state = State.DCSBody;
				}
				break;
		}
	}

	private emitPending(output: number[]): void {
		for (const c of this.pending) {
			output.push(c);
		}
		this.pending = [];
		this.state = State.Normal;
	}

	private discardPending(): void {
		this.pending = [];
		this.state = State.Normal;
	}

	/**
	 * Flush any remaining buffered data.
	 * Call this when the terminal session ends.
	 */
	flush(): string {
		if (this.pending.length === 0) return "";
		const result = String.fromCharCode(...this.pending);
		this.pending = [];
		this.state = State.Normal;
		return result;
	}

	/**
	 * Reset the filter state.
	 */
	reset(): void {
		this.pending = [];
		this.state = State.Normal;
	}
}
