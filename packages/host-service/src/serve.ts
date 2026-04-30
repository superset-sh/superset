import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./env";
import { JwtApiAuthProvider } from "./providers/auth";
import { LocalGitCredentialProvider } from "./providers/git";
import { PskHostAuthProvider } from "./providers/host-auth";
import { LocalModelProvider } from "./providers/model-providers";
import { installProcessSafetyNet } from "./safety";
import { initTerminalBaseEnv, resolveTerminalBaseEnv } from "./terminal/env";
import { connectRelay } from "./tunnel";

async function main(): Promise<void> {
	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);

	const authProvider = new JwtApiAuthProvider(
		env.AUTH_TOKEN,
		env.SUPERSET_API_URL,
	);

	const { app, injectWebSocket, api } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.SUPERSET_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: env.CORS_ORIGINS ?? [],
		},
		providers: {
			auth: authProvider,
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
			modelResolver: new LocalModelProvider(),
		},
	});

	const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
		// Install only after the server is listening so startup throws still
		// reach `main().catch(...)` and exit with a non-zero code.
		installProcessSafetyNet();
		console.log(`[host-service] listening on http://localhost:${info.port}`);

		if (env.RELAY_URL) {
			void connectRelay({
				api,
				relayUrl: env.RELAY_URL,
				localPort: info.port,
				organizationId: env.ORGANIZATION_ID,
				authProvider,
				hostServiceSecret: env.HOST_SERVICE_SECRET,
			});
		}
	});
	injectWebSocket(server);
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
