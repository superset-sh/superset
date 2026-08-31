import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

export function storageEnv(): {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
} {
	const {
		CLOUDFLARE_ACCOUNT_ID,
		R2_ACCESS_KEY_ID,
		R2_SECRET_ACCESS_KEY,
		R2_PRIVATE_BUCKET,
	} = env;
	if (
		!CLOUDFLARE_ACCOUNT_ID ||
		!R2_ACCESS_KEY_ID ||
		!R2_SECRET_ACCESS_KEY ||
		!R2_PRIVATE_BUCKET
	) {
		throw new Error("R2 storage is not configured");
	}
	return {
		accountId: CLOUDFLARE_ACCOUNT_ID,
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY,
		bucket: R2_PRIVATE_BUCKET,
	};
}

let client: S3Client | null = null;

function s3(): S3Client {
	if (!client) {
		const { accountId, accessKeyId, secretAccessKey } = storageEnv();
		client = new S3Client({
			region: "auto",
			endpoint:
				env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`,
			credentials: { accessKeyId, secretAccessKey },
			// Path-style keeps emulators working and R2 accepts it.
			forcePathStyle: true,
			// R2 rejects the SDK's default CRC32 request checksums; Cloudflare's
			// docs prescribe checksums only where the API requires them.
			requestChecksumCalculation: "WHEN_REQUIRED",
			responseChecksumValidation: "WHEN_REQUIRED",
		});
	}
	return client;
}

function bucket(): string {
	return storageEnv().bucket;
}

function isMissing(error: unknown): boolean {
	const candidate = error as {
		name?: string;
		$metadata?: { httpStatusCode?: number };
	};
	return (
		candidate?.name === "NoSuchKey" ||
		candidate?.name === "NotFound" ||
		candidate?.$metadata?.httpStatusCode === 404
	);
}

export async function putObject({
	key,
	body,
	contentType,
}: {
	key: string;
	body: Uint8Array | string;
	contentType: string;
}): Promise<void> {
	await s3().send(
		new PutObjectCommand({
			Bucket: bucket(),
			Key: key,
			Body: body,
			ContentType: contentType,
		}),
	);
}

/** The object's response, streaming, or null when it does not exist. */
export async function getObject(
	key: string,
	{ range }: { range?: string } = {},
): Promise<Response | null> {
	try {
		const result = await s3().send(
			new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range }),
		);
		if (!result.Body) return null;
		return new Response(result.Body.transformToWebStream(), {
			status: result.ContentRange ? 206 : 200,
			headers: {
				...(result.ContentType ? { "Content-Type": result.ContentType } : {}),
				...(result.ContentRange
					? { "Content-Range": result.ContentRange }
					: {}),
			},
		});
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

/** Size and stored content type, or null when the object does not exist. */
export async function headObject(
	key: string,
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
	try {
		const result = await s3().send(
			new HeadObjectCommand({ Bucket: bucket(), Key: key }),
		);
		return {
			sizeBytes: result.ContentLength ?? 0,
			contentType: result.ContentType ?? null,
		};
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

export async function objectExists(key: string): Promise<boolean> {
	return (await headObject(key)) !== null;
}

/** Deletes are idempotent and batched; a missing key is not an error. */
export async function deleteObjects(keys: readonly string[]): Promise<void> {
	for (let i = 0; i < keys.length; i += 1000) {
		const batch = keys.slice(i, i + 1000);
		const result = await s3().send(
			new DeleteObjectsCommand({
				Bucket: bucket(),
				Delete: {
					Objects: batch.map((key) => ({ Key: key })),
					Quiet: true,
				},
			}),
		);
		const failed = (result.Errors ?? []).filter(
			(entry) => entry.Code !== "NoSuchKey",
		);
		if (failed.length > 0) {
			throw new Error(
				`R2 delete failed for ${failed.length} object(s), first: ${failed[0]?.Key} (${failed[0]?.Code})`,
			);
		}
	}
}

export async function presignedGetUrl(
	key: string,
	expiresInSeconds = 60 * 60,
): Promise<string> {
	return getSignedUrl(
		s3(),
		new GetObjectCommand({ Bucket: bucket(), Key: key }),
		{ expiresIn: expiresInSeconds },
	);
}

/**
 * A presigned PUT for a direct browser or main-process upload. The signature
 * covers the content type and length, so the client must send exactly what
 * `createUpload` was told — the first size gate; `complete` is the second.
 */
export async function presignedPutUrl({
	key,
	contentType,
	contentLength,
	expiresInSeconds = 15 * 60,
}: {
	key: string;
	contentType: string;
	contentLength: number;
	expiresInSeconds?: number;
}): Promise<{ url: string; headers: Record<string, string> }> {
	const url = await getSignedUrl(
		s3(),
		new PutObjectCommand({
			Bucket: bucket(),
			Key: key,
			ContentType: contentType,
			ContentLength: contentLength,
		}),
		{
			expiresIn: expiresInSeconds,
			signableHeaders: new Set(["content-type", "content-length"]),
		},
	);
	return { url, headers: { "Content-Type": contentType } };
}
