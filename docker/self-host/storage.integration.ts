import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { privateS3Bucket } from "./s3-bucket.js";

const file = process.env.STORAGE_TEST_ENV_FILE;
if (!file)
	throw new Error(
		"STORAGE_TEST_ENV_FILE must point to disposable test credentials",
	);
const configuration = Object.fromEntries(
	readFileSync(file, "utf8")
		.split(/\r?\n/)
		.filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
		.map((line) => {
			const equals = line.indexOf("=");
			return [line.slice(0, equals), line.slice(equals + 1)];
		}),
);
const ticketSecret = configuration.USERCONTENT_TOKEN_SECRET;
if (
	process.env.STORAGE_WORKER_PROOF === "1" &&
	(!ticketSecret || ticketSecret.length < 32)
)
	throw new Error(
		"Disposable Worker proof requires matching USERCONTENT_TOKEN_SECRET of at least 32 characters in STORAGE_TEST_ENV_FILE",
	);
const env = {
	...configuration,
	S3_ENDPOINT: "http://127.0.0.1:49300",
	S3_PRESIGN_ENDPOINT: "http://localhost:49300",
	S3_REGION: "garage",
	S3_BUCKET: "superset-private",
	S3_PUBLIC_BUCKET: "superset-public",
	S3_PUBLIC_URL: "http://superset-public.web.garage.localhost:49302",
};
mock.module("../../packages/trpc/src/env", () => ({ env }));
const { putObject, presignedPutUrl, deleteObjects } = await import(
	"../../packages/trpc/src/lib/r2"
);
const manifestKey = "pages/known/manifest.json";
const privateKey = "pages/known/versions/private/index.html";
const avatarKey = "user/proof/avatar/original";
const fileKey = "files/proof/original";

async function website(bucket: string, key: string) {
	return fetch(`http://127.0.0.1:49302/${key}`, {
		headers: { Host: `${bucket}.web.garage.localhost:49302` },
	});
}

test("Garage preserves private/public access, signed reads, and browser uploads", async () => {
	await putObject({
		key: manifestKey,
		body: JSON.stringify({ versions: { private: { key: privateKey } } }),
		contentType: "application/json",
		bucket: "private",
	});
	await putObject({
		key: privateKey,
		body: "private history",
		contentType: "text/html",
		bucket: "private",
	});
	await putObject({
		key: avatarKey,
		body: "public avatar",
		contentType: "image/png",
		bucket: "public",
	});
	expect((await website(env.S3_PUBLIC_BUCKET, avatarKey)).status).toBe(200);
	for (const key of [manifestKey, privateKey]) {
		expect((await website(env.S3_BUCKET, key)).status).toBe(404);
		expect((await website(env.S3_PUBLIC_BUCKET, key)).status).toBe(404);
	}
	const bucket = privateS3Bucket(env);
	expect(await (await bucket.get(privateKey))?.text()).toBe("private history");
	const ranged = await bucket.get(privateKey, {
		range: { offset: 0, length: 7 },
	});
	expect(await ranged?.text()).toBe("private");
	expect(ranged?.size).toBe(15);
	expect(ranged?.range).toEqual({ offset: 0, length: 7 });
	await putObject({
		key: "files/space and !/original",
		body: "encoded",
		contentType: "text/plain",
		bucket: "private",
	});
	expect(await (await bucket.get("files/space and !/original"))?.text()).toBe(
		"encoded",
	);
	const signed = await presignedPutUrl({
		key: fileKey,
		contentType: "text/plain",
		contentLength: 7,
	});
	for (const origin of [
		"null",
		"http://localhost:3000",
		"http://localhost:5173",
	]) {
		const response = await fetch(signed.url, {
			method: "OPTIONS",
			headers: {
				Origin: origin,
				"Access-Control-Request-Method": "PUT",
				"Access-Control-Request-Headers": "content-type",
			},
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe(origin);
		expect(response.headers.get("access-control-allow-methods")).toContain(
			"PUT",
		);
		expect(
			response.headers.get("access-control-allow-headers")?.toLowerCase(),
		).toContain("content-type");
	}
	const excluded = await fetch(signed.url, {
		method: "OPTIONS",
		headers: {
			Origin: "https://untrusted.example.test",
			"Access-Control-Request-Method": "PUT",
			"Access-Control-Request-Headers": "content-type",
		},
	});
	expect(excluded.headers.get("access-control-allow-origin")).toBeNull();
	const uploaded = await fetch(signed.url, {
		method: "PUT",
		headers: { ...signed.headers, Origin: "null" },
		body: "upload!",
	});
	expect(uploaded.status).toBe(200);
	expect(uploaded.headers.get("access-control-allow-origin")).toBe("null");
	expect(await (await bucket.get(fileKey))?.text()).toBe("upload!");
	expect((await website(env.S3_BUCKET, fileKey)).status).toBe(404);
	expect((await website(env.S3_PUBLIC_BUCKET, fileKey)).status).toBe(404);
	await deleteObjects([
		manifestKey,
		privateKey,
		fileKey,
		"files/space and !/original",
	]);
	await deleteObjects([avatarKey], { bucket: "public" });
});

if (process.env.STORAGE_WORKER_PROOF === "1") {
	test("upstream workerd serves only the shared public version without a ticket", async () => {
		const { signPageTicket } = await import(
			"../../packages/shared/src/usercontent/ticket"
		);
		const pageId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const manifest = `pages/${pageId}/manifest.json`;
		const publicKey = `pages/${pageId}/versions/1/index.html`;
		const privateKey = `pages/${pageId}/versions/2/index.html`;
		await putObject({
			key: manifest,
			body: JSON.stringify({
				v: 1,
				pageId,
				slug: "proof",
				visibility: "everyone",
				sharedVersion: 1,
				latestVersion: 2,
				versions: {
					"1": { key: publicKey, contentType: "text/html" },
					"2": { key: privateKey, contentType: "text/html" },
				},
			}),
			contentType: "application/json",
			bucket: "private",
		});
		await putObject({
			key: publicKey,
			body: "<html><head></head><body>public version</body></html>",
			contentType: "text/html",
			bucket: "private",
		});
		await putObject({
			key: privateKey,
			body: "<html><head></head><body>private version</body></html>",
			contentType: "text/html",
			bucket: "private",
		});
		const read = (path: string) =>
			fetch(`http://127.0.0.1:49487${path}`, {
				headers: { Host: `${pageId}.frame.usercontent.localhost:49487` },
				redirect: "manual",
			});
		const publicPage = await read("/");
		expect(publicPage.status).toBe(200);
		expect(await publicPage.text()).toContain("public version");
		expect((await read("/versions/2/")).status).toBe(302);
		const ticket = await signPageTicket(ticketSecret, {
			pageId,
			version: 2,
			exp: Math.floor(Date.now() / 1000) + 60,
		});
		const privatePage = await read(`/versions/2/~${ticket}/`);
		expect(privatePage.status).toBe(200);
		expect(await privatePage.text()).toContain("private version");
		for (const key of [manifest, publicKey, privateKey]) {
			expect((await website(env.S3_BUCKET, key)).status).toBe(404);
			expect((await website(env.S3_PUBLIC_BUCKET, key)).status).toBe(404);
		}
		await deleteObjects([manifest, publicKey, privateKey]);
	});
}

if (process.env.STORAGE_WORKER_PROOF === "1") {
	test("workerd denies anonymous files and serves ticketed byte ranges", async () => {
		const { signFileTicket } = await import(
			"../../packages/shared/src/usercontent/ticket"
		);
		const fileId = "ffffffff-1111-2222-3333-444444444444";
		const key = `files/${fileId}/original`;
		await putObject({
			key,
			body: "file content",
			contentType: "text/plain",
			bucket: "private",
		});
		const read = (ticket?: string, range?: string) =>
			fetch(
				`http://127.0.0.1:49487/files/${fileId}${ticket ? `?ticket=${ticket}` : ""}`,
				{
					headers: {
						Host: "media.usercontent.localhost:49487",
						...(range ? { Range: range } : {}),
					},
					redirect: "manual",
				},
			);
		expect((await read()).status).toBe(404);
		expect((await read("invalid")).status).toBe(404);
		const ticket = await signFileTicket(ticketSecret, {
			fileId,
			contentType: "text/plain",
			exp: Math.floor(Date.now() / 1000) + 60,
		});
		const whole = await read(ticket);
		expect(whole.status).toBe(200);
		expect(await whole.text()).toBe("file content");
		const ranged = await read(ticket, "bytes=0-3");
		expect(ranged.status).toBe(206);
		expect(ranged.headers.get("content-range")).toBe("bytes 0-3/12");
		expect(await ranged.text()).toBe("file");
		expect((await read(ticket, "bytes=999-1000")).status).toBe(416);
		expect((await website(env.S3_BUCKET, key)).status).toBe(404);
		expect((await website(env.S3_PUBLIC_BUCKET, key)).status).toBe(404);
		await deleteObjects([key]);
	});
}
