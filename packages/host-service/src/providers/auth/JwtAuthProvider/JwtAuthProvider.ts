import type { ApiAuthProvider } from "../types";

export class JwtApiAuthProvider implements ApiAuthProvider {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	async getHeaders(): Promise<Record<string, string>> {
		return { Authorization: `Bearer ${this.token}` };
	}

	updateToken(newToken: string): void {
		this.token = newToken;
	}
}
