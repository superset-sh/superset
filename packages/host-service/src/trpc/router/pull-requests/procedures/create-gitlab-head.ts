import { parseGitRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import { gitGitlabPushHeadTask } from "../../../../workers/tasks/git";
import type { ResolvedRepo } from "../../workspace-creation/shared/project-helpers";

export async function createGitLabHead(
	worktreePath: string,
	repo: ResolvedRepo,
	branch: string,
	gitEnv?: Record<string, string>,
) {
	const { pushUrl } = await getHostWorkerPool().run(
		gitGitlabPushHeadTask,
		{
			worktreePath,
			branch,
			remoteName: repo.remoteName,
			...(gitEnv ? { gitEnv } : {}),
		},
		{ timeoutMs: 15_000 },
	);
	const source = parseGitRemote(pushUrl.trim());
	if (
		!source ||
		source.provider === "github" ||
		(/^(?:https?|git):\/\//i.test(pushUrl.trim())
			? source.host !== repo.host
			: source.host !== new URL(`https://${repo.host}`).hostname)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The push remote must belong to the selected GitLab instance",
		});
	}
	return { owner: source.owner, repo: source.name, branch };
}
