import type { StatusResult } from "simple-git";

export type { StatusResult };

export interface BranchExistsResult {
	status: "exists" | "not_found" | "error";
	message?: string;
}

export interface CheckoutSafetyResult {
	safe: boolean;
	error?: string;
	hasUncommittedChanges?: boolean;
	hasUntrackedFiles?: boolean;
}

export interface ExecFileException extends Error {
	code?: number | string;
	killed?: boolean;
	signal?: NodeJS.Signals;
	cmd?: string;
	stdout?: string;
	stderr?: string;
}
