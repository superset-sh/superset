import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	capabilityArtifactReference,
	normalizeCapabilityArtifactPathname,
} from "@superset/shared/capability-artifacts";
import { del, put } from "@vercel/blob";

const S3_SERVICE = "s3";
const AWS4_ALGORITHM = "AWS4-HMAC-SHA256";
const EMPTY_SHA256 =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
type FetchRequestBody = NonNullable<Parameters<typeof fetch>[1]>["body"];

export interface StoredCapabilityArtifact {
	url: string;
	pathname: string;
	cleanup: () => Promise<void>;
}

interface ObjectStorageConfig {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
}

export function capabilityArtifactPathname(args: {
	organizationId: string;
	slug: string;
	version: string;
	sha256: string;
}) {
	return normalizeCapabilityArtifactPathname(
		[
			"capability-packages",
			args.organizationId,
			args.slug,
			args.version,
			`${args.sha256}.zip`,
		].join("/"),
	);
}

function hasUsableVercelBlobToken() {
	const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
	return Boolean(token && !token.includes("fake"));
}

function canUseLocalArtifactStorage() {
	return (
		process.env.NODE_ENV === "development" &&
		process.env.SUPERSET_ONLINE_SERVICE !== "1" &&
		!hasUsableVercelBlobToken()
	);
}

function localArtifactRoot() {
	return join(
		process.env.SUPERSET_HOME_DIR ?? process.cwd(),
		"capability-artifacts",
	);
}

function localArtifactPath(pathname: string): string {
	return join(
		localArtifactRoot(),
		...normalizeCapabilityArtifactPathname(pathname).split("/"),
	);
}

function getObjectStorageConfig(): ObjectStorageConfig | null {
	const values = {
		endpoint: process.env.SUPERSET_OBJECT_STORAGE_ENDPOINT?.trim(),
		bucket: process.env.SUPERSET_OBJECT_STORAGE_BUCKET?.trim(),
		region: process.env.SUPERSET_OBJECT_STORAGE_REGION?.trim() || "us-east-1",
		accessKeyId: process.env.SUPERSET_OBJECT_STORAGE_ACCESS_KEY?.trim(),
		secretAccessKey: process.env.SUPERSET_OBJECT_STORAGE_SECRET_KEY?.trim(),
	};
	const provided = [
		values.endpoint,
		values.bucket,
		values.accessKeyId,
		values.secretAccessKey,
	].filter(Boolean).length;
	if (provided === 0) return null;

	const missing = Object.entries(values)
		.filter(([, value]) => !value)
		.map(([key]) => key);
	if (missing.length > 0) {
		throw new Error(
			`Capability artifact object storage is partially configured; missing ${missing.join(", ")}.`,
		);
	}

	return {
		endpoint: values.endpoint as string,
		bucket: values.bucket as string,
		region: values.region,
		accessKeyId: values.accessKeyId as string,
		secretAccessKey: values.secretAccessKey as string,
		forcePathStyle:
			process.env.SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE !== "0",
	};
}

function sha256Hex(data: Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
	return createHmac("sha256", key).update(data).digest();
}

function toAmzDate(date: Date): string {
	return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function rfc3986Encode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

function canonicalUri(pathname: string): string {
	return pathname.split("/").map(rfc3986Encode).join("/");
}

function canonicalQuery(url: URL): string {
	return [...url.searchParams.entries()]
		.map(([key, value]) => ({
			key: rfc3986Encode(key),
			value: rfc3986Encode(value),
		}))
		.sort((left, right) =>
			left.key === right.key
				? left.value.localeCompare(right.value)
				: left.key.localeCompare(right.key),
		)
		.map(({ key, value }) => `${key}=${value}`)
		.join("&");
}

function buildObjectUrl(config: ObjectStorageConfig, key: string): URL {
	const endpoint = new URL(config.endpoint);
	const basePath = endpoint.pathname.replace(/\/+$/, "");
	const encodedKey = normalizeCapabilityArtifactPathname(key)
		.split("/")
		.map(rfc3986Encode)
		.join("/");

	if (config.forcePathStyle) {
		endpoint.pathname = `${basePath}/${rfc3986Encode(config.bucket)}/${encodedKey}`;
		return endpoint;
	}

	endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
	endpoint.pathname = `${basePath}/${encodedKey}`;
	return endpoint;
}

function signS3Request(args: {
	config: ObjectStorageConfig;
	method: string;
	url: URL;
	payloadHash: string;
	contentType?: string;
	now?: Date;
}): Headers {
	const now = args.now ?? new Date();
	const amzDate = toAmzDate(now);
	const dateStamp = amzDate.slice(0, 8);
	const credentialScope = `${dateStamp}/${args.config.region}/${S3_SERVICE}/aws4_request`;
	const headers = new Map<string, string>([
		["host", args.url.host],
		["x-amz-content-sha256", args.payloadHash],
		["x-amz-date", amzDate],
	]);

	if (args.contentType) {
		headers.set("content-type", args.contentType);
	}

	const sortedHeaders = [...headers.entries()].sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const canonicalHeaders = sortedHeaders
		.map(([key, value]) => `${key}:${value.trim().replace(/\s+/g, " ")}`)
		.join("\n");
	const signedHeaders = sortedHeaders.map(([key]) => key).join(";");
	const canonicalRequest = [
		args.method,
		canonicalUri(args.url.pathname),
		canonicalQuery(args.url),
		canonicalHeaders,
		"",
		signedHeaders,
		args.payloadHash,
	].join("\n");
	const stringToSign = [
		AWS4_ALGORITHM,
		amzDate,
		credentialScope,
		sha256Hex(canonicalRequest),
	].join("\n");
	const signingKey = hmac(
		hmac(
			hmac(
				hmac(`AWS4${args.config.secretAccessKey}`, dateStamp),
				args.config.region,
			),
			S3_SERVICE,
		),
		"aws4_request",
	);
	const signature = createHmac("sha256", signingKey)
		.update(stringToSign)
		.digest("hex");
	const requestHeaders = new Headers();
	requestHeaders.set("x-amz-content-sha256", args.payloadHash);
	requestHeaders.set("x-amz-date", amzDate);
	if (args.contentType) {
		requestHeaders.set("content-type", args.contentType);
	}
	requestHeaders.set(
		"authorization",
		`${AWS4_ALGORITHM} Credential=${args.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
	);
	return requestHeaders;
}

async function s3Request(args: {
	method: "GET" | "PUT" | "DELETE";
	key: string;
	body?: Uint8Array;
	contentType?: string;
}): Promise<Response> {
	const config = getObjectStorageConfig();
	if (!config) {
		throw new Error("Capability artifact object storage is not configured.");
	}

	const url = buildObjectUrl(config, args.key);
	const payloadHash = args.body ? sha256Hex(args.body) : EMPTY_SHA256;
	const headers = signS3Request({
		config,
		method: args.method,
		url,
		payloadHash,
		contentType: args.contentType,
	});

	return fetch(url, {
		method: args.method,
		headers,
		body: args.body as FetchRequestBody,
	});
}

async function putObjectArtifact(args: {
	pathname: string;
	archiveBuffer: Buffer;
}): Promise<StoredCapabilityArtifact> {
	const pathname = normalizeCapabilityArtifactPathname(args.pathname);
	const response = await s3Request({
		method: "PUT",
		key: pathname,
		body: new Uint8Array(args.archiveBuffer),
		contentType: "application/zip",
	});
	if (!response.ok) {
		throw new Error(
			`Capability artifact object storage upload failed with HTTP ${response.status}.`,
		);
	}

	return {
		url: capabilityArtifactReference(pathname),
		pathname,
		cleanup: () => deleteObjectArtifact(pathname),
	};
}

async function deleteObjectArtifact(pathname: string): Promise<void> {
	const response = await s3Request({
		method: "DELETE",
		key: normalizeCapabilityArtifactPathname(pathname),
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(
			`Capability artifact object storage delete failed with HTTP ${response.status}.`,
		);
	}
}

async function readObjectArtifact(pathname: string): Promise<Buffer | null> {
	const response = await s3Request({
		method: "GET",
		key: normalizeCapabilityArtifactPathname(pathname),
	});
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(
			`Capability artifact object storage download failed with HTTP ${response.status}.`,
		);
	}
	return Buffer.from(await response.arrayBuffer());
}

async function storeLocalArtifact(args: {
	pathname: string;
	archiveBuffer: Buffer;
}): Promise<StoredCapabilityArtifact> {
	const pathname = normalizeCapabilityArtifactPathname(args.pathname);
	const filePath = localArtifactPath(pathname);
	await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
	await writeFile(filePath, args.archiveBuffer);
	return {
		url: capabilityArtifactReference(pathname),
		pathname,
		cleanup: () => unlink(filePath),
	};
}

async function readLocalArtifact(pathname: string): Promise<Buffer | null> {
	try {
		return await readFile(localArtifactPath(pathname));
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return null;
		}
		throw error;
	}
}

export async function readCapabilityArtifactReference(
	pathname: string,
): Promise<Buffer | null> {
	const normalized = normalizeCapabilityArtifactPathname(pathname);
	if (getObjectStorageConfig()) {
		return readObjectArtifact(normalized);
	}
	return readLocalArtifact(normalized);
}

export async function storeCapabilityArtifact(args: {
	pathname: string;
	archiveBuffer: Buffer;
}): Promise<StoredCapabilityArtifact> {
	if (getObjectStorageConfig()) {
		return putObjectArtifact(args);
	}

	if (hasUsableVercelBlobToken()) {
		const pathname = normalizeCapabilityArtifactPathname(args.pathname);
		const blob = await put(pathname, args.archiveBuffer, {
			access: "public",
			contentType: "application/zip",
		});
		return {
			url: blob.url,
			pathname: blob.pathname,
			cleanup: () => del(blob.url),
		};
	}

	if (canUseLocalArtifactStorage()) {
		return storeLocalArtifact(args);
	}

	throw new Error(
		"Capability artifact storage is not configured. Configure SUPERSET_OBJECT_STORAGE_* for online services or BLOB_READ_WRITE_TOKEN for hosted Blob storage.",
	);
}
