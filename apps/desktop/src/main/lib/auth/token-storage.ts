import fs from "node:fs/promises";
import { join } from "node:path";
import type { AuthSession } from "shared/auth";
import { SUPERSET_HOME_DIR } from "../app-environment";
import { decrypt, encrypt } from "./crypto-storage";

const SESSION_FILE_NAME = "auth-session.enc";

/**
 * Securely stores authentication session using machine-derived encryption.
 * Session data is encrypted at rest using AES-256-GCM with a key derived
 * from the machine's hardware identifier.
 */
class TokenStorage {
	private readonly filePath: string;

	constructor() {
		this.filePath = join(SUPERSET_HOME_DIR, SESSION_FILE_NAME);
	}

	async save(session: AuthSession): Promise<void> {
		const encrypted = encrypt(JSON.stringify(session));
		await fs.writeFile(this.filePath, encrypted);
	}

	async load(): Promise<AuthSession | null> {
		try {
			const encrypted = await fs.readFile(this.filePath);
			const decrypted = decrypt(encrypted);
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
