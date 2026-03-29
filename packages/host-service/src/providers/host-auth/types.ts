export interface HostAuthProvider {
	validate(request: Request): Promise<boolean> | boolean;
	validateToken(token: string): Promise<boolean> | boolean;
}
