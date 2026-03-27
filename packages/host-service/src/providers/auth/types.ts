export interface ApiAuthProvider {
	getHeaders(): Promise<Record<string, string>>;
}
