export interface TerminalProps {
	tabId: string;
	workspaceId: string;
}

export type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number; signal?: number }
	| { type: "disconnect"; reason: string }
	| { type: "error"; error: string; code?: string };

export type CreateOrAttachResult = {
	wasRecovered: boolean;
	isNew: boolean;
	scrollback: string;
	viewportY?: number;
	// Cold restore fields (for reboot recovery)
	isColdRestore?: boolean;
	previousCwd?: string;
	snapshot?: {
		snapshotAnsi: string;
		rehydrateSequences: string;
		cwd: string | null;
		modes: Record<string, boolean>;
		cols: number;
		rows: number;
		scrollbackLines: number;
		debug?: {
			xtermBufferType: string;
			hasAltScreenEntry: boolean;
			altBuffer?: {
				lines: number;
				nonEmptyLines: number;
				totalChars: number;
				cursorX: number;
				cursorY: number;
				sampleLines: string[];
			};
			normalBufferLines: number;
		};
	};
};

export interface ColdRestoreState {
	isRestored: boolean;
	cwd: string | null;
	scrollback: string;
}
