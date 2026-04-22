/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/microsoft/vscode/blob/main/LICENSE.txt
 *--------------------------------------------------------------------------------------------*/

// Vendored from VSCode:
//   - AckDataBufferer: src/vs/workbench/contrib/terminal/browser/terminalProcessManager.ts
//
// FlowControlConstants live in @superset/shared/terminal-flow-control so the
// client and server cannot drift apart on watermark values.

import { FlowControlConstants } from "@superset/shared/terminal-flow-control";

export { FlowControlConstants } from "@superset/shared/terminal-flow-control";

/**
 * Upstream (VSCode terminalProcessManager.ts):
 *
 *   class AckDataBufferer {
 *       private _unsentCharCount: number = 0;
 *
 *       constructor(
 *           private readonly _callback: (charCount: number) => void
 *       ) {
 *       }
 *
 *       ack(charCount: number) {
 *           this._unsentCharCount += charCount;
 *           while (this._unsentCharCount > FlowControlConstants.CharCountAckSize) {
 *               this._unsentCharCount -= FlowControlConstants.CharCountAckSize;
 *               this._callback(FlowControlConstants.CharCountAckSize);
 *           }
 *       }
 *   }
 */
export class AckDataBufferer {
	private _unsentCharCount = 0;

	constructor(private readonly _callback: (charCount: number) => void) {}

	ack(charCount: number) {
		this._unsentCharCount += charCount;
		while (this._unsentCharCount > FlowControlConstants.CharCountAckSize) {
			this._unsentCharCount -= FlowControlConstants.CharCountAckSize;
			this._callback(FlowControlConstants.CharCountAckSize);
		}
	}
}
