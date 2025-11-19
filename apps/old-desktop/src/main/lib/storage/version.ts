import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getDomainVersionPath } from "./config";

/**
 * Domain database version management
 */
export class DomainVersion {
	private static readonly CURRENT_VERSION = 1;

	/**
	 * Read current domain version
	 */
	static read(): number {
		try {
			const versionPath = getDomainVersionPath();
			if (!existsSync(versionPath)) {
				return 0;
			}
			const content = readFileSync(versionPath, "utf-8");
			return Number.parseInt(content.trim(), 10);
		} catch (error) {
			console.error("Failed to read domain version:", error);
			return 0;
		}
	}

	/**
	 * Write domain version
	 */
	static write(version: number = DomainVersion.CURRENT_VERSION): boolean {
		try {
			const versionPath = getDomainVersionPath();
			writeFileSync(versionPath, String(version), "utf-8");
			return true;
		} catch (error) {
			console.error("Failed to write domain version:", error);
			return false;
		}
	}

	/**
	 * Get current version constant
	 */
	static getCurrentVersion(): number {
		return DomainVersion.CURRENT_VERSION;
	}

	/**
	 * Check if migration is needed
	 */
	static needsMigration(): boolean {
		return DomainVersion.read() < DomainVersion.CURRENT_VERSION;
	}
}
