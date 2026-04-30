import { Database as BunDatabase } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import SuperJSON from "superjson";
import {
	type CreateAppOptions,
	type CreateAppResult,
	createApp,
} from "../../src/app";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import type { AppRouter as HostAppRouter } from "../../src/trpc/router";
import {
	createFakeApiClient,
	FakeApiAuthProvider,
	type FakeApiOverrides,
	FakeHostAuthProvider,
	FakeModelResolver,
	MemoryGitCredentialProvider,
} from "./fakes";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

export interface TestHostOptions {
	organizationId?: string;
	cloudApiUrl?: string;
	allowedOrigins?: string[];
	psk?: string;
	apiOverrides?: FakeApiOverrides;
	githubToken?: string | null;
	/**
	 * Optional Octokit-shaped factory. Tests pass a fake to avoid hitting
	 * api.github.com. The harness types the override as `unknown` and casts
	 * since Octokit's full surface is huge — only the methods exercised by
	 * the test under run need to be implemented.
	 */
	githubFactory?: () => Promise<unknown>;
}

export interface TestHost {
	app: CreateAppResult["app"];
	api: CreateAppResult["api"];
	db: HostDb;
	dispose: () => Promise<void>;
	psk: string;
	dbPath: string;
	apiCalls: Array<{ path: string; input: unknown }>;
	setApi: (
		path: string,
		impl: (input: unknown) => unknown | Promise<unknown>,
	) => void;

	/** tRPC client that talks to the real Hono app via in-process fetch. */
	trpc: ReturnType<typeof createTRPCClient<HostAppRouter>>;
	/** tRPC client without the auth header — for testing 401 paths. */
	unauthenticatedTrpc: ReturnType<typeof createTRPCClient<HostAppRouter>>;
	/** Raw fetch into the app, useful for non-tRPC routes (CORS, websockets). */
	fetch: (input: Request | string, init?: RequestInit) => Promise<Response>;
}

/**
 * Boot the host-service `createApp` against an isolated `bun:sqlite` db with
 * fake providers, then return a tRPC client that round-trips through
 * `app.fetch` (no real network or port). Caller must `await dispose()`.
 *
 * `bun:sqlite` is used instead of `better-sqlite3` because Bun can't dlopen
 * the better-sqlite3 native binding (oven-sh/bun#4290). Both back the same
 * drizzle `BaseSQLiteDatabase` API; production still uses better-sqlite3 in
 * the bundled-Node host process.
 */
export async function createTestHost(
	options: TestHostOptions = {},
): Promise<TestHost> {
	const psk = options.psk ?? "test-psk-secret";
	const dataDir = mkdtempSync(join(tmpdir(), "host-service-test-db-"));
	const dbPath = join(dataDir, "host.db");

	const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	const fakeApi = createFakeApiClient(options.apiOverrides);

	const createOptions: CreateAppOptions = {
		config: {
			organizationId:
				options.organizationId ?? "00000000-0000-0000-0000-000000000001",
			dbPath,
			cloudApiUrl: options.cloudApiUrl ?? "http://localhost:0/cloud",
			migrationsFolder: MIGRATIONS_FOLDER,
			allowedOrigins: options.allowedOrigins ?? ["http://localhost:5173"],
		},
		providers: {
			auth: new FakeApiAuthProvider(),
			hostAuth: new FakeHostAuthProvider(psk),
			credentials: new MemoryGitCredentialProvider(options.githubToken ?? null),
			modelResolver: new FakeModelResolver(),
		},
		db: db as unknown as HostDb,
		api: fakeApi.client,
		github: options.githubFactory
			? (options.githubFactory as CreateAppOptions["github"])
			: undefined,
	};

	const result = createApp(createOptions);

	const fetchApp = async (
		input: Request | string,
		init?: RequestInit,
	): Promise<Response> =>
		result.app.fetch(
			typeof input === "string" ? new Request(input, init) : input,
			init,
		);

	const buildClient = (authorized: boolean) =>
		createTRPCClient<HostAppRouter>({
			links: [
				httpBatchLink({
					url: "http://host-service.test/trpc",
					transformer: SuperJSON,
					fetch: async (url, init) => {
						return fetchApp(new Request(url as string, init as RequestInit));
					},
					headers: () => (authorized ? { authorization: `Bearer ${psk}` } : {}),
				}),
			],
		});

	const trpc = buildClient(true);
	const unauthenticatedTrpc = buildClient(false);

	const dispose = async (): Promise<void> => {
		await result.dispose();
		try {
			sqlite.close();
		} catch {
			// best-effort
		}
		try {
			rmSync(dataDir, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	};

	return {
		app: result.app,
		api: fakeApi.client,
		db: db as unknown as HostDb,
		dispose,
		psk,
		dbPath,
		apiCalls: fakeApi.calls,
		setApi: fakeApi.set,
		trpc,
		unauthenticatedTrpc,
		fetch: fetchApp,
	};
}
