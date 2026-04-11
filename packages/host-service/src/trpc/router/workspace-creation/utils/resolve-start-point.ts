import type { SimpleGit } from "simple-git";

export async function resolveStartPoint(
	git: SimpleGit,
	baseBranch: string | undefined,
): Promise<{ ref: string; resolvedFrom: string }> {
	const branch = baseBranch?.trim() || (await resolveDefaultBranchName(git));

	const originRef = `origin/${branch}`;
	if (await refExists(git, originRef)) {
		return { ref: originRef, resolvedFrom: `remote-tracking (${originRef})` };
	}

	if (await refExists(git, branch)) {
		return { ref: branch, resolvedFrom: `local (${branch})` };
	}

	return {
		ref: "HEAD",
		resolvedFrom: `fallback (HEAD), "${branch}" not found`,
	};
}

async function resolveDefaultBranchName(git: SimpleGit): Promise<string> {
	try {
		const ref = await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"--short",
		]);
		return ref.trim().replace(/^origin\//, "");
	} catch {
		return "main";
	}
}

async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		return true;
	} catch {
		return false;
	}
}
