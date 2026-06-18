import { neonConfig } from "@neondatabase/serverless";

const LOCAL_DATABASE_HOSTS = new Set([
	"db.localtest.me",
	"localhost",
	"127.0.0.1",
]);

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	neonConfig.fetchEndpoint = (_host, port) => `http://localhost:${port}/sql`;
	neonConfig.wsProxy = (_host, port) => `localhost:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
