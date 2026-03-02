import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { projects, type SelectProject } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { SetupAction, SetupDetectionResult } from "shared/types/config";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadSetupConfig } from "../workspaces/utils/setup";

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
	return setup.length > 0 || teardown.length > 0;
}

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
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
