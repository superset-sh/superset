import { z } from "zod";

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
