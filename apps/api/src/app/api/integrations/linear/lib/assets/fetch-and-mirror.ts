import { createHash } from "node:crypto";
import { extname } from "node:path";
import { db } from "@superset/db/client";
import { taskAssets } from "@superset/db/schema";
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

const MAX_ASSET_BYTES = 20 * 1024 * 1024;

function buildSourceHash(url: string): string {
	return createHash("sha256").update(url).digest("hex");
}

function extensionFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const extension = extname(parsed.pathname).toLowerCase();
		if (extension) return extension;
	} catch {
		// ignore and fallback
	}
	return ".bin";
}

function extensionFromMimeType(mimeType: string | null): string | null {
	if (!mimeType) return null;
	const clean = mimeType.split(";")[0]?.trim().toLowerCase();
	switch (clean) {
		case "image/png":
			return ".png";
		case "image/jpeg":
			return ".jpg";
		case "image/webp":
			return ".webp";
		case "image/gif":
			return ".gif";
		case "application/pdf":
			return ".pdf";
		default:
			return null;
	}
}

interface MirrorLinearAssetOptions {
	organizationId: string;
	taskId: string;
	sourceUrl: string;
	sourceKind: string;
	linearAccessToken?: string;
}

interface MirroredAsset {
	sourceUrl: string;
	blobUrl: string;
	sourceHash: string;
	mimeType: string | null;
	sizeBytes: number;
}

export async function mirrorLinearAsset(
	options: MirrorLinearAssetOptions,
): Promise<MirroredAsset | null> {
	const sourceHash = buildSourceHash(options.sourceUrl);

	const existing = await db.query.taskAssets.findFirst({
		where: and(
			eq(taskAssets.organizationId, options.organizationId),
			eq(taskAssets.taskId, options.taskId),
			eq(taskAssets.sourceHash, sourceHash),
		),
	});

	if (existing) {
		await db
			.update(taskAssets)
			.set({
				sourceKind: options.sourceKind,
				lastSyncedAt: new Date(),
			})
			.where(eq(taskAssets.id, existing.id));

		return {
			sourceUrl: existing.sourceUrl,
			blobUrl: existing.blobUrl,
			sourceHash: existing.sourceHash,
			mimeType: existing.mimeType,
			sizeBytes: existing.sizeBytes ?? 0,
		};
	}

	const source = new URL(options.sourceUrl);
	const response = await fetch(options.sourceUrl, {
		headers:
			source.host === "uploads.linear.app" && options.linearAccessToken
				? { Authorization: `Bearer ${options.linearAccessToken}` }
				: undefined,
	});
	if (!response.ok) {
		console.warn(
			`[linear/assets] Failed to fetch ${options.sourceUrl}: ${response.status}`,
		);
		return null;
	}

	const contentLengthHeader = response.headers.get("content-length");
	const expectedSize = contentLengthHeader ? Number(contentLengthHeader) : null;
	if (expectedSize && expectedSize > MAX_ASSET_BYTES) {
		console.warn(
			`[linear/assets] Skipping oversized asset ${options.sourceUrl} (${expectedSize} bytes)`,
		);
		return null;
	}

	const mimeType = response.headers.get("content-type");
	const arrayBuffer = await response.arrayBuffer();
	const sizeBytes = arrayBuffer.byteLength;
	if (sizeBytes === 0 || sizeBytes > MAX_ASSET_BYTES) {
		console.warn(
			`[linear/assets] Skipping asset with invalid size ${options.sourceUrl} (${sizeBytes} bytes)`,
		);
		return null;
	}

	const extension =
		extensionFromMimeType(mimeType) ?? extensionFromUrl(options.sourceUrl);
	const blobPath = `integrations/linear/${options.organizationId}/${options.taskId}/${sourceHash}${extension}`;

	const blob = await put(blobPath, arrayBuffer, {
		access: "public",
		...(mimeType ? { contentType: mimeType } : {}),
	});

	const values = {
		organizationId: options.organizationId,
		taskId: options.taskId,
		externalProvider: "linear" as const,
		sourceKind: options.sourceKind,
		sourceUrl: options.sourceUrl,
		sourceHash,
		blobUrl: blob.url,
		mimeType,
		sizeBytes,
		lastSyncedAt: new Date(),
	};

	await db
		.insert(taskAssets)
		.values(values)
		.onConflictDoUpdate({
			target: [
				taskAssets.organizationId,
				taskAssets.taskId,
				taskAssets.sourceHash,
			],
			set: {
				sourceKind: values.sourceKind,
				sourceUrl: values.sourceUrl,
				blobUrl: values.blobUrl,
				mimeType: values.mimeType,
				sizeBytes: values.sizeBytes,
				lastSyncedAt: values.lastSyncedAt,
				updatedAt: new Date(),
			},
		});

	return {
		sourceUrl: values.sourceUrl,
		blobUrl: values.blobUrl,
		sourceHash,
		mimeType,
		sizeBytes,
	};
}
