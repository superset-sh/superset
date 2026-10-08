import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveWriteTarget } from "@superset/agent-setup/write-file-if-changed";
import { env } from "./env";
import { getSupersetHomeDir } from "./settings/paths";

/** A token this close to `auth.expiresAt` is treated as expired. */
export const AUTH_REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export type SupersetConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	apiKey?: string;
	organizationId?: string;
};

export function getSupersetConfigPath(): string {
	return join(getSupersetHomeDir(), "config.json");
}

function ensureDir() {
	const homeDir = getSupersetHomeDir();
	if (!existsSync(homeDir)) {
		mkdirSync(homeDir, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = statSync(homeDir);
		if ((stat.mode & 0o077) !== 0) chmodSync(homeDir, 0o700);
	} catch {}
}

export function readConfig(): SupersetConfig {
	const configPath = getSupersetConfigPath();
	if (!existsSync(configPath)) return {};
	try {
		const stat = statSync(configPath);
		if ((stat.mode & 0o077) !== 0) chmodSync(configPath, 0o600);
	} catch {}
	return JSON.parse(readFileSync(configPath, "utf-8"));
}

/**
 * SUPERSET_ORGANIZATION_ID overrides the stored org for this invocation
 * (headless/CI, and dev where the CLI must target a specific local org),
 * mirroring how SUPERSET_API_KEY overrides the stored credential. Not
 * persisted to disk.
 */
export function resolveOrganizationId(
	config: SupersetConfig,
): string | undefined {
	return process.env.SUPERSET_ORGANIZATION_ID?.trim() || config.organizationId;
}

type ConfigWriteFs = Pick<
	typeof import("node:fs"),
	"writeFileSync" | "renameSync" | "unlinkSync"
>;

export function writeConfig(
	config: SupersetConfig,
	fs: ConfigWriteFs = { writeFileSync, renameSync, unlinkSync },
): void {
	ensureDir();
	const configPath = resolveWriteTarget(getSupersetConfigPath());
	const tempPath = join(
		dirname(configPath),
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
	try {
		chmodSync(tempPath, 0o600);
	} catch {}
	try {
		fs.renameSync(tempPath, configPath);
	} catch (error) {
		try {
			fs.unlinkSync(tempPath);
		} catch {}
		throw error;
	}
	try {
		chmodSync(configPath, 0o600);
	} catch {}
}

export function getApiUrl(): string {
	return env.SUPERSET_API_URL;
}
