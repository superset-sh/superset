import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	isPageAssetContentType,
	PAGE_ASSET_CONTENT_TYPES,
} from "@superset/shared/page-content-types";
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

// Uploads create `files` rows with no parent: the version they attach to does
// not exist until the HTML is final, which needs these URLs.
export async function uploadAssets(
	api: ApiClient,
	assets: AssetReference[],
): Promise<UploadedAsset[]> {
	// All types checked before any upload starts, so an unsupported reference
	// cannot fail the publish after earlier assets have already been stored.
	const typed = assets.map((asset) => ({
		asset,
		filename: basename(asset.absolutePath),
		contentType: mimeTypes.lookup(basename(asset.absolutePath)) || null,
	}));

	const unsupported = typed.filter(
		(entry) => !entry.contentType || !isPageAssetContentType(entry.contentType),
	);
	if (unsupported.length > 0) {
		throw new CLIError(
			`Cannot publish ${unsupported.length === 1 ? "an asset" : "assets"} of this type: ${unsupported
				.map(
					(entry) =>
						`${entry.asset.reference} (${entry.contentType ?? "unknown"})`,
				)
				.join(", ")}`,
			`Pages support ${PAGE_ASSET_CONTENT_TYPES.join(", ")}. Inline anything else into the HTML.`,
		);
	}

	const results: UploadedAsset[] = new Array(typed.length);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const index = next++;
			const entry = typed[index];
			if (!entry) return;
			const { asset, filename, contentType } = entry;
			if (!contentType) return;

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
		Array.from({ length: Math.min(UPLOAD_CONCURRENCY, typed.length) }, () =>
			worker(),
		),
	);

	return results;
}
