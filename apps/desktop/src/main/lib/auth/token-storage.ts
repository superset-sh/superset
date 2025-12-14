import fs from "node:fs/promises";
import { join } from "node:path";
import { safeStorage } from "electron";
import type { AuthSession } from "shared/auth";
import { SUPERSET_HOME_DIR } from "../app-environment";

const SESSION_FILE_NAME = "auth-session.enc";

/**
 * Securely stores authentication session using Electron's safeStorage API
 * Session data is encrypted at rest using the OS keychain
 */
class TokenStorage {
	private readonly filePath: string;

	constructor() {
		this.filePath = join(SUPERSET_HOME_DIR, SESSION_FILE_NAME);
	}

	async save(session: AuthSession): Promise<void> {
		if (!safeStorage.isEncryptionAvailable()) {
			console.warn(
				"[auth] Secure storage not available, session will not be persisted",
			);
			return;
		}

		const encrypted = safeStorage.encryptString(JSON.stringify(session));
		await fs.writeFile(this.filePath, encrypted);
	}

	async load(): Promise<AuthSession | null> {
		if (!safeStorage.isEncryptionAvailable()) {
			return null;
		}

		try {
			const encrypted = await fs.readFile(this.filePath);
			const decrypted = safeStorage.decryptString(encrypted);
			return JSON.parse(decrypted) as AuthSession;
		} catch {
			// File doesn't exist or can't be decrypted
			return null;
		}
	}

	async clear(): Promise<void> {
		try {
			await fs.unlink(this.filePath);
		} catch {
			// File doesn't exist, that's fine
		}
	}
}

export const tokenStorage = new TokenStorage();
