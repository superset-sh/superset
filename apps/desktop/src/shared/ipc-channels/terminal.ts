/**
 * Terminal-related IPC channels
 */

import type { NoRequest, NoResponse } from "./types";

export interface TerminalChannels {
	"terminal-create": {
		request: {
			id?: string;
			cols?: number;
			rows?: number;
			cwd?: string;
		};
		response: string;
	};

	"terminal-execute-command": {
		request: { id: string; command: string };
		response: NoResponse;
	};

	"terminal-get-history": {
		request: string;
		response: string | undefined;
	};

	"terminal-resize": {
		request: { id: string; cols: number; rows: number; seq: number };
		response: NoResponse;
	};

	"terminal-signal": {
		request: { id: string; signal: string };
		response: NoResponse;
	};

	"terminal-detach": {
		request: string;
		response: NoResponse;
	};
}

