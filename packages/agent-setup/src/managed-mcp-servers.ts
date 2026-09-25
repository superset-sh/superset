import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type ExternalMcpServer,
	isServerSatisfiedExternally,
	type PluginMcpServerConfig,
} from "@superset/shared/plugins";
import { writeFileIfChanged } from "./agent-wrappers-common";
import {
	ensureManagedTomlBlock,
	type ManagedTomlBlockSpec,
	removeManagedTomlBlock,
} from "./managed-toml-block";
import { resolveSupersetHomeDir } from "./paths";

/**
 * Materializes the MCP servers of installed Superset plugins into agent
 * configs, and reaps them on uninstall. MVP targets: Claude Code
 * (`~/.claude.json`, the state file where `mcpServers` lives — see
 * provider-profiles.ts) and Codex (`~/.codex/config.toml`).
 *
 * Ownership models differ per dialect because an MCP entry has no natural
 * fingerprint (unlike hooks, recognized by their notify-script path):
 *
 * - Claude's `mcpServers` is a name→object map inside a user-owned file, so a
 *   sidecar ledger (`~/.superset/plugins/mcp-ledger.json`) records which keys
 *   we wrote and a hash of each value. Reap removes only keys whose current
 *   value still matches what we wrote; a user-edited entry transfers to the
 *   user. A pre-existing key we never wrote is never touched.
 * - Codex's TOML gets a marker-delimited block (managed-toml-block engine),
 *   which carries its own ownership. Servers the user already defines outside
 *   the block are skipped — a duplicate `[mcp_servers.<name>]` table would be
 *   invalid TOML and break Codex outright.
 *
 * Like every writer here: an unparseable existing file is never clobbered,
 * and removal never creates files.
 */

export interface SyncManagedMcpServersOptions {
	/** Override for tests. */
	homeDir?: string;
	/** Override for tests; production resolves ~/.superset. */
	supersetHomeDir?: string;
}

interface McpLedger {
	version: 1;
	/** absolute config path → (server name → hash of the value we wrote) */
	files: Record<string, Record<string, string>>;
}

function getLedgerPath(supersetHomeDir: string): string {
	return path.join(supersetHomeDir, "plugins", "mcp-ledger.json");
}

function readLedger(supersetHomeDir: string): McpLedger {
	const ledgerPath = getLedgerPath(supersetHomeDir);
	if (!fs.existsSync(ledgerPath)) return { version: 1, files: {} };
	try {
		const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof parsed.files === "object" &&
			parsed.files !== null
		) {
			return { version: 1, files: parsed.files };
		}
	} catch {
		// Fall through to a fresh ledger: worst case we stop reaping entries an
		// older ledger tracked, which errs on the never-delete side.
	}
	return { version: 1, files: {} };
}

function writeLedger(supersetHomeDir: string, ledger: McpLedger): void {
	const ledgerPath = getLedgerPath(supersetHomeDir);
	fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
	writeFileIfChanged(ledgerPath, JSON.stringify(ledger, null, 2), 0o600);
}

/** Stable across key order so a JSON round-trip doesn't fake an edit. */
export function hashMcpServerValue(value: unknown): string {
	const canonical = JSON.stringify(sortKeysDeep(value));
	return crypto.createHash("sha256").update(canonical).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, inner]) => [key, sortKeysDeep(inner)]),
		);
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Claude's `.mcp.json` dialect: stdio entries carry an explicit type. */
function toClaudeServerValue(
	config: PluginMcpServerConfig,
): Record<string, unknown> {
	if ("url" in config) {
		return {
			type: config.type,
			url: config.url,
			...(config.headers ? { headers: config.headers } : {}),
		};
	}
	return {
		type: "stdio",
		command: config.command,
		...(config.args ? { args: [...config.args] } : {}),
		...(config.env ? { env: config.env } : {}),
	};
}

/**
 * Merges desired entries into `~/.claude.json`'s `mcpServers` map under
 * ledger ownership. Serializes only on semantic change so a converged sync
 * never reformats Claude's own state file.
 */
function syncClaudeMcpServers(
	desired: Record<string, PluginMcpServerConfig>,
	homeDir: string,
	ledger: McpLedger,
): void {
	const filePath = path.join(homeDir, ".claude.json");
	const tracked = ledger.files[filePath] ?? {};

	let rawAtRead: string | null = null;
	let root: Record<string, unknown>;
	if (fs.existsSync(filePath)) {
		try {
			rawAtRead = fs.readFileSync(filePath, "utf-8");
			const parsed = JSON.parse(rawAtRead);
			if (!isPlainObject(parsed)) {
				console.warn(
					`[agent-setup] Expected ${filePath} to contain a JSON object; skipping Claude MCP sync`,
				);
				return;
			}
			root = parsed;
		} catch (error) {
			console.warn(
				`[agent-setup] Could not parse existing ${filePath}; skipping Claude MCP sync:`,
				error,
			);
			return;
		}
	} else {
		if (Object.keys(desired).length === 0) {
			delete ledger.files[filePath];
			return;
		}
		root = {};
	}

	const hadContainer = "mcpServers" in root;
	const container = isPlainObject(root.mcpServers)
		? (root.mcpServers as Record<string, unknown>)
		: {};
	if (hadContainer && !isPlainObject(root.mcpServers)) {
		console.warn(
			`[agent-setup] ${filePath} has a non-object mcpServers; skipping Claude MCP sync`,
		);
		return;
	}

	let mutated = false;
	const nextTracked: Record<string, string> = {};

	// Reap entries we wrote that are no longer desired — unless the user
	// edited them since, in which case ownership transfers to the user.
	for (const [name, writtenHash] of Object.entries(tracked)) {
		if (name in desired) continue;
		const current = container[name];
		if (current !== undefined && hashMcpServerValue(current) === writtenHash) {
			delete container[name];
			mutated = true;
		}
	}

	for (const [name, config] of Object.entries(desired)) {
		const value = toClaudeServerValue(config);
		const valueHash = hashMcpServerValue(value);
		const current = container[name];

		if (current !== undefined && !(name in tracked)) {
			// The user defined this server themselves before we got here;
			// their entry wins and stays theirs.
			continue;
		}
		if (
			current !== undefined &&
			name in tracked &&
			hashMcpServerValue(current) !== tracked[name]
		) {
			// We wrote it once, the user edited it since: theirs now.
			continue;
		}
		if (current === undefined || hashMcpServerValue(current) !== valueHash) {
			container[name] = value;
			mutated = true;
		}
		nextTracked[name] = valueHash;
	}

	// Concurrency guard: Claude Code rewrites this file while it runs, and a
	// write landing between our read and our write would be clobbered wholesale
	// (the file holds far more than mcpServers). If the file changed since we
	// read it, skip this round — ledger untouched — and let the next sync
	// converge. A write inside the remaining read-check-rename window can still
	// lose, but the window is milliseconds instead of the whole merge.
	if (mutated) {
		try {
			const rawNow = fs.existsSync(filePath)
				? fs.readFileSync(filePath, "utf-8")
				: null;
			if (rawNow !== rawAtRead) {
				console.warn(
					`[agent-setup] ${filePath} changed during sync; skipping this round`,
				);
				return;
			}
		} catch {
			return;
		}
	}

	if (Object.keys(nextTracked).length === 0) {
		delete ledger.files[filePath];
	} else {
		ledger.files[filePath] = nextTracked;
	}

	if (!mutated) return;

	if (Object.keys(container).length > 0) {
		root.mcpServers = container;
	} else if (hadContainer) {
		root.mcpServers = container;
	}

	writeFileIfChanged(filePath, JSON.stringify(root, null, 2), 0o600);
	console.log("[agent-setup] Updated Claude mcpServers");
}

const CODEX_MARKER_START = "# >>> superset managed mcp servers >>>";
const CODEX_MARKER_END = "# <<< superset managed mcp servers <<<";

function tomlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function codexServerTable(name: string, config: PluginMcpServerConfig): string {
	const lines = [`[mcp_servers.${name}]`];
	if ("url" in config) {
		lines.push(`url = ${tomlString(config.url)}`);
		if (config.headers && Object.keys(config.headers).length > 0) {
			// Codex's key for static request headers is `http_headers`.
			const pairs = Object.entries(config.headers)
				.map(([key, val]) => `${tomlString(key)} = ${tomlString(val)}`)
				.join(", ");
			lines.push(`http_headers = { ${pairs} }`);
		}
	} else {
		lines.push(`command = ${tomlString(config.command)}`);
		if (config.args && config.args.length > 0) {
			lines.push(
				`args = [${config.args.map((arg) => tomlString(arg)).join(", ")}]`,
			);
		}
		if (config.env && Object.keys(config.env).length > 0) {
			const pairs = Object.entries(config.env)
				.map(([key, val]) => `${key} = ${tomlString(val)}`)
				.join(", ");
			lines.push(`env = { ${pairs} }`);
		}
	}
	return lines.join("\n");
}

function codexMcpSpec(
	desired: Record<string, PluginMcpServerConfig>,
	homeDir: string,
): ManagedTomlBlockSpec {
	return {
		markerStart: CODEX_MARKER_START,
		markerEnd: CODEX_MARKER_END,
		getFilePath: () => path.join(homeDir, ".codex", "config.toml"),
		fileLabel: "Codex config.toml",
		removeLabel: "Codex managed MCP servers",
		fileMode: 0o644,
		isManagedTable: (tableLines) =>
			/^\s*\[mcp_servers\./.test(tableLines[0] ?? ""),
		buildBlock: (base) => {
			// A user-defined [mcp_servers.<name>] outside our block wins: a
			// duplicate TOML table would break Codex's config parse entirely.
			const entries = Object.entries(desired).filter(([name]) => {
				const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				return !new RegExp(`^\\s*\\[mcp_servers\\.${escaped}[\\].]`, "m").test(
					base,
				);
			});
			if (entries.length === 0) return "";
			return [
				CODEX_MARKER_START,
				"# Managed by Superset — do not edit inside this block. Entries",
				"# converge on the plugins installed in the Superset desktop app.",
				...entries.map(([name, config]) => codexServerTable(name, config)),
				CODEX_MARKER_END,
			].join("\n");
		},
	};
}

/**
 * Server names the user configured in agent configs *outside* Superset:
 * `mcpServers` keys in ~/.claude.json the ledger doesn't track, plus
 * `[mcp_servers.<name>]` tables in Codex's config.toml outside our managed
 * block. Read-only — lets the catalog mark such plugins "already set up"
 * instead of offering Install. Unreadable files contribute nothing.
 */
export function readExternallyConfiguredMcpServers(
	options: SyncManagedMcpServersOptions = {},
): ExternalMcpServer[] {
	const homeDir = options.homeDir ?? os.homedir();
	const supersetHomeDir = options.supersetHomeDir ?? resolveSupersetHomeDir();
	const ledger = readLedger(supersetHomeDir);
	const byName = new Map<string, ExternalMcpServer>();

	const record = (name: string, config: unknown, source: string) => {
		if (byName.has(name) || !isPlainObject(config)) return;
		byName.set(name, {
			name,
			...(typeof config.url === "string" ? { url: config.url } : {}),
			...(typeof config.command === "string"
				? { command: config.command }
				: {}),
			...(Array.isArray(config.args)
				? {
						args: config.args.filter((a): a is string => typeof a === "string"),
					}
				: {}),
			source,
		});
	};

	// Claude: user scope (mcpServers keys the ledger doesn't track) plus every
	// project scope — `claude mcp add` defaults to project scope, so most
	// hand-added servers live under projects[*].mcpServers.
	const claudePath = path.join(homeDir, ".claude.json");
	const tracked = ledger.files[claudePath] ?? {};
	if (fs.existsSync(claudePath)) {
		try {
			const root = JSON.parse(fs.readFileSync(claudePath, "utf-8"));
			if (isPlainObject(root)) {
				if (isPlainObject(root.mcpServers)) {
					for (const [name, config] of Object.entries(root.mcpServers)) {
						if (!(name in tracked)) record(name, config, "Claude Code");
					}
				}
				if (isPlainObject(root.projects)) {
					for (const [projectPath, project] of Object.entries(root.projects)) {
						if (!isPlainObject(project)) continue;
						if (!isPlainObject(project.mcpServers)) continue;
						for (const [name, config] of Object.entries(project.mcpServers)) {
							record(
								name,
								config,
								`Claude Code (project: ${path.basename(projectPath)})`,
							);
						}
					}
				}
			}
		} catch {
			// Unparseable file: report nothing rather than guessing.
		}
	}

	// Cursor's global config; tolerate the JSONC comments Cursor allows.
	const cursorPath = path.join(homeDir, ".cursor", "mcp.json");
	if (fs.existsSync(cursorPath)) {
		try {
			const raw = fs
				.readFileSync(cursorPath, "utf-8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^\s*\/\/.*$/gm, "");
			const root = JSON.parse(raw);
			if (isPlainObject(root) && isPlainObject(root.mcpServers)) {
				for (const [name, config] of Object.entries(root.mcpServers)) {
					record(name, config, "Cursor");
				}
			}
		} catch {
			// Best effort only.
		}
	}

	const codexPath = path.join(homeDir, ".codex", "config.toml");
	let codexContent: string | null = null;
	try {
		codexContent = fs.existsSync(codexPath)
			? fs.readFileSync(codexPath, "utf-8")
			: null;
	} catch {
		// Unreadable file contributes nothing, per the contract above.
	}
	if (codexContent !== null) {
		const content = codexContent;
		const start = content.indexOf(CODEX_MARKER_START);
		const end = content.indexOf(CODEX_MARKER_END);
		const outsideBlock =
			start !== -1 && end !== -1
				? content.slice(0, start) + content.slice(end + CODEX_MARKER_END.length)
				: content;
		// Line-level parse of each [mcp_servers.<name>] table: enough for
		// matching (url/command), no TOML parser needed.
		const tables = outsideBlock.split(/^\s*\[/m);
		// Values may be TOML basic ("...") or literal ('...') strings; both
		// are read so a single-quoted url still matches for dedup.
		const stringValue = (source: string, key: string) => {
			const match = source.match(
				new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "m"),
			);
			return match?.[1] ?? match?.[2];
		};
		for (const table of tables) {
			const header = table.match(/^mcp_servers\.([A-Za-z0-9_-]+)\]/);
			const name = header?.[1];
			if (name === undefined || byName.has(name)) continue;
			const url = stringValue(table, "url");
			const command = stringValue(table, "command");
			const argsRaw = table.match(/^\s*args\s*=\s*\[([^\]]*)\]/m)?.[1];
			const args = argsRaw
				? [...argsRaw.matchAll(/"([^"]*)"|'([^']*)'/g)].map(
						(m) => m[1] ?? m[2] ?? "",
					)
				: undefined;
			byName.set(name, {
				name,
				...(url ? { url } : {}),
				...(command ? { command } : {}),
				...(args ? { args } : {}),
				source: "Codex",
			});
		}
	}

	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Converges every managed agent config on `desired` (server name → config).
 * Installing writes entries, uninstalling reaps them; call sites pass the
 * full desired set derived from installed plugins, never deltas.
 *
 * Servers the user already configured themselves satisfy the plugin — but
 * only for the agent they configured them in: a hand-written Codex table
 * must not suppress (or reap) the Claude entry, and vice versa. Each
 * writer's desired set is therefore filtered against externals from its own
 * scope only.
 */
export function syncManagedMcpServers(
	desired: Record<string, PluginMcpServerConfig>,
	options: SyncManagedMcpServersOptions = {},
): void {
	const homeDir = options.homeDir ?? os.homedir();
	const supersetHomeDir = options.supersetHomeDir ?? resolveSupersetHomeDir();
	const external = readExternallyConfiguredMcpServers(options);

	const desiredForScope = (sourcePrefix: string) => {
		const scoped = external.filter(
			(server) =>
				server.source === undefined || server.source.startsWith(sourcePrefix),
		);
		return Object.fromEntries(
			Object.entries(desired).filter(
				([name, config]) => !isServerSatisfiedExternally(name, config, scoped),
			),
		);
	};

	const ledger = readLedger(supersetHomeDir);
	syncClaudeMcpServers(desiredForScope("Claude Code"), homeDir, ledger);
	writeLedger(supersetHomeDir, ledger);

	const codexDesired = desiredForScope("Codex");
	const spec = codexMcpSpec(codexDesired, homeDir);
	if (Object.keys(codexDesired).length === 0) {
		// Only reap when our marker block is actually present: this runs at
		// every desktop boot for every user, and removeManagedTomlBlock would
		// otherwise whitespace-normalize a config we never wrote into.
		try {
			if (
				fs.existsSync(spec.getFilePath()) &&
				fs
					.readFileSync(spec.getFilePath(), "utf-8")
					.includes(CODEX_MARKER_START)
			) {
				removeManagedTomlBlock(spec);
			}
		} catch {
			// Unreadable: nothing of ours to reap.
		}
	} else {
		ensureManagedTomlBlock(spec);
	}
}
