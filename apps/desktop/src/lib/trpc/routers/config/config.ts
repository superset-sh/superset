import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { projects, type SelectProject } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { appState } from "main/lib/app-state";
import { localDb } from "main/lib/local-db";
import type { SetupAction, SetupDetectionResult } from "shared/types/config";
import {
	DEFAULT_WORKSPACE_CARD_CONFIG,
	parseWorkspaceCardConfig,
	type WorkspaceCardConfig,
	workspaceCardConfigSchema,
	workspaceCardConfigsEqual,
} from "shared/workspace-card-config";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadSetupConfig } from "../workspaces/utils/setup";
import { readRepoWorkspaceCardBlock } from "./workspace-card-config-read";
import {
	resolveWorkspaceCardRepoPath,
	watchWorkspaceCardConfigFile,
} from "./workspace-card-source";
import {
	commandSetHash,
	resolveGatedWorkspaceCardConfig,
} from "./workspace-card-trust";

/**
 * Validated projectId — rejects path traversal attempts before they reach
 * any filesystem join. Used on all workspace-card procedures.
 */
const projectIdSchema = z.string().regex(/^[\w-]{1,64}$/);

function hasConfiguredScripts(
	project: Pick<SelectProject, "id" | "mainRepoPath">,
) {
	const config = loadSetupConfig({
		mainRepoPath: project.mainRepoPath,
		projectId: project.id,
	});
	const setup = Array.isArray(config?.setup)
		? config.setup.filter(
				(s): s is string => typeof s === "string" && s.trim().length > 0,
			)
		: [];
	const teardown = Array.isArray(config?.teardown)
		? config.teardown.filter(
				(s): s is string => typeof s === "string" && s.trim().length > 0,
			)
		: [];
	const run = Array.isArray(config?.run)
		? config.run.filter(
				(s): s is string => typeof s === "string" && s.trim().length > 0,
			)
		: [];
	return setup.length > 0 || teardown.length > 0 || run.length > 0;
}

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": [],
  "run": []
}
`;

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function detectSetupDefaults(
	mainRepoPath: string,
): Promise<SetupDetectionResult> {
	const check = (name: string) => fileExists(join(mainRepoPath, name));

	const [
		hasBunLock,
		hasBunLockb,
		hasPnpmLock,
		hasYarnLock,
		hasYarnRc,
		hasNpmLock,
		hasPoetryLock,
		hasUvLock,
		hasRequirementsTxt,
		hasCargoLock,
		hasGoSum,
		hasGemfileLock,
		hasComposerLock,
		hasEnvExample,
		hasEnvSample,
		hasEnvTemplate,
		hasDockerComposeYml,
		hasDockerComposeYaml,
		hasComposeYml,
		hasComposeYaml,
		hasNvmrc,
		hasNodeVersion,
		hasGitmodules,
	] = await Promise.all([
		check("bun.lock"),
		check("bun.lockb"),
		check("pnpm-lock.yaml"),
		check("yarn.lock"),
		check(".yarnrc.yml"),
		check("package-lock.json"),
		check("poetry.lock"),
		check("uv.lock"),
		check("requirements.txt"),
		check("Cargo.lock"),
		check("go.sum"),
		check("Gemfile.lock"),
		check("composer.lock"),
		check(".env.example"),
		check(".env.sample"),
		check(".env.template"),
		check("docker-compose.yml"),
		check("docker-compose.yaml"),
		check("compose.yml"),
		check("compose.yaml"),
		check(".nvmrc"),
		check(".node-version"),
		check(".gitmodules"),
	]);

	const signals: Record<string, boolean> = {
		bun: hasBunLock || hasBunLockb,
		pnpm: hasPnpmLock,
		yarn: hasYarnLock,
		yarnBerry: hasYarnLock && hasYarnRc,
		npm: hasNpmLock,
		poetry: hasPoetryLock,
		uv: hasUvLock,
		pip: hasRequirementsTxt && !hasPoetryLock && !hasUvLock,
		cargo: hasCargoLock,
		go: hasGoSum,
		bundler: hasGemfileLock,
		composer: hasComposerLock,
		env: hasEnvExample || hasEnvSample || hasEnvTemplate,
		docker:
			hasDockerComposeYml ||
			hasDockerComposeYaml ||
			hasComposeYml ||
			hasComposeYaml,
		nodeVersion: hasNvmrc || hasNodeVersion,
		gitSubmodules: hasGitmodules,
	};

	const envSource = hasEnvExample
		? ".env.example"
		: hasEnvSample
			? ".env.sample"
			: ".env.template";

	const actions: SetupAction[] = [];

	// --- Package managers (JS: bun > pnpm > yarn > npm) ---
	if (signals.bun) {
		actions.push({
			id: "bun-install",
			category: "package-manager",
			label: "Install dependencies",
			detail: "bun install",
			command: "bun install",
			enabled: true,
		});
	} else if (signals.pnpm) {
		actions.push({
			id: "pnpm-install",
			category: "package-manager",
			label: "Install dependencies",
			detail: "pnpm install",
			command: "pnpm install",
			enabled: true,
		});
	} else if (signals.yarn) {
		actions.push({
			id: "yarn-install",
			category: "package-manager",
			label: "Install dependencies",
			detail: "yarn install",
			command: "yarn install",
			enabled: true,
		});
	} else if (signals.npm) {
		actions.push({
			id: "npm-install",
			category: "package-manager",
			label: "Install dependencies",
			detail: "npm ci",
			command: "npm ci",
			enabled: true,
		});
	}

	// --- Python: poetry > uv > pip ---
	if (signals.poetry) {
		actions.push({
			id: "poetry-install",
			category: "package-manager",
			label: "Install Python dependencies",
			detail: "poetry install",
			command: "poetry install",
			enabled: true,
		});
	} else if (signals.uv) {
		actions.push({
			id: "uv-sync",
			category: "package-manager",
			label: "Install Python dependencies",
			detail: "uv sync",
			command: "uv sync",
			enabled: true,
		});
	} else if (signals.pip) {
		actions.push({
			id: "pip-install",
			category: "package-manager",
			label: "Install Python dependencies",
			detail: "pip install -r requirements.txt",
			command: "pip install -r requirements.txt",
			enabled: true,
		});
	}

	// --- Other package managers ---
	if (signals.cargo) {
		actions.push({
			id: "cargo-build",
			category: "package-manager",
			label: "Build Rust project",
			detail: "cargo build",
			command: "cargo build",
			enabled: true,
		});
	}
	if (signals.go) {
		actions.push({
			id: "go-mod-download",
			category: "package-manager",
			label: "Download Go modules",
			detail: "go mod download",
			command: "go mod download",
			enabled: true,
		});
	}
	if (signals.bundler) {
		actions.push({
			id: "bundle-install",
			category: "package-manager",
			label: "Install Ruby dependencies",
			detail: "bundle install",
			command: "bundle install",
			enabled: true,
		});
	}
	if (signals.composer) {
		actions.push({
			id: "composer-install",
			category: "package-manager",
			label: "Install PHP dependencies",
			detail: "composer install",
			command: "composer install",
			enabled: true,
		});
	}

	// --- Environment ---
	if (signals.env) {
		actions.push({
			id: "env-copy",
			category: "environment",
			label: "Copy environment file",
			detail: `${envSource} → .env`,
			command: `[ ! -f .env ] && cp ${envSource} .env`,
			enabled: true,
		});
	}

	// --- Git submodules ---
	if (signals.gitSubmodules) {
		actions.push({
			id: "git-submodules",
			category: "infrastructure",
			label: "Initialize git submodules",
			detail: "git submodule update --init --recursive",
			command: "git submodule update --init --recursive",
			enabled: true,
		});
	}

	// --- Docker ---
	if (signals.docker) {
		actions.push({
			id: "docker-compose-up",
			category: "infrastructure",
			label: "Start Docker services",
			detail: "docker compose up -d",
			command: "docker compose up -d",
			enabled: false,
		});
	}

	// --- Node version manager ---
	if (signals.nodeVersion) {
		const versionFile = hasNvmrc ? ".nvmrc" : ".node-version";
		actions.push({
			id: "node-version",
			category: "version-manager",
			label: "Use correct Node.js version",
			detail: `fnm use (from ${versionFile})`,
			command: "fnm use --install-if-missing || nvm use",
			enabled: false,
		});
	}

	// --- Build project summary ---
	const ecosystems: string[] = [];
	const jsManager = signals.bun
		? "bun"
		: signals.pnpm
			? "pnpm"
			: signals.yarn
				? "yarn"
				: signals.npm
					? "npm"
					: null;
	if (jsManager) ecosystems.push(`a Node.js project using ${jsManager}`);
	const pyManager = signals.poetry
		? "poetry"
		: signals.uv
			? "uv"
			: signals.pip
				? "pip"
				: null;
	if (pyManager) ecosystems.push(`a Python project using ${pyManager}`);
	if (signals.cargo) ecosystems.push("a Rust project");
	if (signals.go) ecosystems.push("a Go project");
	if (signals.bundler) ecosystems.push("a Ruby project");
	if (signals.composer) ecosystems.push("a PHP project");

	let projectSummary = "";
	if (ecosystems.length === 1) {
		projectSummary = `We detected this is ${ecosystems[0]}.`;
	} else if (ecosystems.length > 1) {
		projectSummary = `We detected this is ${ecosystems.join(" and ")}.`;
	}

	const setupTemplate = actions.filter((a) => a.enabled).map((a) => a.command);

	return {
		projectSummary,
		actions,
		setupTemplate,
		signals,
	};
}

function getConfigPath(mainRepoPath: string): string {
	return join(mainRepoPath, ".superset", "config.json");
}

/** What getWorkspaceCardConfig resolves to when no appState override exists. */
function resolveRepoWorkspaceCardConfig(
	projectId: string,
): WorkspaceCardConfig {
	const block = readRepoWorkspaceCardBlock(projectId);
	return block !== undefined
		? parseWorkspaceCardConfig(block)
		: DEFAULT_WORKSPACE_CARD_CONFIG;
}

function ensureConfigExists(mainRepoPath: string): string {
	const configPath = getConfigPath(mainRepoPath);
	const supersetDir = join(mainRepoPath, ".superset");

	if (!existsSync(configPath)) {
		// Create .superset directory if it doesn't exist
		if (!existsSync(supersetDir)) {
			mkdirSync(supersetDir, { recursive: true });
		}
		// Create config.json with template
		writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
	}

	return configPath;
}

export const createConfigRouter = () => {
	return router({
		// Check if we should show the setup card for a project
		shouldShowSetupCard: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return false;
				}

				// Don't show if already dismissed or if config has scripts
				if (project.configToastDismissed) {
					return false;
				}

				return !hasConfiguredScripts(project);
			}),

		// Mark the setup card as dismissed for a project
		dismissSetupCard: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.mutation(({ input }) => {
				localDb
					.update(projects)
					.set({ configToastDismissed: true })
					.where(eq(projects.id, input.projectId))
					.run();
				return { success: true };
			}),

		// Sidebar workspace-card field visibility for a project. The repo's
		// .superset/config.json "workspaceCard" block is the authoritative
		// source (resolved for v1 projects via the local DB, for v2 cloud
		// projects via the host-service DB -- see workspace-card-source.ts);
		// the local appState only carries a per-machine override when the
		// user diverged from the file through the in-app settings.
		//
		// Repo-sourced command lines are gated by the consent mechanism:
		// they are stripped until the user explicitly approves the current
		// command set via trustCardCommands. Component lines are always safe.
		getWorkspaceCardConfig: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.query(({ input }): WorkspaceCardConfig => {
				return resolveGatedWorkspaceCardConfig(input.projectId);
			}),

		// Where the effective card config comes from -- drives the settings
		// UI's "Reset to repo config" affordance and the trust banner.
		getWorkspaceCardConfigSource: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.query(({ input }): "override" | "repo" | "defaults" => {
				if (appState.data.workspaceCardConfigs?.[input.projectId]) {
					return "override";
				}
				return readRepoWorkspaceCardBlock(input.projectId) !== undefined
					? "repo"
					: "defaults";
			}),

		// Returns the trust state for repo-sourced command lines. When
		// pendingCommandCount > 0 the UI should show the consent banner.
		getWorkspaceCardTrustState: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.query(({ input }): { trusted: boolean; pendingCommandCount: number } => {
				// Only relevant when source is "repo".
				if (appState.data.workspaceCardConfigs?.[input.projectId]) {
					return { trusted: true, pendingCommandCount: 0 };
				}
				const block = readRepoWorkspaceCardBlock(input.projectId);
				if (block === undefined) {
					return { trusted: true, pendingCommandCount: 0 };
				}
				const config = parseWorkspaceCardConfig(block);
				const commandCount = config.customLines.filter(
					(l) => l.type === "command" && l.enabled,
				).length;
				if (commandCount === 0) {
					return { trusted: true, pendingCommandCount: 0 };
				}
				const trusted =
					(appState.data.trustedCardCommandProjects?.[input.projectId] ??
						null) === commandSetHash(config);
				return {
					trusted,
					pendingCommandCount: trusted ? 0 : commandCount,
				};
			}),

		// Approve the current repo command set for this project.
		trustCardCommands: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.mutation(async ({ input }) => {
				const block = readRepoWorkspaceCardBlock(input.projectId);
				if (block === undefined) return { success: true };
				const config = parseWorkspaceCardConfig(block);
				const next = { ...appState.data.trustedCardCommandProjects };
				next[input.projectId] = commandSetHash(config);
				appState.data.trustedCardCommandProjects = next;
				await appState.write();
				return { success: true };
			}),

		// Revoke trust for this project's repo command lines.
		untrustCardCommands: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.mutation(async ({ input }) => {
				const next = { ...appState.data.trustedCardCommandProjects };
				delete next[input.projectId];
				appState.data.trustedCardCommandProjects = next;
				await appState.write();
				return { success: true };
			}),

		updateWorkspaceCardConfig: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					workspaceCard: workspaceCardConfigSchema,
				}),
			)
			.mutation(async ({ input }) => {
				const next = { ...appState.data.workspaceCardConfigs };
				// When the submitted config still matches what the repo file
				// resolves to, don't store an override -- otherwise a no-op save
				// would permanently shadow future edits to the file.
				if (
					workspaceCardConfigsEqual(
						input.workspaceCard,
						resolveRepoWorkspaceCardConfig(input.projectId),
					)
				) {
					delete next[input.projectId];
				} else {
					next[input.projectId] = input.workspaceCard;
				}
				appState.data.workspaceCardConfigs = next;
				await appState.write();
				return { success: true };
			}),

		// Drop the per-machine override so the repo file (or defaults) applies.
		resetWorkspaceCardConfig: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.mutation(async ({ input }) => {
				const next = { ...appState.data.workspaceCardConfigs };
				delete next[input.projectId];
				appState.data.workspaceCardConfigs = next;
				await appState.write();
				return { success: true };
			}),

		// Emits whenever the project's .superset/config.json changes on disk,
		// so card configs live-reload without an app restart. Same
		// observable-subscription pattern as hostServiceCoordinator.onStatusChange.
		watchWorkspaceCardConfig: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.subscription(({ input }) => {
				return observable<{ changedAt: number }>((emit) => {
					const repoPath = resolveWorkspaceCardRepoPath(input.projectId);
					if (!repoPath) {
						return () => {};
					}
					return watchWorkspaceCardConfigFile(repoPath, () =>
						emit.next({ changedAt: Date.now() }),
					);
				});
			}),

		// Get the config file path (creates it if it doesn't exist)
		getConfigFilePath: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return null;
				}
				return ensureConfigExists(project.mainRepoPath);
			}),

		// Get the config file content
		getConfigContent: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return { content: null, exists: false };
				}

				const configPath = getConfigPath(project.mainRepoPath);
				if (!existsSync(configPath)) {
					return { content: null, exists: false };
				}

				try {
					const content = readFileSync(configPath, "utf-8");
					return { content, exists: true };
				} catch {
					return { content: null, exists: false };
				}
			}),

		getSetupOnboardingDefaults: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error("Project not found");
				}

				return await detectSetupDefaults(project.mainRepoPath);
			}),

		// Update the config file with new setup/teardown scripts
		updateConfig: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					setup: z.array(z.string()),
					teardown: z.array(z.string()),
					run: z.array(z.string()).optional(),
				}),
			)
			.mutation(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error("Project not found");
				}

				const configPath = ensureConfigExists(project.mainRepoPath);

				// Read and parse existing config, preserving other fields
				let existingConfig: Record<string, unknown> = {};
				try {
					const existingContent = readFileSync(configPath, "utf-8");
					const parsed = JSON.parse(existingContent);
					if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
						existingConfig = parsed;
					}
				} catch {
					// If file doesn't exist or has invalid JSON, start fresh
					existingConfig = {};
				}

				// Merge existing config with new setup/teardown values
				const config = {
					...existingConfig,
					setup: input.setup,
					teardown: input.teardown,
					...(input.run !== undefined && { run: input.run }),
				};

				try {
					writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
					return { success: true };
				} catch (error) {
					console.error("[config/updateConfig] Failed to write config:", error);
					throw new Error("Failed to save config");
				}
			}),
	});
};

export type ConfigRouter = ReturnType<typeof createConfigRouter>;
