import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ActiveOrg {
	id: string;
	name: string;
	slug: string;
}

export type SupersetConfig = {
	auth?: {
		accessToken: string;
	};
	activeOrg?: ActiveOrg;
	apiUrl?: string;
	clientIds?: Record<string, string>;
};

export type DeviceConfig = {
	deviceId: string;
	deviceName: string;
};

export const SUPERSET_HOME_DIR = join(homedir(), "superset");
const CONFIG_PATH = join(SUPERSET_HOME_DIR, "config.json");
const DEVICE_PATH = join(SUPERSET_HOME_DIR, "device.json");

function ensureDir() {
	if (!existsSync(SUPERSET_HOME_DIR)) {
		mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
	}
}

export function readConfig(): SupersetConfig {
	if (!existsSync(CONFIG_PATH)) return {};
	return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: SupersetConfig): void {
	ensureDir();
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function readDeviceConfig(): DeviceConfig | null {
	if (!existsSync(DEVICE_PATH)) return null;
	return JSON.parse(readFileSync(DEVICE_PATH, "utf-8"));
}

export function getApiUrl(config: SupersetConfig): string {
	return config.apiUrl ?? "https://api.superset.sh";
}
