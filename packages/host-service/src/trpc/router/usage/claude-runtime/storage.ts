import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
	claudeKeychainAccounts,
	discoverClaudeProfiles,
	keychainServicesForConfigDir,
	readKeychainSecrets,
} from "../profiles";
import { ClaudeRuntimeAuthCredentialIdentity } from "./credential-identity";
import type { ClaudeRuntimeAccount, ClaudeRuntimeStorage } from "./runtime";

const execFileAsync = promisify(execFile);
const identity = new ClaudeRuntimeAuthCredentialIdentity();

export function claudeRuntimeDirectory(): string {
	return join(
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset"),
		"state",
		"claude-runtime",
	);
}

async function readOptional(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function readObject(path: string): Promise<Record<string, unknown>> {
	const raw = await readOptional(path);
	if (raw === null) return {};
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new Error("Invalid Claude account state.");
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid Claude account state.");
	return value as Record<string, unknown>;
}

export async function writePrivateFile(
	path: string,
	content: string,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
		await rename(temporary, path);
	} finally {
		await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
}

function accountPaths(selection: string | null, homeDir: string) {
	return {
		config:
			selection === null
				? join(homeDir, ".claude.json")
				: join(selection, ".claude.json"),
		credentials: join(
			selection ?? join(homeDir, ".claude"),
			".credentials.json",
		),
		services:
			selection === null
				? ["Claude Code-credentials"]
				: keychainServicesForConfigDir(selection),
	};
}

async function writeKeychainCredential(
	service: string,
	credentialsJson: string | null,
): Promise<void> {
	if (process.platform !== "darwin") return;
	try {
		await execFileAsync(
			"security",
			credentialsJson === null
				? [
						"delete-generic-password",
						"-s",
						service,
						"-a",
						claudeKeychainAccounts()[0] ?? "claude-code-user",
					]
				: [
						"add-generic-password",
						"-U",
						"-s",
						service,
						"-a",
						claudeKeychainAccounts()[0] ?? "claude-code-user",
						"-w",
						credentialsJson,
					],
			{ timeout: 5_000 },
		);
	} catch (error) {
		if (credentialsJson === null && (error as { code?: number }).code === 44)
			return;
		throw new Error(
			"Unable to update Claude credentials in the macOS Keychain.",
		);
	}
}

async function readKeychainCredentialStrict(
	service: string,
): Promise<string | null> {
	if (process.platform !== "darwin") return null;
	try {
		const { stdout } = await execFileAsync(
			"security",
			[
				"find-generic-password",
				"-s",
				service,
				"-a",
				claudeKeychainAccounts()[0] ?? "claude-code-user",
				"-w",
			],
			{ timeout: 5_000 },
		);
		return stdout.trim() || null;
	} catch (error) {
		if ((error as { code?: number }).code === 44) return null;
		throw new Error(
			"Unable to read Claude credentials from the macOS Keychain.",
		);
	}
}

interface StorageOptions {
	profileDirectories?: string[];
	homeDir?: string;
	directory?: string;
	readSecrets?: typeof readKeychainSecrets;
	writeSecret?: typeof writeKeychainCredential;
	listProfiles?: typeof discoverClaudeProfiles;
}
export function createClaudeRuntimeStorage(
	options: StorageOptions = {},
): ClaudeRuntimeStorage {
	const directory = options.directory ?? claudeRuntimeDirectory();
	const homeDir = options.homeDir ?? homedir();
	const readSecrets = options.readSecrets ?? readKeychainSecrets;
	const writeSecret = options.writeSecret ?? writeKeychainCredential;
	const listProfiles = options.listProfiles ?? discoverClaudeProfiles;
	async function readCredentials(selection: string | null): Promise<string[]> {
		const paths = accountPaths(selection, homeDir);
		const candidates = [await readOptional(paths.credentials)];
		if (selection === null)
			candidates.push(
				await readOptional(
					join(homeDir, ".config", "claude", "credentials.json"),
				),
			);
		for (const service of paths.services)
			candidates.push(...(await readSecrets(service)));
		return candidates.filter(
			(value): value is string =>
				value !== null && identity.isValidCredentialsJsonObject(value),
		);
	}

	async function writeCredentials(
		selection: string | null,
		credentialsJson: string,
	): Promise<void> {
		const paths = accountPaths(selection, homeDir);
		await writeSecret(
			paths.services[0] ?? "Claude Code-credentials",
			credentialsJson,
		);
		await writePrivateFile(paths.credentials, credentialsJson);
	}

	return {
		async checkpointRuntime() {
			const paths = [".credentials.json", ".claude.json", "selection.json"].map(
				(name) => join(directory, name),
			);
			const files = await Promise.all(
				paths.map(async (path) => ({
					path,
					contents: await readOptional(path),
				})),
			);
			const service = accountPaths(directory, homeDir).services[0];
			if (!service) throw new Error("Missing Claude runtime Keychain service.");
			const secret = options.readSecrets
				? ((await options.readSecrets(service))[0] ?? null)
				: await readKeychainCredentialStrict(service);
			return async () => {
				await writeSecret(service, secret);
				for (const { path, contents } of files) {
					if (contents === null)
						await unlink(path).catch((error: NodeJS.ErrnoException) => {
							if (error.code !== "ENOENT") throw error;
						});
					else await writePrivateFile(path, contents);
				}
			};
		},
		async readSelection() {
			const raw = await readOptional(join(directory, "selection.json"));
			if (raw === null) return null;
			let value: ClaudeRuntimeAccount | null;
			try {
				value = JSON.parse(raw) as ClaudeRuntimeAccount | null;
			} catch {
				throw new Error("Invalid Claude runtime selection.");
			}
			if (
				!value ||
				(value.selection !== null && typeof value.selection !== "string") ||
				typeof value.credentialsJson !== "string" ||
				!identity.isValidCredentialsJsonObject(value.credentialsJson)
			)
				throw new Error("Invalid Claude runtime selection.");
			return value;
		},
		async readRuntime() {
			return {
				credentials: await readCredentials(directory),
				oauthAccount: (await readObject(join(directory, ".claude.json")))
					.oauthAccount,
			};
		},
		async readAccounts() {
			const profiles = [
				...new Map(
					[
						...(await listProfiles()),
						...(await discoverClaudeProfiles(options.profileDirectories ?? [])),
					]
						.filter((profile) => profile.configDir !== directory)
						.map((profile) => [profile.configDir, profile]),
				).values(),
			];
			const accounts: ClaudeRuntimeAccount[] = [];
			for (const selection of [
				null,
				...profiles
					.filter((profile) => profile.credentialKind === "subscription")
					.map((profile) => profile.configDir),
			]) {
				const candidates = await readCredentials(selection);
				const credentialsJson = candidates.sort(
					(left, right) =>
						(identity.readFreshnessFromCredentials(right) ?? Infinity) -
						(identity.readFreshnessFromCredentials(left) ?? Infinity),
				)[0];
				if (!credentialsJson) continue;
				accounts.push({
					selection,
					credentialsJson,
					oauthAccount: (
						await readObject(accountPaths(selection, homeDir).config)
					).oauthAccount,
				});
			}
			return accounts;
		},
		async writeAccount(account) {
			await writeCredentials(account.selection, account.credentialsJson);
		},
		async writeRuntime(account) {
			const config = join(directory, ".claude.json");
			const existing = await readObject(config);
			await writeCredentials(directory, account.credentialsJson);
			await writePrivateFile(
				config,
				JSON.stringify({ ...existing, oauthAccount: account.oauthAccount }),
			);
		},
		async writeSelection(account) {
			await writePrivateFile(
				join(directory, "selection.json"),
				JSON.stringify(account),
			);
		},
	};
}
