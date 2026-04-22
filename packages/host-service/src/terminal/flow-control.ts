/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/microsoft/vscode/blob/main/LICENSE.txt
 *--------------------------------------------------------------------------------------------*/

// Vendored from VSCode:
//   - _unacknowledgedCharCount / _isPtyPaused / acknowledgeDataEvent / clearUnacknowledgedChars:
//     src/vs/platform/terminal/node/terminalProcess.ts (inline fields/methods on TerminalProcess)
//
// Upstream puts this logic directly on the TerminalProcess class. It is factored
// here as a tiny state helper so it can be unit-tested without spawning a real pty.
// The observable behaviour (thresholds, clamp-to-zero on over-ack, force-resume
// on clear) mirrors upstream byte-for-byte.
//
// FlowControlConstants live in @superset/shared/terminal-flow-control so the
// client and server cannot drift apart on watermark values.

import { FlowControlConstants } from "@superset/shared/terminal-flow-control";

export { FlowControlConstants } from "@superset/shared/terminal-flow-control";

export interface FlowControlState {
	unacknowledgedCharCount: number;
	isPaused: boolean;
}

export function createFlowControlState(): FlowControlState {
	return { unacknowledgedCharCount: 0, isPaused: false };
}

/**
 * Upstream (VSCode terminalProcess.ts, inside the `ptyProcess.onData` handler):
 *
 *   this._unacknowledgedCharCount += data.length;
 *   if (!this._isPtyPaused && this._unacknowledgedCharCount > FlowControlConstants.HighWatermarkChars) {
 *       this._isPtyPaused = true;
 *       ptyProcess.pause();
 *   }
 *
 * Returns `true` when the caller should invoke `ptyProcess.pause()`.
 */
export function recordOutput(
	state: FlowControlState,
	charCount: number,
): boolean {
	state.unacknowledgedCharCount += charCount;
	if (
		!state.isPaused &&
		state.unacknowledgedCharCount > FlowControlConstants.HighWatermarkChars
	) {
		state.isPaused = true;
		return true;
	}
	return false;
}

/**
 * Upstream (VSCode terminalProcess.ts `acknowledgeDataEvent`):
 *
 *   acknowledgeDataEvent(charCount: number): void {
 *       // Prevent lower than 0 to heal from errors
 *       this._unacknowledgedCharCount = Math.max(this._unacknowledgedCharCount - charCount, 0);
 *       if (this._isPtyPaused && this._unacknowledgedCharCount < FlowControlConstants.LowWatermarkChars) {
 *           this._ptyProcess?.resume();
 *           this._isPtyPaused = false;
 *       }
 *   }
 *
 * Returns `true` when the caller should invoke `ptyProcess.resume()`.
 */
export function recordAck(state: FlowControlState, charCount: number): boolean {
	// Prevent lower than 0 to heal from errors
	state.unacknowledgedCharCount = Math.max(
		state.unacknowledgedCharCount - charCount,
		0,
	);
	if (
		state.isPaused &&
		state.unacknowledgedCharCount < FlowControlConstants.LowWatermarkChars
	) {
		state.isPaused = false;
		return true;
	}
	return false;
}

/**
 * Upstream (VSCode terminalProcess.ts `clearUnacknowledgedChars`):
 *
 *   clearUnacknowledgedChars(): void {
 *       this._unacknowledgedCharCount = 0;
 *       if (this._isPtyPaused) {
 *           this._ptyProcess?.resume();
 *           this._isPtyPaused = false;
 *       }
 *   }
 *
 * Returns `true` when the caller should invoke `ptyProcess.resume()`.
 */
export function clearUnacknowledged(state: FlowControlState): boolean {
	state.unacknowledgedCharCount = 0;
	if (state.isPaused) {
		state.isPaused = false;
		return true;
	}
	return false;
}
