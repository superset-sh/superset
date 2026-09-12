import {
	sandboxAccessPublicKey,
	signSandboxAccessToken,
} from "@superset/shared/sandbox-access-token";
import { env } from "../../env";

/** Short enough that a leaked token is bounded; minted per access. */
const ACCESS_TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * A token host-service inside exactly this workspace's sandbox accepts. The
 * authorization decision — is this person allowed in — happens before this is
 * called; this only turns a yes into something the client can present.
 */
export function mintSandboxAccessToken(cloudWorkspaceId: string): {
	token: string;
	expiresAt: Date;
} {
	return signSandboxAccessToken({
		privateKey: env.SANDBOX_ACCESS_SIGNING_KEY,
		audience: cloudWorkspaceId,
		ttlMs: ACCESS_TOKEN_TTL_MS,
	});
}

/** What a sandbox is given so it can check tokens without being able to mint them. */
export function sandboxAccessVerifier(): string {
	return sandboxAccessPublicKey(env.SANDBOX_ACCESS_SIGNING_KEY);
}
