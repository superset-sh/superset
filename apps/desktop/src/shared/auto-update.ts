export const AUTO_UPDATE_STATUS = {
	IDLE: "idle",
	CHECKING: "checking",
	DOWNLOADING: "downloading",
	READY: "ready",
	/** Transient: the app just relaunched on a new version after an install */
	UPDATED: "updated",
	ERROR: "error",
} as const;

export type AutoUpdateStatus =
	(typeof AUTO_UPDATE_STATUS)[keyof typeof AUTO_UPDATE_STATUS];

export interface AutoUpdateProgress {
	percent: number;
	transferredBytes: number;
	totalBytes: number;
}

export interface AutoUpdateStatusEvent {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
	progress?: AutoUpdateProgress;
}

export const RELEASES_URL = "https://github.com/superset-sh/superset/releases";
