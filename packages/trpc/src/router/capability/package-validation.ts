import { createHash } from "node:crypto";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { strFromU8, unzipSync } from "fflate";
import { type CapabilityManifest, capabilityManifestSchema } from "./schema";

export const CAPABILITY_MANIFEST_FILENAME = "superset.capability.json";
export const MAX_CAPABILITY_ARCHIVE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_CAPABILITY_UNPACKED_SIZE_BYTES = 60 * 1024 * 1024;
export const MAX_CAPABILITY_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_CAPABILITY_FILE_COUNT = 500;
export const MAX_CAPABILITY_DISPLAY_MARKDOWN_CHARS = 40_000;
export const MAX_CAPABILITY_DISPLAY_SUMMARY_CHARS = 500;

export interface CapabilityPackageEntry {
	path: string;
	data: Uint8Array;
}

export interface NormalizedCapabilityPackageFile {
	path: string;
	sizeBytes: number;
}

export interface NormalizedCapabilityPackageDisplay
	extends Record<string, unknown> {
	summary?: string;
	overviewMarkdown?: string;
	extractedReadmeMarkdown?: string;
	intendedUsers: string[];
	useCases: string[];
}

export interface CapabilityValidationSummary extends Record<string, unknown> {
	manifestPath: string;
	fileCount: number;
	totalSizeBytes: number;
	files: NormalizedCapabilityPackageFile[];
	display: NormalizedCapabilityPackageDisplay;
	warnings: string[];
}

export interface ValidatedCapabilityPackage {
	archiveSha256: string;
	archiveSizeBytes: number;
	manifest: CapabilityManifest;
	manifestSha256: string;
	files: NormalizedCapabilityPackageFile[];
	entries: CapabilityPackageEntry[];
	validationSummary: CapabilityValidationSummary;
}

function badRequest(message: string): never {
	throw new TRPCError({ code: "BAD_REQUEST", message });
}

export function bufferFromBase64Data(fileData: string): Buffer {
	const base64Data = fileData.includes("base64,")
		? fileData.split("base64,")[1] || fileData
		: fileData;

	try {
		return Buffer.from(base64Data, "base64");
	} catch {
		badRequest("Package data is not valid base64.");
	}
}

function sha256(bytes: Uint8Array | Buffer | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function trimDisplayText(
	value: string | undefined,
	maxChars: number,
): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return trimmed.length > maxChars
		? `${trimmed.slice(0, maxChars).trimEnd()}\n\n...`
		: trimmed;
}

export function normalizeCapabilityPackagePath(rawPath: string): string {
	const trimmed = rawPath.trim();
	if (!trimmed) badRequest("Package contains an empty path.");
	if (trimmed.includes("\0")) {
		badRequest(`Package path contains a null byte: ${rawPath}`);
	}
	if (trimmed.includes("\\")) {
		badRequest(`Package path must use forward slashes: ${rawPath}`);
	}
	if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
		badRequest(`Package path must be relative: ${rawPath}`);
	}
	if (trimmed.split("/").includes("..")) {
		badRequest(`Package path escapes the archive root: ${rawPath}`);
	}

	const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
	if (
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../") ||
		normalized.includes("/../")
	) {
		badRequest(`Package path escapes the archive root: ${rawPath}`);
	}
	return normalized;
}

function decodeManifest(bytes: Uint8Array): CapabilityManifest {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(strFromU8(bytes));
	} catch {
		badRequest(`${CAPABILITY_MANIFEST_FILENAME} must be valid JSON.`);
	}

	const parsed = capabilityManifestSchema.safeParse(parsedJson);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		badRequest(
			firstIssue
				? `Invalid capability manifest: ${firstIssue.path.join(".") || "root"} ${firstIssue.message}`
				: "Invalid capability manifest.",
		);
	}
	return parsed.data;
}

function requireFile(
	filesByPath: Map<string, CapabilityPackageEntry>,
	filePath: string,
) {
	if (!filesByPath.has(filePath)) {
		badRequest(`Package is missing required file: ${filePath}`);
	}
}

function readTextEntry(
	entry: CapabilityPackageEntry | undefined,
	maxChars: number,
) {
	if (!entry) return undefined;
	try {
		return trimDisplayText(strFromU8(entry.data), maxChars);
	} catch {
		return undefined;
	}
}

function findRootReadme(filesByPath: Map<string, CapabilityPackageEntry>) {
	return [...filesByPath.values()].find((entry) =>
		/^readme\.mdx?$/i.test(entry.path),
	);
}

function extractCapabilityDisplay(
	manifest: CapabilityManifest,
	filesByPath: Map<string, CapabilityPackageEntry>,
): NormalizedCapabilityPackageDisplay {
	const readmeMarkdown = readTextEntry(
		findRootReadme(filesByPath),
		MAX_CAPABILITY_DISPLAY_MARKDOWN_CHARS,
	);
	const skillMarkdown =
		manifest.type === "skill"
			? readTextEntry(
					filesByPath.get(
						normalizeCapabilityPackagePath(
							path.posix.join(manifest.entry, manifest.skill.entryFile),
						),
					),
					MAX_CAPABILITY_DISPLAY_MARKDOWN_CHARS,
				)
			: undefined;

	return {
		summary: trimDisplayText(
			manifest.display.summary ?? manifest.description,
			MAX_CAPABILITY_DISPLAY_SUMMARY_CHARS,
		),
		overviewMarkdown: trimDisplayText(
			manifest.display.overviewMarkdown ?? readmeMarkdown ?? skillMarkdown,
			MAX_CAPABILITY_DISPLAY_MARKDOWN_CHARS,
		),
		extractedReadmeMarkdown: readmeMarkdown,
		intendedUsers: manifest.display.intendedUsers,
		useCases: manifest.display.useCases,
	};
}

function validateTypePayload(
	manifest: CapabilityManifest,
	filesByPath: Map<string, CapabilityPackageEntry>,
) {
	if (manifest.type === "skill") {
		const entryFile = normalizeCapabilityPackagePath(
			path.posix.join(manifest.entry, manifest.skill.entryFile),
		);
		requireFile(filesByPath, entryFile);
		return;
	}

	requireFile(
		filesByPath,
		normalizeCapabilityPackagePath(
			path.posix.join(manifest.entry, "package.json"),
		),
	);
}

export function validateCapabilityPackageEntries(args: {
	archiveSha256: string;
	archiveSizeBytes: number;
	entries: CapabilityPackageEntry[];
}): ValidatedCapabilityPackage {
	const seen = new Set<string>();
	const filesByPath = new Map<string, CapabilityPackageEntry>();
	let totalSizeBytes = 0;

	if (args.entries.length > MAX_CAPABILITY_FILE_COUNT) {
		badRequest(
			`Package has too many files. Maximum is ${MAX_CAPABILITY_FILE_COUNT}.`,
		);
	}

	for (const entry of args.entries) {
		if (entry.path.endsWith("/")) continue;

		const normalized = normalizeCapabilityPackagePath(entry.path);
		if (seen.has(normalized)) {
			badRequest(`Package contains duplicate normalized path: ${normalized}`);
		}
		seen.add(normalized);

		if (entry.data.byteLength > MAX_CAPABILITY_FILE_SIZE_BYTES) {
			badRequest(`Package file is too large: ${normalized}`);
		}
		totalSizeBytes += entry.data.byteLength;
		if (totalSizeBytes > MAX_CAPABILITY_UNPACKED_SIZE_BYTES) {
			badRequest("Package uncompressed size is too large.");
		}

		filesByPath.set(normalized, { path: normalized, data: entry.data });
	}

	const manifestEntry = filesByPath.get(CAPABILITY_MANIFEST_FILENAME);
	if (!manifestEntry) {
		badRequest(`Package must contain ${CAPABILITY_MANIFEST_FILENAME} at root.`);
	}

	const manifest = decodeManifest(manifestEntry.data);
	validateTypePayload(manifest, filesByPath);
	const display = extractCapabilityDisplay(manifest, filesByPath);

	const files = [...filesByPath.values()]
		.map((entry) => ({
			path: entry.path,
			sizeBytes: entry.data.byteLength,
		}))
		.sort((a, b) => a.path.localeCompare(b.path));

	return {
		archiveSha256: args.archiveSha256,
		archiveSizeBytes: args.archiveSizeBytes,
		manifest,
		manifestSha256: sha256(manifestEntry.data),
		files,
		entries: [...filesByPath.values()],
		validationSummary: {
			manifestPath: CAPABILITY_MANIFEST_FILENAME,
			fileCount: files.length,
			totalSizeBytes,
			files,
			display,
			warnings: [],
		},
	};
}

export function validateCapabilityZipPackage(
	fileData: string,
): ValidatedCapabilityPackage {
	const archiveBuffer = bufferFromBase64Data(fileData);
	if (archiveBuffer.byteLength > MAX_CAPABILITY_ARCHIVE_SIZE_BYTES) {
		badRequest("Package archive is too large.");
	}

	let unzipped: Record<string, Uint8Array>;
	try {
		unzipped = unzipSync(new Uint8Array(archiveBuffer));
	} catch {
		badRequest("Package archive must be a valid zip file.");
	}

	return validateCapabilityPackageEntries({
		archiveSha256: sha256(archiveBuffer),
		archiveSizeBytes: archiveBuffer.byteLength,
		entries: Object.entries(unzipped).map(([entryPath, data]) => ({
			path: entryPath,
			data,
		})),
	});
}
