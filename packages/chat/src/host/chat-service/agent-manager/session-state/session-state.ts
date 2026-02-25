export const sessionAbortControllers = new Map<string, AbortController>();
export const sessionRunIds = new Map<string, string>();

export interface SessionContext {
	cwd: string;
	modelId: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
	requestEntries: [string, string][];
}

export const sessionContext = new Map<string, SessionContext>();
