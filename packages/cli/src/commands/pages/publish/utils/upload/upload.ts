import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import { MAX_PAGE_BYTES } from "@superset/shared/page-content-types";
import { lookup as lookupMimeType } from "mime-types";
import type { ApiClient } from "../../../../../lib/api-client";
import {
	type DirectoryAsset,
	videoCodecWarning,
} from "../collectDirectoryPublish";

const UPLOAD_CONCURRENCY = 8;
const MAX_PAGE_MB = MAX_PAGE_BYTES / 1024 / 1024;

export interface UploadedAssets {
	uploaded: number;
	reused: number;
	warnings: string[];
}

type Staged = {
	fileId: string;
	upload: { url: string; headers: Record<string, string> } | null;
};

/**
 * Sends the bytes to storage on the URL the API presigned. A null upload is
 * the server saying it already holds them, and is the only way nothing is
 * sent — so the return value is also the answer to "was this reused?".
 */
async function sendBytes({
	staged,
	bytes,
	label,
}: {
	staged: Staged;
	bytes: Buffer;
	label: string;
}): Promise<boolean> {
	if (!staged.upload) return false;
	const response = await fetch(staged.upload.url, {
		method: "PUT",
		headers: staged.upload.headers,
		body: bytes,
	});
	if (!response.ok) {
		throw new CLIError(`Uploading ${label} failed (${response.status})`);
	}
	return true;
}

/**
 * The page's document, sent to storage on the URL the API presigns; publish
 * records the version from the id that comes back. The bytes never ride in an
 * API request: its body limit is a fraction of what a page may be.
 */
export async function uploadDocument({
	api,
	bytes,
	filename,
}: {
	api: ApiClient;
	bytes: Buffer;
	filename: string;
}): Promise<{ fileId: string }> {
	if (bytes.length > MAX_PAGE_BYTES) {
		throw new CLIError(
			`File too large (${(bytes.length / 1024 / 1024).toFixed(2)} MB). Maximum is ${MAX_PAGE_MB} MB`,
			"Inlined data: URIs are usually why; put the images beside the page and publish the directory instead",
		);
	}

	const staged = await api.page.assets.upload.mutate({
		kind: "document",
		name: filename,
		contentType: "text/html",
		sizeBytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	});
	await sendBytes({ staged, bytes, label: filename });
	return { fileId: staged.fileId };
}

/**
 * Stages a directory's assets against the page, so the version published
 * next carries them from the moment it exists.
 *
 * Reuse is the server's call: it answers by content hash out of the page's
 * own lineage, so an unchanged asset costs one round trip and no bytes.
 * Assets are addressed by the path they hold in the document — the file
 * identity behind that path never reaches this side.
 */
export async function uploadAssets({
	api,
	assets,
	pageId,
}: {
	api: ApiClient;
	assets: DirectoryAsset[];
	pageId: string;
}): Promise<UploadedAssets> {
	const warnings: string[] = [];
	let uploaded = 0;
	let reused = 0;

	// Staging one asset costs a round trip to the API and, on a miss, a second
	// to storage. Serially that is minutes for a large directory, and each
	// asset is independent — only the bounded width keeps a big publish from
	// opening a connection per file.
	const queue = [...assets];
	const worker = async (): Promise<void> => {
		for (let asset = queue.shift(); asset; asset = queue.shift()) {
			const bytes = readFileSync(asset.filePath);
			const warning = videoCodecWarning(asset.path, bytes.subarray(0, 16));
			if (warning) warnings.push(warning);

			const staged = await api.page.assets.upload.mutate({
				pageId,
				path: asset.path,
				name: basename(asset.path),
				contentType: lookupMimeType(asset.path) || "application/octet-stream",
				sizeBytes: asset.sizeBytes,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			});
			if (await sendBytes({ staged, bytes, label: asset.path })) uploaded += 1;
			else reused += 1;
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(UPLOAD_CONCURRENCY, assets.length) }, worker),
	);

	return { uploaded, reused, warnings };
}
