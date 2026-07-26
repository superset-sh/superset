import type { SimpleGit } from "simple-git";
import {
	type PersistedWorktreeBaseBranch,
	selectEffectiveBaseBranch,
} from "./select-effective-base-branch";

export async function getDefaultBranch(
	git: SimpleGit,
	remoteBranches?: string[],
): Promise<string> {
	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		const match = headRef.match(/refs\/remotes\/origin\/(.+)/);
		if (match) {
			return match[1].trim();
		}
	} catch {}

	const branches =
		remoteBranches ??
		(await git
			.branch(["-r"])
			.then((summary) =>
				summary.all.map((branch) => branch.replace(/^origin\//, "")),
			)
			.catch(() => []));
	if (branches.includes("master") && !branches.includes("main")) {
		return "master";
	}

	return "main";
}

export async function resolveEffectiveBaseBranch({
	git,
	currentBranch,
	persistedWorktree,
}: {
	git: SimpleGit;
	currentBranch: string | null;
	persistedWorktree: PersistedWorktreeBaseBranch | null;
}): Promise<string> {
	const configuredBaseBranch = currentBranch
		? await git
				.raw(["config", `branch.${currentBranch}.base`])
				.then((value) => value.trim() || null)
				.catch(() => null)
		: null;
	const selectedBaseBranch = selectEffectiveBaseBranch({
		configuredBaseBranch,
		persistedWorktree,
		currentBranch,
		defaultBranch: null,
	});

	return selectedBaseBranch ?? getDefaultBranch(git);
}
