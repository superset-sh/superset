import type { AuthProvider } from "../types";

export class DeviceKeyAuthProvider implements AuthProvider {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async getHeaders(): Promise<Record<string, string>> {
		return { "X-Device-Key": this.apiKey };
	}
}
