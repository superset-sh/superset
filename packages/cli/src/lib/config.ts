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
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { env } from "./env";

export type SupersetConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	apiKey?: string;
	organizationId?: string;
};

export const SUPERSET_HOME_DIR =
	process.env.SUPERSET_HOME_DIR ?? join(homedir(), ".superset");
export const SUPERSET_CONFIG_PATH = join(SUPERSET_HOME_DIR, "config.json");

function ensureDir() {
	if (!existsSync(SUPERSET_HOME_DIR)) {
		mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = statSync(SUPERSET_HOME_DIR);
		if ((stat.mode & 0o077) !== 0) chmodSync(SUPERSET_HOME_DIR, 0o700);
	} catch {}
}

export function readConfig(): SupersetConfig {
	if (!existsSync(SUPERSET_CONFIG_PATH)) return {};
	try {
		const stat = statSync(SUPERSET_CONFIG_PATH);
		if ((stat.mode & 0o077) !== 0) chmodSync(SUPERSET_CONFIG_PATH, 0o600);
	} catch {}
	return JSON.parse(readFileSync(SUPERSET_CONFIG_PATH, "utf-8"));
}

type ConfigWriterFs = {
	chmodSync(path: string, mode: number): void;
	mkdirSync(path: string, options: { recursive: true; mode: number }): unknown;
	renameSync(oldPath: string, newPath: string): void;
	statSync(path: string): { mode: number };
	unlinkSync(path: string): void;
	writeFileSync(path: string, data: string, options: { mode: number }): void;
};

const defaultConfigWriterFs: ConfigWriterFs = {
	chmodSync,
	mkdirSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
};

export function writeConfigFile(
	configPath: string,
	config: SupersetConfig,
	fs: ConfigWriterFs = defaultConfigWriterFs,
): void {
	const configDir = dirname(configPath);
	if (!existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = fs.statSync(configDir);
		if ((stat.mode & 0o077) !== 0) fs.chmodSync(configDir, 0o700);
	} catch {}

	const tempPath = join(
		configDir,
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
	try {
		fs.chmodSync(tempPath, 0o600);
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
		fs.chmodSync(configPath, 0o600);
	} catch {}
}

export function writeConfig(config: SupersetConfig): void {
	ensureDir();
	writeConfigFile(SUPERSET_CONFIG_PATH, config);
}

export function getApiUrl(): string {
	return env.SUPERSET_API_URL;
}
