import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type ExecGh, execGh } from "../../workspace-creation/utils/exec-gh";

const githubRepositorySchema = z.object({
	full_name: z.string(),
	clone_url: z.string().url(),
});

export function parseGitHubRepositories(raw: unknown) {
	const pages = z.array(z.array(githubRepositorySchema)).parse(raw);
	return pages.flat().map((repository) => ({
		fullName: repository.full_name,
		cloneUrl: repository.clone_url,
	}));
}

export async function listGitHubRepositories(runGh: ExecGh = execGh) {
	const repositories: ReturnType<typeof parseGitHubRepositories> = [];
	try {
		for (let page = 1; ; page++) {
			const raw = await runGh([
				"api",
				"--method",
				"GET",
				"user/repos",
				"-f",
				"affiliation=owner,collaborator,organization_member",
				"-f",
				"sort=updated",
				"-f",
				"per_page=100",
				"-f",
				`page=${page}`,
				"--jq",
				"map({full_name, clone_url})",
			]);
			const entries = parseGitHubRepositories([raw]);
			repositories.push(...entries);
			if (entries.length < 100) return repositories;
		}
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		const { code, killed, signal, stderr } = failure as Error & {
			code?: string | number;
			killed?: boolean;
			signal?: string;
			stderr?: string;
		};
		const authenticationRequired =
			code === 4 || /\(HTTP 401\)/.test(stderr ?? failure.message);
		throw new TRPCError({
			code: authenticationRequired
				? "PRECONDITION_FAILED"
				: killed && signal === "SIGTERM" && code == null
					? "TIMEOUT"
					: "BAD_GATEWAY",
			message: authenticationRequired
				? `Could not list GitHub repositories. Run \`gh auth login\` on this host and try again. ${failure.message}`
				: failure.message,
			cause: error,
		});
	}
}
