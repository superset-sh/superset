/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/microsoft/vscode/blob/main/LICENSE.txt
 *--------------------------------------------------------------------------------------------*/

// Vendored from VSCode: src/vs/platform/terminal/common/terminal.ts
//
// Single source of truth for ack-based terminal flow-control thresholds,
// imported by both sides of the WS transport so they cannot drift apart
// (a protocol mismatch here would silently disable pause/resume).
//
// Upstream uses `const enum`; rewritten as a `const` object below because our
// tsconfig has `isolatedModules: true` (const enums are not preserved across
// module boundaries under isolatedModules).

/**
 * Upstream (VSCode terminal.ts):
 *
 *   export const enum FlowControlConstants {
 *       HighWatermarkChars = 100000,
 *       LowWatermarkChars = 5000,
 *       CharCountAckSize = 5000
 *   }
 */
export const FlowControlConstants = {
	/**
	 * The number of _unacknowledged_ chars to have been sent before the pty is paused in order for
	 * the client to catch up.
	 */
	HighWatermarkChars: 100000,
	/**
	 * After flow control pauses the pty for the client the catch up, this is the number of
	 * _unacknowledged_ chars to have been caught up to on the client before resuming the pty again.
	 * This is used to attempt to prevent pauses in the flowing data; ideally while the pty is
	 * paused the number of unacknowledged chars would always be greater than 0 or the client will
	 * appear to stutter. In reality this balance is hard to accomplish though so heavy commands
	 * will likely pause as latency grows, not flooding the connection is the important thing as
	 * it's shared with other core functionality.
	 */
	LowWatermarkChars: 5000,
	/**
	 * The number characters that are accumulated on the client side before sending an ack event.
	 * This must be less than or equal to LowWatermarkChars or the terminal may never unpause.
	 */
	CharCountAckSize: 5000,
} as const;
