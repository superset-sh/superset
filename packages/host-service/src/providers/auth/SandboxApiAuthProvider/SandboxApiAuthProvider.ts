import type { ApiAuthProvider } from "../types";

/**
 * A box holds no credential for the API: the sandbox firewall adds one naming
 * the workspace to every request for it, so there is nothing to send here.
 */
export class SandboxApiAuthProvider implements ApiAuthProvider {
	async getHeaders(): Promise<Record<string, string>> {
		return {};
	}

	invalidateCache(): void {}
}
