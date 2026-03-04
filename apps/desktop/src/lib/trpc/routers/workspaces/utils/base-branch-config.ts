import simpleGit from "simple-git";

interface BranchConfigParams {
	repoPath: string;
	branch: string;
}

interface SetBranchBaseConfigParams extends BranchConfigParams {
	baseBranch: string;
	isExplicit: boolean;
}

interface BranchBaseConfig {
	baseBranch: string | null;
	isExplicit: boolean;
}

function parseBooleanConfig(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return (
		normalized === "true" ||
		normalized === "yes" ||
		normalized === "on" ||
		normalized === "1"
	);
}

export async function getBranchBaseConfig({
	repoPath,
	branch,
}: BranchConfigParams): Promise<BranchBaseConfig> {
	const git = simpleGit(repoPath);
	const [baseOutput, explicitOutput] = await Promise.all([
		git.raw(["config", `branch.${branch}.base`]).catch(() => ""),
		git
			.raw(["config", "--bool", `branch.${branch}.base-explicit`])
			.catch(() => ""),
	]);

	return {
		baseBranch: baseOutput.trim() || null,
		isExplicit: parseBooleanConfig(explicitOutput),
	};
}

export async function setBranchBaseConfig({
	repoPath,
	branch,
	baseBranch,
	isExplicit,
}: SetBranchBaseConfigParams): Promise<void> {
	const git = simpleGit(repoPath);

	await git
		.raw(["config", `branch.${branch}.base`, baseBranch])
		.catch(() => {});
	if (isExplicit) {
		await git
			.raw(["config", "--bool", `branch.${branch}.base-explicit`, "true"])
			.catch(() => {});
		return;
	}

	await git
		.raw(["config", "--unset", `branch.${branch}.base-explicit`])
		.catch(() => {});
}

export async function unsetBranchBaseConfig({
	repoPath,
	branch,
}: BranchConfigParams): Promise<void> {
	const git = simpleGit(repoPath);
	await Promise.all([
		git.raw(["config", "--unset", `branch.${branch}.base`]).catch(() => {}),
		git
			.raw(["config", "--unset", `branch.${branch}.base-explicit`])
			.catch(() => {}),
	]);
}
