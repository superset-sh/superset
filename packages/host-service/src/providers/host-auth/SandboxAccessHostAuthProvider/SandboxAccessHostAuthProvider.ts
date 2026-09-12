import { verifySandboxAccessToken } from "@superset/shared/sandbox-access-token";
import type { HostAuthProvider } from "../types";

/**
 * The one gate in front of a cloud workspace.
 *
 * The sandbox's port is a public URL with no edge in front of it, so this is
 * where unauthorized requests are turned away. Tokens are signed by the API
 * for exactly this workspace and expire within minutes; the sandbox holds
 * only the public key, so nothing running inside it can mint one. A token
 * for another workspace fails the audience check even though the same key
 * signed it.
 *
 * The token rides as the `Authorization` bearer on HTTP and as the `token`
 * query param on a WebSocket upgrade, the same two places a local host reads
 * its pre-shared secret from.
 */
export class SandboxAccessHostAuthProvider implements HostAuthProvider {
	constructor(
		private readonly publicKey: string,
		private readonly workspaceId: string,
	) {}

	validate(request: Request): boolean {
		const header = request.headers.get("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
		return token !== null && this.validateToken(token);
	}

	validateToken(token: string): boolean {
		return verifySandboxAccessToken({
			publicKey: this.publicKey,
			token,
			audience: this.workspaceId,
		});
	}
}
