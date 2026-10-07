import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";

export function isSuperwhisperProcedureUnavailable(error: unknown): boolean {
	if (isMissingProcedureError(error)) return true;
	if (!error || typeof error !== "object") return false;
	return (error as { data?: { code?: unknown } }).data?.code === "NOT_FOUND";
}
