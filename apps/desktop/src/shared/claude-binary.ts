export const CLAUDE_BINARY_STATUS = {
	IDLE: "idle",
	DOWNLOADING: "downloading",
	READY: "ready",
	ERROR: "error",
} as const;

export type ClaudeBinaryStatus =
	(typeof CLAUDE_BINARY_STATUS)[keyof typeof CLAUDE_BINARY_STATUS];
