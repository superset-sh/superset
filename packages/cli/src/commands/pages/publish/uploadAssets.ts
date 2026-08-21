import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import mimeTypes from "mime-types";
import type { ApiClient } from "../../../lib/api-client";
import type { AssetReference } from "./assets";

const UPLOAD_CONCURRENCY = 3;

export interface UploadedAsset {
	reference: string;
	fileId: string;
	url: string;
	reused: boolean;
}

/**
 * Upload a page's assets, a few at a time.
 *
 * These become `files` rows with no parent — the page version they attach to
 * does not exist yet, and cannot, because its HTML is not final until these
 * URLs come back. Files uploaded for a publish that then fails are collected
 * by the orphan sweep, which is why an unattached file is a normal state.
 */
export async function uploadAssets(
	api: ApiClient,
	assets: AssetReference[],
): Promise<UploadedAsset[]> {
	const results: UploadedAsset[] = new Array(assets.length);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const index = next++;
			const asset = assets[index];
			if (!asset) return;

			const filename = basename(asset.absolutePath);
			const contentType = mimeTypes.lookup(filename);
			if (!contentType) {
				throw new CLIError(
					`Could not determine the media type of ${asset.reference}`,
					"Use a recognizable file extension (.png, .jpg, .gif, .svg)",
				);
			}

			const bytes = readFileSync(asset.absolutePath);
			const uploaded = await api.file.upload.mutate({
				content: bytes.toString("base64"),
				contentType,
				filename,
			});

			results[index] = {
				reference: asset.reference,
				fileId: uploaded.id,
				url: uploaded.url,
				reused: uploaded.reused,
			};
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(UPLOAD_CONCURRENCY, assets.length) }, () =>
			worker(),
		),
	);

	return results;
}
