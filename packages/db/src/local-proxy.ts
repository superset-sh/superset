import { neonConfig } from "@neondatabase/serverless";

// db.localtest.me relies on public wildcard DNS, which DNS-rebind-protecting
// routers block; db.localhost is guaranteed loopback (RFC 6761) without DNS.
const LOCAL_DATABASE_HOSTS = new Set(["db.localtest.me", "db.localhost"]);

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	neonConfig.fetchEndpoint = (host, port) => `http://${host}:${port}/sql`;
	neonConfig.wsProxy = (host, port) => `${host}:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
