export interface Env {
	JWKS_URL: string;
	JWT_ISSUER: string;
	JWT_AUDIENCE: string;
	ELECTRIC_URL: string;
	ELECTRIC_SECRET?: string;
}
