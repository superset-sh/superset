import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
const CONFIG_PATH = join(SUPERSET_HOME_DIR, "config.json");

function ensureDir() {
	if (!fs.existsSync(SUPERSET_HOME_DIR)) {
		fs.mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = fs.statSync(SUPERSET_HOME_DIR);
		if ((stat.mode & 0o077) !== 0) fs.chmodSync(SUPERSET_HOME_DIR, 0o700);
	} catch {}
}

export function readConfig(): SupersetConfig {
	if (!fs.existsSync(CONFIG_PATH)) return {};
	try {
		const stat = fs.statSync(CONFIG_PATH);
		if ((stat.mode & 0o077) !== 0) fs.chmodSync(CONFIG_PATH, 0o600);
	} catch {}
	return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: SupersetConfig): void {
	ensureDir();
	const tmpPath = `${CONFIG_PATH}.tmp`;
	fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
	try {
		fs.chmodSync(tmpPath, 0o600);
	} catch {}
	fs.renameSync(tmpPath, CONFIG_PATH);
}

export function getApiUrl(): string {
	return env.SUPERSET_API_URL;
}
