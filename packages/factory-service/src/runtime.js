// @ts-nocheck -- See the package-boundary note below. This module deliberately
// isolates two upstream @mastra/core generations that expose private-field types.
import { dirname, join } from "node:path";
import { Mastra } from "@mastra/core/mastra";
import { LocalSandbox } from "@mastra/core/workspace";
import { MastraFactory } from "@mastra/factory";
import { MastraServer } from "@mastra/hono";
import { LibSQLFactoryStorage } from "@mastra/libsql";
import { Hono } from "hono";

const FACTORY_ROUTE_PREFIX = "/factory";

function sandboxEnvironment() {
	const environment = {};
	for (const key of ["LANG", "LC_ALL", "TERM", "TZ"]) {
		const value = process.env[key];
		if (value) environment[key] = value;
	}
	return environment;
}

/**
 * The Mastra packages intentionally live behind this small runtime boundary.
 * Mastra Factory 0.2 and mastracode currently require different generations
 * of @mastra/core. Bun's isolated linker keeps them safe at runtime, while the
 * plain-JS boundary prevents private-field types from leaking across those
 * independently installed package graphs.
 */
export async function startSupersetFactoryRuntime(options) {
	const hostStateDirectory = dirname(options.hostDbPath);
	const paths = {
		databaseUrl: `file:${join(hostStateDirectory, "factory.db")}`,
		sandboxRoot: join(hostStateDirectory, "factory-sandboxes"),
	};

	const factoryApp = new Hono();
	factoryApp.use("*", async (context, next) => {
		if (!(await options.authorize(context.req.raw))) {
			return context.json({ error: "Unauthorized" }, 401);
		}
		await next();
	});
	const auth = {
		name: "superset-host",
		authenticateToken: async (_token, request) => {
			if (!(await options.authorize(request))) return null;
			return {
				id: `superset-user:${options.organizationId}`,
				organizationId: options.organizationId,
			};
		},
		authorizeUser: () => true,
		mapUserToResourceId: (user) => user.id,
	};

	const storage = new LibSQLFactoryStorage({
		id: `superset-factory-${options.organizationId}`,
		url: paths.databaseUrl,
	});
	const factory = new MastraFactory({
		auth,
		allowedOrigins: options.allowedOrigins,
		sandbox: {
			machine: new LocalSandbox({
				workingDirectory: paths.sandboxRoot,
				env: sandboxEnvironment(),
			}),
		},
		storage,
	});
	const prepared = await factory.prepare();
	const mastra = new Mastra({ ...prepared });
	await factory.finalize();

	const server = new MastraServer({
		app: factoryApp,
		mastra,
		prefix: "/api",
	});
	await server.init();
	options.app.all(`${FACTORY_ROUTE_PREFIX}/*`, (context) => {
		const url = new URL(context.req.url);
		url.pathname = url.pathname.slice(FACTORY_ROUTE_PREFIX.length) || "/";
		return factoryApp.fetch(new Request(url, context.req.raw));
	});

	return {
		shutdown: async () => {
			await factory.shutdown();
		},
	};
}
