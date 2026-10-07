type ProviderEnv = {
	GITLAB_CLIENT_ID?: string;
	GITLAB_CLIENT_SECRET?: string;
	GITLAB_ISSUER?: string;
};
export function getGitlabProvider(config: ProviderEnv) {
	return config.GITLAB_CLIENT_ID?.trim() && config.GITLAB_CLIENT_SECRET?.trim()
		? {
				gitlab: {
					clientId: config.GITLAB_CLIENT_ID,
					clientSecret: config.GITLAB_CLIENT_SECRET,
					...(config.GITLAB_ISSUER ? { issuer: config.GITLAB_ISSUER } : {}),
				},
			}
		: {};
}
