/**
 * The content-addressed bucket behind cdn.superset.sh. Objects are named by
 * their sha256 and never overwritten: a name that exists is correct by
 * definition, so the only operations are "is it there" and "put it there".
 */
import { AwsClient } from "aws4fetch";

export interface Bucket {
	exists(key: string): Promise<boolean>;
	put(key: string, body: Uint8Array, contentType: string): Promise<void>;
	/** Public URL of a key, for verification after upload. */
	url(key: string): string;
}

export interface BucketEnv {
	CDN_R2_ACCESS_KEY_ID: string;
	CDN_R2_SECRET_ACCESS_KEY: string;
	CDN_R2_ENDPOINT: string;
	CDN_R2_BUCKET: string;
	CDN_URL: string;
}

const PREFIX = "sandbox";

export function bucketFromEnv(env: NodeJS.ProcessEnv = process.env): Bucket {
	const missing = [
		"CDN_R2_ACCESS_KEY_ID",
		"CDN_R2_SECRET_ACCESS_KEY",
		"CDN_R2_ENDPOINT",
		"CDN_R2_BUCKET",
		"CDN_URL",
	].filter((k) => !env[k]);
	if (missing.length) {
		throw new Error(`bucket credentials missing: ${missing.join(", ")}`);
	}
	const client = new AwsClient({
		accessKeyId: env.CDN_R2_ACCESS_KEY_ID as string,
		secretAccessKey: env.CDN_R2_SECRET_ACCESS_KEY as string,
		service: "s3",
		region: "auto",
	});
	const base = `${env.CDN_R2_ENDPOINT}/${env.CDN_R2_BUCKET}/${PREFIX}`;
	const publicBase = `${env.CDN_URL}/${PREFIX}`;
	return {
		async exists(key) {
			const response = await client.fetch(`${base}/${key}`, { method: "HEAD" });
			if (response.status === 200) return true;
			if (response.status === 404) return false;
			throw new Error(`HEAD ${key}: ${response.status}`);
		},
		async put(key, body, contentType) {
			const response = await client.fetch(`${base}/${key}`, {
				method: "PUT",
				body,
				headers: {
					"content-type": contentType,
					"cache-control": "public, max-age=31536000, immutable",
				},
			});
			if (!response.ok) throw new Error(`PUT ${key}: ${response.status}`);
		},
		url: (key) => `${publicBase}/${key}`,
	};
}

export function contentTypeFor(suffix: string): string {
	switch (suffix) {
		case ".deb":
			return "application/vnd.debian.binary-package";
		case ".tar.gz":
		case ".tgz":
			return "application/gzip";
		case ".tar.xz":
			return "application/x-xz";
		case ".ttf":
			return "font/ttf";
		case ".jpg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".zip":
			return "application/zip";
		default:
			return "application/octet-stream";
	}
}
