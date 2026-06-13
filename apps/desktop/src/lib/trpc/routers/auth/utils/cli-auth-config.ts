import { randomUUID } from "node:crypto";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";

export type SupersetCliAuthConfig = Record<string, unknown> & {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	apiKey?: string;
	organizationId?: string;
};

export const CLI_AUTH_CONFIG_PATH = join(SUPERSET_HOME_DIR, "config.json");

export function getCliAuthConfigPath(): string {
	return join(
		process.env.SUPERSET_HOME_DIR || SUPERSET_HOME_DIR,
		"config.json",
	);
}

function isNodeErrno(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

async function readCliAuthConfig(): Promise<SupersetCliAuthConfig> {
	const configPath = getCliAuthConfigPath();
	try {
		const fileStat = await stat(configPath);
		if ((fileStat.mode & 0o077) !== 0) {
			await chmod(configPath, SUPERSET_SENSITIVE_FILE_MODE).catch(
				() => undefined,
			);
		}
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return {};
		throw error;
	}

	try {
		const parsed = JSON.parse(await readFile(configPath, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as SupersetCliAuthConfig)
			: {};
	} catch {
		return {};
	}
}

async function writeCliAuthConfig(
	config: SupersetCliAuthConfig,
): Promise<void> {
	const configPath = getCliAuthConfigPath();
	const configDir = dirname(configPath);
	await mkdir(configDir, {
		recursive: true,
		mode: SUPERSET_HOME_DIR_MODE,
	});
	await chmod(configDir, SUPERSET_HOME_DIR_MODE).catch(() => undefined);

	const tempPath = join(
		configDir,
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	await writeFile(tempPath, JSON.stringify(config, null, 2), {
		mode: SUPERSET_SENSITIVE_FILE_MODE,
	});
	await chmod(tempPath, SUPERSET_SENSITIVE_FILE_MODE).catch(() => undefined);
	try {
		await rename(tempPath, configPath);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
	await chmod(configPath, SUPERSET_SENSITIVE_FILE_MODE).catch(() => undefined);
}

function parseExpiresAt(value: string): number {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		throw new Error("Cannot sync CLI auth config: expiresAt is invalid");
	}
	return timestamp;
}

function normalizeOrganizationId(
	organizationId: string | null | undefined,
): string | null | undefined {
	if (organizationId === undefined) return undefined;
	if (organizationId === null) return null;
	const trimmed = organizationId.trim();
	return trimmed ? trimmed : null;
}

export async function syncCliAuthConfig(args: {
	token: string;
	expiresAt: string;
	organizationId?: string | null;
}): Promise<void> {
	const organizationId = normalizeOrganizationId(args.organizationId);
	const config = await readCliAuthConfig();
	config.auth = {
		accessToken: args.token,
		expiresAt: parseExpiresAt(args.expiresAt),
	};
	delete config.apiKey;

	if (organizationId === null) {
		delete config.organizationId;
	} else if (organizationId !== undefined) {
		config.organizationId = organizationId;
	}

	await writeCliAuthConfig(config);
}

export async function clearCliAuthConfig(): Promise<void> {
	const config = await readCliAuthConfig();
	delete config.auth;
	delete config.organizationId;
	await writeCliAuthConfig(config);
}
