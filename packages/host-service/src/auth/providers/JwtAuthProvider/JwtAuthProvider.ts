import type { AuthProvider } from "../../types";

export class JwtAuthProvider implements AuthProvider {
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
