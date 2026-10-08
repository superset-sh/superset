import { githubRepoSlug } from "@superset/shared/github-stars";

interface GitHubRepoResponse {
	stargazers_count: number;
}

export async function getGitHubStars(): Promise<number | null> {
	try {
		const response = await fetch(
			`https://api.github.com/repos/${githubRepoSlug()}`,
			{
				headers: { Accept: "application/vnd.github.v3+json" },
				next: { revalidate: 3600 },
			},
		);

		if (!response.ok) {
			console.error(
				"[marketing/getGitHubStars] Failed to fetch GitHub stars:",
				response.status,
			);
			return null;
		}

		const data: GitHubRepoResponse = await response.json();
		return data.stargazers_count;
	} catch (error) {
		console.error(
			"[marketing/getGitHubStars] Error fetching GitHub stars:",
			error,
		);
		return null;
	}
}
