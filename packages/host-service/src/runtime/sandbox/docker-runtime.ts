import { buildContainerTerminalEnv } from "./container-env.ts";
import {
	destroyWorkspaceSandbox,
	ensureContainer,
} from "./container-manager.ts";
import { buildExecArgs, type ResolvedSandboxSettings } from "./docker-args.ts";
import { getDockerCliEnv } from "./docker-cli.ts";
import { getHostAgentHookUrl } from "./host-runtime.ts";
import {
	CONTAINER_BASH_RCFILE,
	CONTAINER_HOST_DIR,
	getSandboxContainerName,
	getWorkspaceSandboxPaths,
} from "./paths.ts";
import { getOrCreateHookToken } from "./sandbox-tokens.ts";
import type {
	PtyLaunchSpec,
	TerminalLaunchContext,
	WorkspaceRuntime,
} from "./workspace-runtime.ts";

/** host-service base URL as reachable from inside a sandbox container. */
function getContainerHostEndpoint(): string {
	const port = process.env.HOST_SERVICE_PORT || process.env.PORT;
	return port ? `http://host.docker.internal:${port}` : "";
}

export interface DockerRuntimeParams {
	workspaceId: string;
	worktreePath: string;
	repoPath: string;
	branch: string;
	/** Human-readable container-name slug (workspace name/branch). */
	nameSlug: string;
	settings: ResolvedSandboxSettings;
}

/**
 * Runs every workspace PTY inside one persistent per-workspace container.
 * The pty-daemon's child is the docker CLI: `docker exec -it` under a PTY
 * forwards bytes, resize (SIGWINCH → exec-resize API), and the inner
 * process's exit code, so terminal persistence/adoption work unchanged.
 */
export class DockerRuntime implements WorkspaceRuntime {
	readonly kind = "docker" as const;

	constructor(private readonly params: DockerRuntimeParams) {}

	async prepare(): Promise<void> {
		await ensureContainer(this.params);
	}

	async buildPtyLaunch(ctx: TerminalLaunchContext): Promise<PtyLaunchSpec> {
		const env = {
			...buildContainerTerminalEnv({
				ctx,
				hostAgentHookUrl: this.getAgentHookUrl(),
				envPassthrough: this.params.settings.envPassthrough,
				hostEnv: process.env,
			}),
			// notify.sh echoes this back; notifications.hook drops spoofed
			// events carrying a wrong token for this workspace.
			SUPERSET_AGENT_HOOK_TOKEN: getOrCreateHookToken(this.params.workspaceId),
			// The bundled CLI short-circuits manifest/PID host discovery
			// (meaningless across the container boundary) with these.
			SUPERSET_HOST_ENDPOINT: getContainerHostEndpoint(),
			SUPERSET_HOST_TOKEN_FILE: `${CONTAINER_HOST_DIR}/token`,
			// The container runs as root; Claude Code refuses
			// --dangerously-skip-permissions as root unless this marks the
			// environment as an intentional sandbox (its devcontainer escape
			// hatch). Accurate here — that isolation is the whole point.
			IS_SANDBOX: "1",
		};
		return {
			shell: "docker",
			argv: buildExecArgs({
				containerName: getSandboxContainerName(
					this.params.workspaceId,
					this.params.nameSlug,
				),
				cwd: ctx.cwd,
				env,
				command: ["/bin/bash", "--rcfile", CONTAINER_BASH_RCFILE],
			}),
			// pty-daemon stat()s the spawn cwd on the host; the container cwd
			// rides in `docker exec -w` instead.
			cwd: ctx.workspacePath,
			env: getDockerCliEnv(),
			// The generated container rcfile always installs the OSC 133;A
			// prompt marker (sandbox-home.ts owns the contract).
			expectsReadyMarker: true,
			// Staged launch scripts must be readable inside the container at the
			// same host path — this dir is bind-mounted there (container-manager).
			stagingDir: getWorkspaceSandboxPaths(this.params.workspaceId).launchDir,
		};
	}

	getAgentHookUrl(): string {
		// host.docker.internal reaches the host's loopback from containers on
		// Docker Desktop natively; the container is created with
		// `--add-host host.docker.internal:host-gateway` for Linux engines.
		return getHostAgentHookUrl().replace("127.0.0.1", "host.docker.internal");
	}

	async destroy(): Promise<void> {
		await destroyWorkspaceSandbox(this.params.workspaceId);
	}
}
