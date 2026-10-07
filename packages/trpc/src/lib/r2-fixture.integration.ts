import { mock } from "bun:test";

const paths: string[] = [];
const deletes: string[] = [];
const server = Bun.serve({
	port: 0,
	fetch(request) {
		const path = new URL(request.url).pathname;
		if (request.method === "PUT") paths.push(path);
		if (request.method === "DELETE") deletes.push(path);
		return new Response(null, { status: 200 });
	},
});
const endpoint = server.url.origin;
const env = {
	R2_ENDPOINT: endpoint,
	R2_ACCESS_KEY_ID: "cloud-key",
	R2_SECRET_ACCESS_KEY: "cloud-secret",
	R2_PRIVATE_BUCKET: "cloud-private",
	R2_PUBLIC_BUCKET: "cloud-public",
	...(process.argv[2]?.startsWith("s3")
		? {
				S3_ENDPOINT: endpoint,
				S3_PRESIGN_ENDPOINT: "https://upload.example.test",
				S3_ACCESS_KEY: "s3-key",
				S3_SECRET_KEY: "s3-secret",
				S3_REGION: "garage",
				S3_BUCKET: "private",
				S3_PUBLIC_BUCKET: "public",
			}
		: {}),
	...JSON.parse(process.argv[3] || "{}"),
};
mock.module("../env", () => ({ env }));
let active = 0;
let maximum = 0;
let completed = 0;
let claimed = 0;
let releaseActive: () => void = () => {};
let started: () => void = () => {};
let firstFailed: () => void = () => {};
const released = new Promise<void>((resolve) => {
	releaseActive = resolve;
});
const fourStarted = new Promise<void>((resolve) => {
	started = resolve;
});
const failed = new Promise<void>((resolve) => {
	firstFailed = resolve;
});
if (process.argv[2]?.startsWith("s3-concurrency")) {
	const sdk = await import("@aws-sdk/client-s3");
	mock.module("@aws-sdk/client-s3", () => ({
		...sdk,
		S3Client: class {
			async send() {
				const index = claimed++;
				maximum = Math.max(maximum, ++active);
				if (claimed === 4) started();
				if (process.argv[2] === "s3-concurrency-failure") {
					if (index === 0) {
						await Promise.resolve();
						active--;
						firstFailed();
						throw Error("Owned deletion failure");
					}
					await released;
				}
				await Promise.resolve();
				active--;
				completed++;
				return {};
			}
		},
	}));
}
try {
	const storage = await import("./r2");
	if (process.argv[2] === "s3-concurrency-failure") {
		let settled = false;
		const deletion = storage
			.deleteObjects(
				Array.from({ length: 9 }, (_, index) => `files/${index}/original`),
			)
			.catch((error) => {
				settled = true;
				return error.message;
			});
		await fourStarted;
		await failed;
		await Promise.resolve();
		await Promise.resolve();
		const settledWhileActive = settled;
		releaseActive();
		const error = await deletion;
		console.log(
			JSON.stringify({
				maximum,
				claimed,
				completed,
				error,
				settledWhileActive,
			}),
		);
		server.stop(true);
		process.exit(0);
	}
	if (process.argv[2] === "s3-concurrency") {
		await storage.deleteObjects(
			Array.from({ length: 9 }, (_, index) => `files/${index}/original`),
		);
		console.log(JSON.stringify({ maximum, completed }));
		server.stop(true);
		process.exit(0);
	}
	await storage.putObject({
		key: "pages/known/manifest.json",
		body: "private history",
		contentType: "application/json",
		bucket: "private",
	});
	await storage.putObject({
		key: "user/a/avatar/x/original",
		body: "avatar",
		contentType: "image/png",
		bucket: "public",
	});
	const put = await storage.presignedPutUrl({
		key: "files/a/original",
		contentType: "image/png",
		contentLength: 6,
	});
	const get = await storage.presignedGetUrl("files/a/original");
	if (process.argv[2] === "s3")
		await storage.deleteObjects(["files/a/original", "files/b/original"]);
	console.log(JSON.stringify({ paths, deletes, put, get, endpoint }));
} catch (error) {
	console.log(
		JSON.stringify({
			paths,
			deletes,
			error: error instanceof Error ? error.message : String(error),
		}),
	);
} finally {
	server.stop(true);
}
