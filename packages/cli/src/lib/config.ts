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

export type SupersetConfig = {
	auth?: {
		accessToken: string;
		expiresAt: number;
	};
	apiUrl?: string;
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
	// Best-effort: if a previous CLI version wrote the file with a wider mode,
	// repair it to 0600 on read so the access token isn't world-readable.
	try {
		const stat = statSync(CONFIG_PATH);
		if ((stat.mode & 0o077) !== 0) {
			chmodSync(CONFIG_PATH, 0o600);
		}
	} catch {
		// stat/chmod failure is non-fatal — proceed with the read.
	}
	return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: SupersetConfig): void {
	ensureDir();
	// Pass mode on create. writeFileSync ignores mode for existing files, so
	// we follow up with chmodSync to repair any pre-existing world-readable file.
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
	try {
		chmodSync(CONFIG_PATH, 0o600);
	} catch {
		// chmod failure is non-fatal.
	}
}

export function readDeviceConfig(): DeviceConfig | null {
	if (!existsSync(DEVICE_PATH)) return null;
	return JSON.parse(readFileSync(DEVICE_PATH, "utf-8"));
}

export function getApiUrl(config: SupersetConfig): string {
	return config.apiUrl ?? "https://api.superset.sh";
}
