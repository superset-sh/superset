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

/**
 * Input parameters for createOrAttach mutation
 */
export interface CreateOrAttachInput {
	paneId: string;
	tabId: string;
	workspaceId: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	initialCommands?: string[];
	skipColdRestore?: boolean;
	allowKilled?: boolean;
}

/**
 * Callbacks for createOrAttach mutation
 */
export interface CreateOrAttachCallbacks {
	onSuccess?: (data: CreateOrAttachResult) => void;
	onError?: (error: { message?: string }) => void;
}

/**
 * Type for the createOrAttach mutation function
 */
export type CreateOrAttachMutate = (
	input: CreateOrAttachInput,
	callbacks?: CreateOrAttachCallbacks,
) => void;
