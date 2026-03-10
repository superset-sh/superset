import type { CredentialProvider } from "../../types";

export class LocalCredentialProvider implements CredentialProvider {
	private envResolver: () => Promise<Record<string, string>>;

	constructor(
		envResolver: () => Promise<Record<string, string>> = async () =>
			process.env as Record<string, string>,
	) {
		this.envResolver = envResolver;
	}

	async getCredentials(
		_remoteUrl: string | null,
	): Promise<{ env: Record<string, string> }> {
		return { env: await this.envResolver() };
	}
}
