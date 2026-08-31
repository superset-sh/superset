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

export interface UploadedAssets {
	published: { path: string; fileId: string }[];
	reused: number;
	warnings: string[];
}

/**
 * Uploads a directory's assets, reusing unchanged files from the previous
 * version by sha256. The lookup is best effort: a failure just means every
 * asset uploads.
 */
export async function uploadAssets({
	api,
	assets,
	target,
}: {
	api: ApiClient;
	assets: DirectoryAsset[];
	target:
		| { pageId: string }
		| { workspaceId: string; entryPath: string }
		| null;
}): Promise<UploadedAssets> {
	let previous: Map<string, { fileId: string; sha256: string }> | null = null;
	if (assets.length > 0 && target) {
		try {
			const resolved = await api.page.resolveByEntryPath.query(target);
			if (resolved?.latestVersionId) {
				const listed = await api.file.list.query({
					parentKind: "page_version",
					parentId: resolved.latestVersionId,
				});
				previous = new Map();
				for (const item of listed) {
					if (item.path) {
						previous.set(item.path, {
							fileId: item.file.id,
							sha256: item.file.sha256,
						});
					}
				}
			}
		} catch {
			previous = null;
		}
	}

	const warnings: string[] = [];
	const published: { path: string; fileId: string }[] = [];
	let reused = 0;
	for (const asset of assets) {
		const bytes = readFileSync(asset.filePath);
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const warning = videoCodecWarning(asset.path, bytes.subarray(0, 16));
		if (warning) warnings.push(warning);

		const match = previous?.get(asset.path);
		if (match && match.sha256 === sha256) {
			published.push({ path: asset.path, fileId: match.fileId });
			reused += 1;
			continue;
		}

		const created = await api.file.createUpload.mutate({
			name: basename(asset.path),
			contentType: lookupMimeType(asset.path) || "application/octet-stream",
			sizeBytes: asset.sizeBytes,
			sha256,
		});
		const response = await fetch(created.uploadUrl, {
			method: "PUT",
			headers: created.headers,
			body: bytes,
		});
		if (!response.ok) {
			throw new CLIError(`Uploading ${asset.path} failed (${response.status})`);
		}
		await api.file.complete.mutate({ id: created.id });
		published.push({ path: asset.path, fileId: created.id });
	}
	return { published, reused, warnings };
}
