import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import { lookup as lookupMimeType } from "mime-types";
import type { ApiClient } from "../../../../../lib/api-client";
import {
	type DirectoryAsset,
	videoCodecWarning,
} from "../collectDirectoryPublish";

const UPLOAD_CONCURRENCY = 8;

export interface UploadedAssets {
	uploaded: number;
	reused: number;
	warnings: string[];
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
			if (staged.reused) {
				reused += 1;
				continue;
			}

			const response = await fetch(staged.uploadUrl, {
				method: "PUT",
				headers: staged.headers,
				body: bytes,
			});
			if (!response.ok) {
				throw new CLIError(
					`Uploading ${asset.path} failed (${response.status})`,
				);
			}
			uploaded += 1;
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(UPLOAD_CONCURRENCY, assets.length) }, worker),
	);

	return { uploaded, reused, warnings };
}
