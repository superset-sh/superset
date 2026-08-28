import { parseGithubPullRequestUrl } from "@superset/shared/github-pr-url";
import { z } from "zod";

export const fetchGithubPrSchema = z.object({
	prUrl: z
		.string()
		.url()
		.refine((url) => parseGithubPullRequestUrl(url) !== null, {
			message: "prUrl must be a github.com pull request link",
		}),
});
