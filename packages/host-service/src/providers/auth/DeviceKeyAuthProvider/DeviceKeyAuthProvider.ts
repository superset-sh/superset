import type { ApiAuthProvider } from "../types";

export class DeviceKeyApiAuthProvider implements ApiAuthProvider {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async getHeaders(): Promise<Record<string, string>> {
		return { "X-Device-Key": this.apiKey };
	}

	invalidateCache(): void {
		// Device keys don't expire and aren't cached; nothing to drop.
	}
}
