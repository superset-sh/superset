import type { LeakedInputModeReclaimerSnapshot } from "@superset/shared/leaked-input-mode-reclaim";
import type { ControlSequenceScannerSnapshot } from "./utils/ControlSequenceScanner/index.ts";

export interface TerminalModeState {
	decModes: number[];
	insert: boolean;
	mouseMode: number;
	mouseEncoding: number;
	alternate: boolean;
	keyboard: {
		flags: number;
		mainFlags: number;
		altFlags: number;
		mainStack: number[];
		altStack: number[];
	};
}

export interface TerminalModesSnapshot extends TerminalModeState {
	version: 1;
	parser: ControlSequenceScannerSnapshot;
	reclaimer?: LeakedInputModeReclaimerSnapshot;
}
