import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { z } from "zod";

export interface AutomationCapabilityInput {
	capabilityId: string;
	capabilityVersionId: string;
	type: "skill" | "cli";
	slug: string;
	name: string;
	version: string;
	manifest: Record<string, unknown>;
	artifactUrl: string;
	artifactSha256: string;
	config: Record<string, unknown>;
	displayOrder: number;
}

export interface MaterializedAutomationCapability {
	capabilityId: string;
	capabilityVersionId: string;
	type: "skill" | "cli";
	slug: string;
	name: string;
	version: string;
	artifactSha256: string;
	path: string;
	status: "materialized" | "installed" | "reused";
	toolsMarkdownPath?: string;
	binDir?: string;
}

export interface AutomationCapabilityMaterialization {
	capabilitiesDirectory: string;
	manifestPath: string;
	pathEntries: string[];
	capabilities: MaterializedAutomationCapability[];
}

const INSTALL_STATE_VERSION = 2;

const skillManifestSchema = z
	.object({
		type: z.literal("skill"),
		entry: z.literal("skill"),
		skill: z
			.object({
				entryFile: z.string().default("SKILL.md"),
				targets: z.array(z.string()).default(["codex"]),
				activation: z.string().optional(),
			})
			.passthrough(),
	})
	.passthrough();

const cliManifestSchema = z
	.object({
		type: z.literal("cli"),
		entry: z.literal("tool"),
		cli: z
			.object({
				install: z
					.object({
						strategy: z.string(),
						commands: z.array(z.string()).default([]),
					})
					.passthrough(),
				commands: z.array(
					z
						.object({
							name: z.string(),
							bin: z.string(),
							description: z.string().optional(),
							examples: z.array(z.string()).default([]),
						})
						.passthrough(),
				),
				env: z
					.array(
						z
							.object({
								name: z.string(),
								required: z.boolean().default(false),
								secret: z.boolean().default(false),
								description: z.string().optional(),
							})
							.passthrough(),
					)
					.default([]),
				network: z.boolean().default(false),
			})
			.passthrough(),
	})
	.passthrough();

function sha256(bytes: Uint8Array | Buffer | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function normalizeArchivePath(rawPath: string): string {
	const trimmed = rawPath.trim();
	if (!trimmed || trimmed.includes("\0") || trimmed.includes("\\")) {
		throw new Error(`Unsafe capability archive path: ${rawPath}`);
	}
	if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
		throw new Error(`Capability archive path must be relative: ${rawPath}`);
	}
	if (trimmed.split("/").includes("..")) {
		throw new Error(`Capability archive path escapes root: ${rawPath}`);
	}
	const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
	if (
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../")
	) {
		throw new Error(`Capability archive path escapes root: ${rawPath}`);
	}
	return normalized;
}

function safeSlug(slug: string): string {
	return slug.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function downloadArchive(args: {
	archivesDirectory: string;
	capabilityVersionId: string;
	artifactUrl: string;
	artifactSha256: string;
}): Promise<Buffer> {
	mkdirSync(args.archivesDirectory, { recursive: true, mode: 0o700 });
	const archivePath = path.join(
		args.archivesDirectory,
		`${args.capabilityVersionId}.zip`,
	);
	if (existsSync(archivePath)) {
		const existing = readFileSync(archivePath);
		if (sha256(existing) === args.artifactSha256) return existing;
		rmSync(archivePath, { force: true });
	}

	const artifactUrl = new URL(args.artifactUrl);
	const bytes =
		artifactUrl.protocol === "file:"
			? readFileSync(fileURLToPath(artifactUrl))
			: await fetchArchiveBytes(args.artifactUrl);
	const digest = sha256(bytes);
	if (digest !== args.artifactSha256) {
		throw new Error("Capability archive checksum mismatch.");
	}
	writeFileSync(archivePath, bytes, { mode: 0o600 });
	return bytes;
}

async function fetchArchiveBytes(artifactUrl: string): Promise<Buffer> {
	const response = await fetch(artifactUrl);
	if (!response.ok) {
		throw new Error(
			`Failed to download capability archive: HTTP ${response.status}`,
		);
	}
	return Buffer.from(await response.arrayBuffer());
}

function unzipArchive(bytes: Buffer): Map<string, Uint8Array> {
	const files = unzipSync(new Uint8Array(bytes));
	const result = new Map<string, Uint8Array>();
	for (const [rawPath, data] of Object.entries(files)) {
		if (rawPath.endsWith("/")) continue;
		const normalized = normalizeArchivePath(rawPath);
		if (result.has(normalized)) {
			throw new Error(`Duplicate capability archive path: ${normalized}`);
		}
		result.set(normalized, data);
	}
	return result;
}

function writeEntriesUnderPrefix(args: {
	files: Map<string, Uint8Array>;
	prefix: string;
	destination: string;
}) {
	rmSync(args.destination, { recursive: true, force: true });
	mkdirSync(args.destination, { recursive: true, mode: 0o700 });
	const prefix = `${args.prefix.replace(/\/$/, "")}/`;
	for (const [entryPath, data] of args.files) {
		if (!entryPath.startsWith(prefix)) continue;
		const relativePath = normalizeArchivePath(entryPath.slice(prefix.length));
		const destinationPath = path.join(args.destination, relativePath);
		mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
		writeFileSync(destinationPath, data, { mode: 0o600 });
	}
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandsHash(commands: string[]): string {
	return sha256(JSON.stringify(commands));
}

function readInstallState(statePath: string): {
	installStateVersion?: number;
	artifactSha256: string;
	commandsHash: string;
	status: string;
} | null {
	try {
		return JSON.parse(readFileSync(statePath, "utf-8")) as {
			installStateVersion?: number;
			artifactSha256: string;
			commandsHash: string;
			status: string;
		};
	} catch {
		return null;
	}
}

function buildInstallCommandEnv(installDirectory: string) {
	const homeDirectory = path.join(installDirectory, "home");
	const tempDirectory = path.join(installDirectory, "tmp");
	mkdirSync(homeDirectory, { recursive: true, mode: 0o700 });
	mkdirSync(tempDirectory, { recursive: true, mode: 0o700 });

	return {
		PATH: process.env.PATH ?? "",
		HOME: homeDirectory,
		USERPROFILE: homeDirectory,
		TMPDIR: tempDirectory,
		TMP: tempDirectory,
		TEMP: tempDirectory,
		LANG: process.env.LANG ?? "C.UTF-8",
		LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? "C.UTF-8",
		NPM_CONFIG_PREFIX: installDirectory,
		npm_config_prefix: installDirectory,
		NPM_CONFIG_CACHE: path.join(installDirectory, "npm-cache"),
		npm_config_cache: path.join(installDirectory, "npm-cache"),
		BUN_INSTALL: installDirectory,
		BUN_INSTALL_CACHE_DIR: path.join(installDirectory, "bun-cache"),
		PIP_CACHE_DIR: path.join(installDirectory, "pip-cache"),
		PIP_TARGET: path.join(installDirectory, "python"),
	};
}

function runInstallCommands(args: {
	packageDirectory: string;
	installDirectory: string;
	commands: string[];
}) {
	if (args.commands.length === 0) return;
	mkdirSync(args.installDirectory, { recursive: true, mode: 0o700 });
	const shell = process.env.SHELL || "/bin/sh";
	const env = buildInstallCommandEnv(args.installDirectory);
	for (const command of args.commands) {
		const result = spawnSync(shell, ["-lc", command], {
			cwd: args.packageDirectory,
			env,
			encoding: "utf-8",
			timeout: 10 * 60 * 1000,
		});
		if (result.status !== 0) {
			throw new Error(
				`Capability install command failed: ${command}\n${result.stderr || result.stdout}`,
			);
		}
	}
}

function writeCliShims(args: {
	binDirectory: string;
	packageDirectory: string;
	commands: Array<{ name: string; bin: string }>;
}) {
	rmSync(args.binDirectory, { recursive: true, force: true });
	mkdirSync(args.binDirectory, { recursive: true, mode: 0o700 });
	for (const command of args.commands) {
		const bin = command.bin;
		const script = `#!/bin/sh
set -eu
PACKAGE_DIR=${shellQuote(args.packageDirectory)}
BIN_NAME=${shellQuote(bin)}
cd "$PACKAGE_DIR"
if [ -x "$PACKAGE_DIR/node_modules/.bin/$BIN_NAME" ]; then
  exec "$PACKAGE_DIR/node_modules/.bin/$BIN_NAME" "$@"
fi
if [ -n "$BIN_NAME" ] && [ -f "$PACKAGE_DIR/$BIN_NAME" ]; then
  chmod +x "$PACKAGE_DIR/$BIN_NAME" 2>/dev/null || true
  exec "$PACKAGE_DIR/$BIN_NAME" "$@"
fi
if [ -n "$BIN_NAME" ] && [ -f "$PACKAGE_DIR/bin/$BIN_NAME" ]; then
  chmod +x "$PACKAGE_DIR/bin/$BIN_NAME" 2>/dev/null || true
  exec "$PACKAGE_DIR/bin/$BIN_NAME" "$@"
fi
echo "Superset managed CLI '${command.name}' is not installed in $PACKAGE_DIR." >&2
exit 127
`;
		const shimPath = path.join(args.binDirectory, command.name);
		writeFileSync(shimPath, script, { mode: 0o700 });
		chmodSync(shimPath, 0o700);
	}
}

function markCliEntrypointsExecutable(args: {
	packageDirectory: string;
	commands: Array<{ bin: string }>;
}) {
	for (const command of args.commands) {
		for (const candidate of [
			path.join(args.packageDirectory, command.bin),
			path.join(args.packageDirectory, "bin", command.bin),
		]) {
			if (existsSync(candidate)) {
				chmodSync(candidate, 0o700);
			}
		}
	}
}

function writeToolMarkdown(args: {
	pathname: string;
	capability: AutomationCapabilityInput;
	manifest: z.infer<typeof cliManifestSchema>;
}) {
	const lines = [
		`# ${args.capability.name}`,
		"",
		`Version: ${args.capability.version}`,
		`Package: ${args.capability.slug}`,
		"",
		"## Commands",
		"",
		...args.manifest.cli.commands.flatMap((command) => [
			`- \`${command.name}\`${command.description ? ` - ${command.description}` : ""}`,
			...command.examples.map((example) => `  - ${example}`),
		]),
		"",
		"## Environment",
		"",
		...(args.manifest.cli.env.length === 0
			? ["No declared environment variables."]
			: args.manifest.cli.env.map(
					(env) =>
						`- \`${env.name}\`${env.required ? " required" : " optional"}${env.secret ? ", secret" : ""}`,
				)),
	];
	writeFileSync(args.pathname, lines.join("\n"), { mode: 0o600 });
}

async function materializeSkill(args: {
	capability: AutomationCapabilityInput;
	files: Map<string, Uint8Array>;
	skillsDirectory: string;
}): Promise<MaterializedAutomationCapability> {
	const manifest = skillManifestSchema.parse(args.capability.manifest);
	const skillDirectory = path.join(
		args.skillsDirectory,
		safeSlug(args.capability.slug),
	);
	writeEntriesUnderPrefix({
		files: args.files,
		prefix: manifest.entry,
		destination: skillDirectory,
	});

	return {
		capabilityId: args.capability.capabilityId,
		capabilityVersionId: args.capability.capabilityVersionId,
		type: "skill",
		slug: args.capability.slug,
		name: args.capability.name,
		version: args.capability.version,
		artifactSha256: args.capability.artifactSha256,
		path: skillDirectory,
		status: "materialized",
	};
}

async function materializeCli(args: {
	capability: AutomationCapabilityInput;
	files: Map<string, Uint8Array>;
	toolsDirectory: string;
}): Promise<MaterializedAutomationCapability> {
	const manifest = cliManifestSchema.parse(args.capability.manifest);
	const toolDirectory = path.join(
		args.toolsDirectory,
		safeSlug(args.capability.slug),
	);
	const packageDirectory = path.join(toolDirectory, "package");
	const installDirectory = path.join(toolDirectory, "install");
	const binDirectory = path.join(toolDirectory, "bin");
	const statePath = path.join(toolDirectory, "install-state.json");
	const toolsMarkdownPath = path.join(toolDirectory, "tool.md");

	const nextCommandsHash = commandsHash(manifest.cli.install.commands);
	const priorState = readInstallState(statePath);
	const canReuse =
		existsSync(packageDirectory) &&
		priorState?.installStateVersion === INSTALL_STATE_VERSION &&
		priorState?.status === "installed" &&
		priorState.artifactSha256 === args.capability.artifactSha256 &&
		priorState.commandsHash === nextCommandsHash;

	if (!canReuse) {
		writeEntriesUnderPrefix({
			files: args.files,
			prefix: manifest.entry,
			destination: packageDirectory,
		});
		runInstallCommands({
			packageDirectory,
			installDirectory,
			commands: manifest.cli.install.commands,
		});
		writeFileSync(
			statePath,
			JSON.stringify(
				{
					installStateVersion: INSTALL_STATE_VERSION,
					status: "installed",
					artifactSha256: args.capability.artifactSha256,
					commandsHash: nextCommandsHash,
					installedAt: new Date().toISOString(),
				},
				null,
				2,
			),
			{ mode: 0o600 },
		);
	}

	markCliEntrypointsExecutable({
		packageDirectory,
		commands: manifest.cli.commands.map((command) => ({ bin: command.bin })),
	});
	writeCliShims({
		binDirectory,
		packageDirectory,
		commands: manifest.cli.commands.map((command) => ({
			name: command.name,
			bin: command.bin,
		})),
	});
	writeToolMarkdown({
		pathname: toolsMarkdownPath,
		capability: args.capability,
		manifest,
	});

	return {
		capabilityId: args.capability.capabilityId,
		capabilityVersionId: args.capability.capabilityVersionId,
		type: "cli",
		slug: args.capability.slug,
		name: args.capability.name,
		version: args.capability.version,
		artifactSha256: args.capability.artifactSha256,
		path: toolDirectory,
		status: canReuse ? "reused" : "installed",
		toolsMarkdownPath,
		binDir: binDirectory,
	};
}

export async function materializeAutomationCapabilities(args: {
	automationDirectory: string;
	capabilities: AutomationCapabilityInput[];
}): Promise<AutomationCapabilityMaterialization> {
	const capabilitiesDirectory = path.join(
		args.automationDirectory,
		"capabilities",
	);
	const archivesDirectory = path.join(capabilitiesDirectory, "archives");
	const skillsDirectory = path.join(capabilitiesDirectory, "skills");
	const toolsDirectory = path.join(capabilitiesDirectory, "tools");
	mkdirSync(capabilitiesDirectory, { recursive: true, mode: 0o700 });

	const materialized: MaterializedAutomationCapability[] = [];
	for (const capability of [...args.capabilities].sort(
		(a, b) => a.displayOrder - b.displayOrder,
	)) {
		const archive = await downloadArchive({
			archivesDirectory,
			capabilityVersionId: capability.capabilityVersionId,
			artifactUrl: capability.artifactUrl,
			artifactSha256: capability.artifactSha256,
		});
		const files = unzipArchive(archive);
		materialized.push(
			capability.type === "skill"
				? await materializeSkill({
						capability,
						files,
						skillsDirectory,
					})
				: await materializeCli({
						capability,
						files,
						toolsDirectory,
					}),
		);
	}

	const manifestPath = path.join(capabilitiesDirectory, "manifest.json");
	writeFileSync(
		manifestPath,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				capabilities: materialized,
			},
			null,
			2,
		),
		{ mode: 0o600 },
	);

	return {
		capabilitiesDirectory,
		manifestPath,
		pathEntries: materialized
			.map((capability) => capability.binDir)
			.filter((value): value is string => Boolean(value)),
		capabilities: materialized,
	};
}
