import { gitConfigWrite } from "../../git/utils/config-write";
import type { GitClient } from "./types";

export async function enablePushAutoSetupRemote(
	git: GitClient,
	worktreePath: string,
	logPrefix: string,
): Promise<void> {
	await gitConfigWrite(git, [
		"-C",
		worktreePath,
		"config",
		"--local",
		"push.autoSetupRemote",
		"true",
	]).catch((err) => {
		console.warn(`${logPrefix} failed to set push.autoSetupRemote:`, err);
	});
}
