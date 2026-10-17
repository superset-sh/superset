import type { ProjectDirMissingCause } from "@superset/host-service";
import { isHostServiceConnectionError } from "renderer/lib/utils/isHostServiceConnectionError";

export type BranchLoadFailure =
	| { kind: "project-dir-missing"; repoPath: string }
	| { kind: "host-unreachable" }
	| { kind: "unknown" };

export function getBranchLoadFailure(error: unknown): BranchLoadFailure {
	const data = (error as { data?: unknown } | null)?.data as
		| { projectDirMissing?: ProjectDirMissingCause | null }
		| null
		| undefined;
	if (data?.projectDirMissing?.kind === "PROJECT_DIR_MISSING") {
		return {
			kind: "project-dir-missing",
			repoPath: data.projectDirMissing.repoPath,
		};
	}
	if (isHostServiceConnectionError(error)) return { kind: "host-unreachable" };
	return { kind: "unknown" };
}
