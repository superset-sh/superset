import { homedir } from "node:os";
import { join } from "node:path";
import {
	PROJECT_SUPERSET_DIR_NAME,
	WORKTREES_DIR_NAME,
} from "shared/constants";

export function getDefaultWorktreeBaseDir(homeDirectory = homedir()): string {
	return join(homeDirectory, PROJECT_SUPERSET_DIR_NAME, WORKTREES_DIR_NAME);
}
