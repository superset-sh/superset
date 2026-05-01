import { db } from "@superset/db/client";
import { oauthClients } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "../env";

const CLIENT_ID = "superset-cli";

function normalizeRedirectUri(uri: string): string {
	return uri.replace(/^(https?:\/\/)localhost(:\d+)/, "$1127.0.0.1$2");
}

const LOOPBACK_PORTS = [51789, 51790, 51791, 51792, 51793];

export async function seedCliOAuthClient(): Promise<void> {
	const pasteUri = normalizeRedirectUri(
		`${env.NEXT_PUBLIC_WEB_URL}/cli/auth/code`,
	);
	const loopbackUris = LOOPBACK_PORTS.map(
		(port) => `http://127.0.0.1:${port}/callback`,
	);

	const config = {
		name: "Superset CLI",
		redirectUris: [pasteUri, ...loopbackUris],
		grantTypes: ["authorization_code", "refresh_token"],
		responseTypes: ["code"],
		scopes: ["openid", "profile", "email", "offline_access"],
		tokenEndpointAuthMethod: "none",
		requirePKCE: true,
		public: true,
		disabled: false,
		skipConsent: false,
	};

	const existing = await db.query.oauthClients.findFirst({
		where: eq(oauthClients.clientId, CLIENT_ID),
		columns: { id: true },
	});

	if (existing) {
		await db
			.update(oauthClients)
			.set(config)
			.where(eq(oauthClients.id, existing.id));
		return;
	}

	await db.insert(oauthClients).values({ clientId: CLIENT_ID, ...config });
}
