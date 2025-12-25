// Auto-update status values
export const AUTO_UPDATE_STATUS = {
	IDLE: "idle",
	CHECKING: "checking",
	DOWNLOADING: "downloading",
	READY: "ready",
	ERROR: "error",
} as const;

export type AutoUpdateStatus =
	(typeof AUTO_UPDATE_STATUS)[keyof typeof AUTO_UPDATE_STATUS];
