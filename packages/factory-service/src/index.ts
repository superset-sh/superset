import { dirname, join } from "node:path";

export interface SupersetFactoryOptions {
	app: object;
	organizationId: string;
	hostDbPath: string;
	allowedOrigins: string[];
	authorize: (request: Request) => boolean | Promise<boolean>;
}

export interface SupersetFactoryRuntime {
	shutdown: () => Promise<void>;
}

export interface SupersetFactoryPaths {
	databaseUrl: string;
	sandboxRoot: string;
}

/**
 * Keeps Factory persistence and sandboxes beside the organization-scoped host
 * database without sharing its Drizzle-owned schema.
 */
export function resolveSupersetFactoryPaths(
	hostDbPath: string,
): SupersetFactoryPaths {
	const hostStateDirectory = dirname(hostDbPath);
	return {
		databaseUrl: `file:${join(hostStateDirectory, "factory.db")}`,
		sandboxRoot: join(hostStateDirectory, "factory-sandboxes"),
	};
}

/**
 * Mounts Mastra Factory into Superset's existing per-organization Hono host.
 *
 * Mastra owns the work-item state machine, agents, workflows, storage, and
 * observability routes. Superset owns authentication and the renderer UX; a
 * Factory integration can attach a Superset workspace ID for native handoff.
 */
export async function startSupersetFactory(
	options: SupersetFactoryOptions,
): Promise<SupersetFactoryRuntime> {
	const runtime = await import("./runtime.js");
	return runtime.startSupersetFactoryRuntime(options);
}
