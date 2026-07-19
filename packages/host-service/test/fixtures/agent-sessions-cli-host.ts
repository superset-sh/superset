import { Database as BunDatabase } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../../src/app";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "../../src/terminal/env";
import {
	createFakeApiClient,
	FakeApiAuthProvider,
	FakeHostAuthProvider,
	FakeModelResolver,
	MemoryGitCredentialProvider,
} from "../helpers/fakes";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const organizationId = required("ORGANIZATION_ID");
const dbPath = required("HOST_DB_PATH");
const migrationsFolder = required("HOST_MIGRATIONS_FOLDER");
const secret = required("HOST_SERVICE_SECRET");
const workspacePath = required("SUPERSET_E2E_WORKSPACE_PATH");
const fakeAgentPath = required("SUPERSET_E2E_AGENT_PATH");
const capturePath = required("SUPERSET_E2E_CAPTURE_PATH");
const agentRuntimePath = required("SUPERSET_E2E_AGENT_RUNTIME_PATH");
const port = Number(required("PORT"));

const projectId = "20000000-0000-4000-8000-000000000001";
const workspaceId = "30000000-0000-4000-8000-000000000001";
const agentConfigId = "40000000-0000-4000-8000-000000000001";
const missingAgentConfigId = "40000000-0000-4000-8000-000000000002";

initTerminalBaseEnv(await resolveTerminalBaseEnv());

mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder });

db.insert(schema.projects)
	.values({ id: projectId, repoPath: workspacePath })
	.onConflictDoNothing()
	.run();
db.insert(schema.workspaces)
	.values({
		id: workspaceId,
		projectId,
		worktreePath: workspacePath,
		branch: "e2e-agent-sessions",
		name: "e2e-agent-sessions",
		type: "worktree",
		createdAt: Date.now(),
		updatedAt: Date.now(),
	})
	.onConflictDoNothing()
	.run();
db.insert(schema.hostAgentConfigs)
	.values({
		id: agentConfigId,
		presetId: "e2e",
		label: "E2E fake agent",
		command: agentRuntimePath,
		argsJson: JSON.stringify([fakeAgentPath]),
		promptTransport: "argv",
		promptArgsJson: "[]",
		envJson: JSON.stringify({ SUPERSET_E2E_CAPTURE_PATH: capturePath }),
		displayOrder: 0,
	})
	.onConflictDoUpdate({
		target: schema.hostAgentConfigs.id,
		set: {
			command: agentRuntimePath,
			argsJson: JSON.stringify([fakeAgentPath]),
			envJson: JSON.stringify({ SUPERSET_E2E_CAPTURE_PATH: capturePath }),
		},
	})
	.run();
db.insert(schema.hostAgentConfigs)
	.values({
		id: missingAgentConfigId,
		presetId: "e2e-missing",
		label: "E2E missing agent",
		command: "/definitely/missing/superset-e2e-agent",
		argsJson: "[]",
		promptTransport: "argv",
		promptArgsJson: "[]",
		envJson: "{}",
		displayOrder: 1,
	})
	.onConflictDoNothing()
	.run();

const fakeApi = createFakeApiClient({
	"host.ensure.mutate": () => ({ machineId: "e2e-host" }),
	"v2Workspace.create.mutate": () => ({
		id: workspaceId,
		name: "e2e-agent-sessions",
		branch: "e2e-agent-sessions",
		taskId: null,
		updatedAt: new Date(),
	}),
	"v2Workspace.list.query": () => [],
});

const result = createApp({
	config: {
		organizationId,
		dbPath,
		cloudApiUrl: "http://127.0.0.1:9",
		migrationsFolder,
		allowedOrigins: [],
	},
	providers: {
		auth: new FakeApiAuthProvider(),
		hostAuth: new FakeHostAuthProvider(secret),
		credentials: new MemoryGitCredentialProvider(),
		modelResolver: new FakeModelResolver(),
	},
	db: db as unknown as HostDb,
	api: fakeApi.client,
	execGh: async () => {
		throw new Error("execGh is unavailable in the agent-session E2E fixture");
	},
});

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	fetch: result.app.fetch,
});
// `PORT=0` asks Bun for an ephemeral port. Terminal env construction happens
// after the server starts and must advertise the resolved port to agent hooks.
process.env.HOST_SERVICE_PORT = String(server.port);

console.log(`E2E_HOST_READY ${server.url}`);

let stopping = false;
async function stop(): Promise<void> {
	if (stopping) return;
	stopping = true;
	server.stop(true);
	try {
		await result.dispose();
	} finally {
		sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		sqlite.close();
	}
	process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
