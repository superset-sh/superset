import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const GH_BINARY_NAME = process.platform === "win32" ? "gh.exe" : "gh";

let cachedBundledGhPath: string | null | undefined;

function getBundledGhRelativePath(): string {
	return join(
		"bin",
		"gh",
		`${process.platform}-${process.arch}`,
		GH_BINARY_NAME,
	);
}

function getBundledGhCandidates(): string[] {
	const relativePath = getBundledGhRelativePath();
	const candidates = new Set<string>();

	if (typeof process.resourcesPath === "string" && process.resourcesPath) {
		candidates.add(join(process.resourcesPath, relativePath));
	}

	// Local development and test fallbacks.
	candidates.add(join(process.cwd(), "dist", "resources", relativePath));
	candidates.add(join(process.cwd(), "src", "resources", relativePath));
	candidates.add(
		join(process.cwd(), "apps", "desktop", "dist", "resources", relativePath),
	);
	candidates.add(
		join(process.cwd(), "apps", "desktop", "src", "resources", relativePath),
	);

	return [...candidates];
}

export function getBundledGhPath(): string | null {
	if (cachedBundledGhPath !== undefined) {
		return cachedBundledGhPath;
	}

	for (const candidate of getBundledGhCandidates()) {
		if (existsSync(candidate)) {
			cachedBundledGhPath = candidate;
			return candidate;
		}
	}

	cachedBundledGhPath = null;
	return null;
}

export function getBundledGhBinDir(): string | null {
	const path = getBundledGhPath();
	return path ? dirname(path) : null;
}

export function clearBundledGhPathCache(): void {
	cachedBundledGhPath = undefined;
}
