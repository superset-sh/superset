export interface AuthProvider {
	getHeaders(): Promise<Record<string, string>>;
}
