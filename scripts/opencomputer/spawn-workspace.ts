/**
 * Spawn a Superset workspace + agent session in a fresh OpenComputer sandbox.
 *
 * Runtime is intentionally thin: secret materialization, dockerd boot, and
 * host-service start are all baked into the image's superset-init.sh script.
 * This module is the sandbox-agnostic glue between OpenComputer and the
 * Superset SDK.
 *
 * The Superset SDK is not yet published. The shapes below are the assumed
 * surface; replace `SupersetClient` and the call signatures with the real
 * package once it ships.
 */

import { Sandbox } from "@opencomputer/sdk";
import { REPO_PATH, supersetImage } from "./image";

// ─── Superset SDK placeholder shape (TODO: replace with real @superset/sdk) ───
interface SupersetClientOpts {
  apiKey: string;
  apiUrl?: string;
}
interface ProjectsCreateArgs {
  name: string;
  repoCloneUrl: string;
  existingClonePath?: string;
  hostId?: string;
}
interface WorkspacesCreateArgs {
  project: string;
  hostId: string;
  name: string;
  branch: string;
}
interface SessionsCreateArgs {
  workspaceId: string;
  agent: string;
  model?: string;
  prompt: string;
}
interface Project { id: string }
interface Workspace { id: string; worktreePath: string }
interface AgentSessionRef { id: string }
declare class SupersetClient {
  constructor(opts: SupersetClientOpts);
  projects: { create(args: ProjectsCreateArgs): Promise<Project> };
  workspaces: { create(args: WorkspacesCreateArgs): Promise<Workspace> };
  sessions: { create(args: SessionsCreateArgs): Promise<AgentSessionRef> };
}
// ──────────────────────────────────────────────────────────────────────────────

export interface SpawnArgs {
  doppler: { token: string; project: string; config: string };
  superset: {
    apiKey: string;
    /** Default https://api.superset.sh */
    apiUrl?: string;
  };
  opencomputer?: {
    apiKey?: string;
    apiUrl?: string;
    /**
     * Pre-built snapshot name (`Snapshots.create({ name })`). When provided,
     * the sandbox spawns from the saved checkpoint and the image manifest is
     * not touched. Recommended for production — see scripts/build-snapshot.ts
     * for the build-once flow.
     *
     * If omitted, the image is built on-demand from the manifest. Dev only;
     * note that the OC build SSE stream may time out for slow steps.
     */
    snapshot?: string;
  };
  workspace: { name: string; branch: string };
  agent: { prompt: string; model?: string };
  /** Default 3600s (1h). 0 = persistent. */
  sandboxTimeoutSec?: number;
}

export async function spawnSupersetWorkspace(args: SpawnArgs) {
  // Boot from the pre-baked image. The only secret the orchestrator brings is
  // the Doppler token; everything else comes from Doppler at boot time. The
  // server resolves the image manifest by content hash and reuses cached
  // layers — only the volatile clone+install layer rebuilds on Superset main
  // commits.
  const snapshot = args.opencomputer?.snapshot;
  const sandbox = await Sandbox.create({
    ...(snapshot ? { snapshot } : { image: supersetImage }),
    timeout: args.sandboxTimeoutSec ?? 3600,
    apiKey: args.opencomputer?.apiKey,
    apiUrl: args.opencomputer?.apiUrl,
    envs: {
      DOPPLER_TOKEN: args.doppler.token,
      DOPPLER_PROJECT: args.doppler.project,
      DOPPLER_CONFIG: args.doppler.config,
      SUPERSET_API_KEY: args.superset.apiKey,
    },
    onBuildLog: (log) => process.stderr.write(`[oc-build] ${log}\n`),
  });

  // Materialize secrets, start dockerd, start host-service. All baked.
  const init = await sandbox.exec.run(`/usr/local/bin/superset-init.sh`);
  if (init.exitCode !== 0) {
    throw new Error(`superset-init.sh failed (${init.exitCode}): ${init.stderr}`);
  }

  // SDK calls reach api.superset.sh and route to the host-service in this
  // sandbox via the relay. The host-service self-registered using
  // SUPERSET_API_KEY during init; we look up its hostId from the box.
  const client = new SupersetClient({
    apiKey: args.superset.apiKey,
    apiUrl: args.superset.apiUrl,
  });

  const supersetHostId = await resolveHostId(sandbox);

  // Register the baked clone as a project so the host-service doesn't re-clone
  // into ~/.superset/repos/.
  const project = await client.projects.create({
    name: "Superset",
    repoCloneUrl: "https://github.com/superset-sh/superset",
    existingClonePath: REPO_PATH,
    hostId: supersetHostId,
  });

  const workspace = await client.workspaces.create({
    project: project.id,
    hostId: supersetHostId,
    name: args.workspace.name,
    branch: args.workspace.branch,
  });

  // Per-workspace setup: Neon branch, port allocation, Electric container.
  // Lives inside the worktree and reads tier-2 secrets from the root .env.
  const setup = await sandbox.exec.run(
    `cd ${workspace.worktreePath} && ./.superset/setup.sh`,
  );
  if (setup.exitCode !== 0) {
    throw new Error(`.superset/setup.sh failed: ${setup.stderr}`);
  }

  const session = await client.sessions.create({
    workspaceId: workspace.id,
    agent: "claude-code",
    model: args.agent.model ?? "claude-sonnet-4-6",
    prompt: args.agent.prompt,
  });

  return { sandbox, project, workspace, session };
}

/**
 * Read the Superset hostId out of the sandbox. The host-service picks it at
 * first boot and registers with the relay, so we read it back rather than
 * guess. Production: tag the sandbox via Sandbox.create({ metadata }) and
 * filter `client.hosts.list()` by tag instead.
 */
async function resolveHostId(sandbox: Sandbox): Promise<string> {
  const r = await sandbox.exec.run(
    `superset status --json | jq -r .hostId`,
  );
  if (r.exitCode !== 0 || !r.stdout.trim()) {
    throw new Error(`failed to read hostId from sandbox: ${r.stderr}`);
  }
  return r.stdout.trim();
}
