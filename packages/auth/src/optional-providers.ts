type ProviderEnv = {
	AUTHENTIK_ISSUER?: string;
	AUTHENTIK_CLIENT_ID?: string;
	AUTHENTIK_CLIENT_SECRET?: string;
};
export function getAuthentikConfig(config: ProviderEnv) {
	return config.AUTHENTIK_ISSUER?.trim() &&
		config.AUTHENTIK_CLIENT_ID?.trim() &&
		config.AUTHENTIK_CLIENT_SECRET?.trim()
		? [
				{
					providerId: "authentik",
					clientId: config.AUTHENTIK_CLIENT_ID,
					clientSecret: config.AUTHENTIK_CLIENT_SECRET,
					discoveryUrl: `${config.AUTHENTIK_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`,
					scopes: ["openid", "profile", "email"],
					pkce: true,
				},
			]
		: [];
}
