import {
	CopyObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

/**
 * Which bucket an operation addresses. Named rather than defaulted: the two
 * differ in who can read them, and a public write that silently landed in the
 * private bucket would surface as a broken image rather than an error.
 */
export type Bucket = "private" | "public";

function bucketName(bucket: Bucket): string {
	return bucket === "public" ? env.R2_PUBLIC_BUCKET : env.R2_PRIVATE_BUCKET;
}

let client: S3Client | null = null;

function s3(): S3Client {
	if (!client) {
		client = new S3Client({
			region: "auto",
			endpoint: env.R2_ENDPOINT,
			credentials: {
				accessKeyId: env.R2_ACCESS_KEY_ID,
				secretAccessKey: env.R2_SECRET_ACCESS_KEY,
			},
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
	bucket,
	cacheControl,
}: {
	key: string;
	body: Uint8Array | string;
	contentType: string;
	bucket: Bucket;
	cacheControl?: string;
}): Promise<void> {
	await s3().send(
		new PutObjectCommand({
			CacheControl: cacheControl,
			Bucket: bucketName(bucket),
			Key: key,
			Body: body,
			ContentType: contentType,
		}),
	);
}

/**
 * A server-side copy within the private bucket: the bytes never leave
 * storage. The stored type is replaced, not carried over, so what the copy
 * serves as is decided here rather than by whoever uploaded the source.
 */
export async function copyObject({
	sourceKey,
	key,
	contentType,
}: {
	sourceKey: string;
	key: string;
	contentType: string;
}): Promise<void> {
	const bucket = bucketName("private");
	await s3().send(
		new CopyObjectCommand({
			Bucket: bucket,
			CopySource: `${bucket}/${sourceKey}`,
			Key: key,
			ContentType: contentType,
			MetadataDirective: "REPLACE",
		}),
	);
}

/** The object's response, streaming, or null when it does not exist. */
export async function getObject(
	key: string,
	{ range, bucket = "private" }: { range?: string; bucket?: Bucket } = {},
): Promise<Response | null> {
	try {
		const result = await s3().send(
			new GetObjectCommand({
				Bucket: bucketName(bucket),
				Key: key,
				Range: range,
			}),
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
	{ bucket = "private" }: { bucket?: Bucket } = {},
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
	try {
		const result = await s3().send(
			new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }),
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

export async function objectExists(
	key: string,
	{ bucket = "private" }: { bucket?: Bucket } = {},
): Promise<boolean> {
	return (await headObject(key, { bucket })) !== null;
}

/** Deletes are idempotent and batched; a missing key is not an error. */
export async function deleteObjects(
	keys: readonly string[],
	{ bucket = "private" }: { bucket?: Bucket } = {},
): Promise<void> {
	for (let i = 0; i < keys.length; i += 1000) {
		const batch = keys.slice(i, i + 1000);
		const result = await s3().send(
			new DeleteObjectsCommand({
				Bucket: bucketName(bucket),
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
		new GetObjectCommand({ Bucket: bucketName("private"), Key: key }),
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
			Bucket: bucketName("private"),
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
