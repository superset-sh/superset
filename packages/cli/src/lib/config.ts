import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env";

export type SupersetConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	organizationId?: string;
};

export const SUPERSET_HOME_DIR =
	process.env.SUPERSET_HOME_DIR ?? join(homedir(), ".superset");
const CONFIG_PATH = join(SUPERSET_HOME_DIR, "config.json");

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
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		const stat = statSync(CONFIG_PATH);
		if ((stat.mode & 0o077) !== 0) chmodSync(CONFIG_PATH, 0o600);
	} catch {}
	return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: SupersetConfig): void {
	ensureDir();
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
	try {
		chmodSync(CONFIG_PATH, 0o600);
	} catch {}
}

export function getApiUrl(): string {
	return env.SUPERSET_API_URL;
}
