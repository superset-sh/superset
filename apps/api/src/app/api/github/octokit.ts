import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";

import { env } from "@/env";

export const githubApp = new App({
	appId: env.GITHUB_APP_ID,
	privateKey: env.GITHUB_APP_PRIVATE_KEY,
	webhooks: { secret: env.GITHUB_WEBHOOK_SECRET },
	Octokit: Octokit,
});
