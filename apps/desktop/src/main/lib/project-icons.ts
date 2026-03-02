import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { SUPERSET_HOME_DIR } from "./app-environment";

export const PROJECT_ICONS_DIR = join(SUPERSET_HOME_DIR, "project-icons");

/** Max icon file size: 512KB */
const MAX_ICON_SIZE = 512 * 1024;

/**
 * Ensures the project icons directory exists.
 * Call at startup.
 */
export function ensureProjectIconsDir(): void {
	if (!existsSync(PROJECT_ICONS_DIR)) {
		mkdirSync(PROJECT_ICONS_DIR, { recursive: true });
	}
}

/**
 * Finds the icon file for a project by globbing for any extension.
 * Returns the full path or null if no icon exists.
 */
export function getProjectIconPath(projectId: string): string | null {
	if (!existsSync(PROJECT_ICONS_DIR)) return null;

	const files = readdirSync(PROJECT_ICONS_DIR);
	const match = files.find((f) => {
		const name = f.substring(0, f.lastIndexOf("."));
		return name === projectId;
	});

	return match ? join(PROJECT_ICONS_DIR, match) : null;
}

/**
 * Removes any existing icon file for a project (any extension).
 */
function removeExistingIcon(projectId: string): void {
	const existing = getProjectIconPath(projectId);
	if (existing) {
		unlinkSync(existing);
	}
}

/**
 * Returns the protocol URL for a project icon.
 */
export function getProjectIconProtocolUrl(projectId: string): string {
	return `superset-icon://projects/${projectId}`;
}

/**
 * Saves an icon file for a project from a local file path.
 * Copies the file to PROJECT_ICONS_DIR/{projectId}.{ext}.
 * Returns the protocol URL.
 */
export async function saveProjectIconFromFile({
	projectId,
	sourcePath,
}: {
	projectId: string;
	sourcePath: string;
}): Promise<string> {
	ensureProjectIconsDir();
	removeExistingIcon(projectId);

	const ext = extname(sourcePath) || ".png";
	const destPath = join(PROJECT_ICONS_DIR, `${projectId}${ext}`);
	await copyFile(sourcePath, destPath);

	return getProjectIconProtocolUrl(projectId);
}

/**
 * Saves an icon file for a project from a base64 data URL.
 * Decodes and writes the file to PROJECT_ICONS_DIR/{projectId}.{ext}.
 * Returns the protocol URL.
 */
export async function saveProjectIconFromDataUrl({
	projectId,
	dataUrl,
}: {
	projectId: string;
	dataUrl: string;
}): Promise<string> {
	ensureProjectIconsDir();
	removeExistingIcon(projectId);

	// Parse data URL: data:image/png;base64,<data>
	const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
	if (!match) {
		throw new Error("Invalid data URL format");
	}

	const ext = match[1] === "jpeg" ? "jpg" : match[1];
	const buffer = Buffer.from(match[2], "base64");

	if (buffer.length > MAX_ICON_SIZE) {
		throw new Error(
			`Icon file too large (${Math.round(buffer.length / 1024)}KB). Maximum is ${MAX_ICON_SIZE / 1024}KB.`,
		);
	}

	const destPath = join(PROJECT_ICONS_DIR, `${projectId}.${ext}`);
	await writeFile(destPath, buffer);

	return getProjectIconProtocolUrl(projectId);
}

/**
 * Saves an icon from a Buffer with explicit extension.
 * Returns the protocol URL.
 */
export async function saveProjectIconFromBuffer({
	projectId,
	buffer,
	ext,
}: {
	projectId: string;
	buffer: Buffer;
	ext: string;
}): Promise<string> {
	ensureProjectIconsDir();
	removeExistingIcon(projectId);

	if (buffer.length > MAX_ICON_SIZE) {
		throw new Error(
			`Icon file too large (${Math.round(buffer.length / 1024)}KB). Maximum is ${MAX_ICON_SIZE / 1024}KB.`,
		);
	}

	const destPath = join(PROJECT_ICONS_DIR, `${projectId}.${ext}`);
	await writeFile(destPath, buffer);

	return getProjectIconProtocolUrl(projectId);
}

/**
 * Removes the icon file for a project from disk.
 */
export function deleteProjectIcon(projectId: string): void {
	removeExistingIcon(projectId);
}
