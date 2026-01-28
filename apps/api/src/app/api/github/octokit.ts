import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";

import { env } from "@/env";

export const githubApp = new App({
	appId: env.GH_APP_ID,
	privateKey: env.GH_APP_PRIVATE_KEY,
	webhooks: { secret: env.GH_WEBHOOK_SECRET },
	Octokit: Octokit,
});
