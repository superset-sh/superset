import { neonConfig } from "@neondatabase/serverless";

const LOCAL_DATABASE_HOST = "db.localtest.me";

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		return new URL(databaseUrl).hostname === LOCAL_DATABASE_HOST;
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	neonConfig.fetchEndpoint = (host, port) => `http://${host}:${port}/sql`;
	neonConfig.wsProxy = (host, port) => `${host}:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
