import { afterEach, beforeEach, expect, test } from "bun:test";
import { htmlEnvTransformPlugin } from "./helpers";

const storageVariables = ["S3_PRESIGN_ENDPOINT", "S3_ENDPOINT"] as const;
const initial = Object.fromEntries(
	storageVariables.map((name) => [name, process.env[name]]),
);
beforeEach(() => {
	for (const name of storageVariables) delete process.env[name];
});
afterEach(() => {
	for (const name of storageVariables) {
		if (initial[name] === undefined) delete process.env[name];
		else process.env[name] = initial[name];
	}
});
function transform() {
	const plugin = htmlEnvTransformPlugin();
	const handler = plugin.transformIndexHtml;
	if (typeof handler !== "function") throw new Error("Missing HTML transform");
	return handler.call({} as never, "%CONNECT_SRC_ORIGINS%", {} as never);
}
test("desktop upload CSP admits the external signing origin", () => {
	process.env.S3_PRESIGN_ENDPOINT = "https://uploads.example.test/s3";
	expect(transform()).toContain("https://uploads.example.test");
	expect(transform()).not.toContain("https://uploads.example.test/s3");
});
test("desktop upload CSP admits localhost signing origin for local Garage", () => {
	process.env.S3_PRESIGN_ENDPOINT = "http://localhost:3900";
	expect(transform()).toContain("http://localhost:3900");
});
test("desktop upload CSP rejects endpoints with credentials", () => {
	process.env.S3_PRESIGN_ENDPOINT =
		"https://user:password@uploads.example.test";
	expect(transform).toThrow();
});
test("desktop upload CSP rejects non-HTTP endpoints", () => {
	process.env.S3_PRESIGN_ENDPOINT = "file:///tmp/storage";
	expect(transform).toThrow();
});
test("desktop upload CSP falls back to the storage endpoint", () => {
	process.env.S3_ENDPOINT = "https://storage.example.test/s3";
	expect(transform()).toContain("https://storage.example.test");
	expect(transform()).not.toContain("https://storage.example.test/s3");
});
test("desktop upload CSP prefers the signing endpoint", () => {
	process.env.S3_ENDPOINT = "https://storage.example.test";
	process.env.S3_PRESIGN_ENDPOINT = "https://uploads.example.test";
	expect(transform()).toContain("https://uploads.example.test");
	expect(transform()).not.toContain("https://storage.example.test");
});
test("desktop upload CSP keeps its policy when storage endpoints are unset", () => {
	const r2Endpoint = process.env.R2_ENDPOINT;
	process.env.R2_ENDPOINT = "https://existing-storage.example.test";
	try {
		expect(transform()).toContain("https://existing-storage.example.test");
		expect(transform()).not.toContain("https://uploads.example.test");
	} finally {
		if (r2Endpoint === undefined) delete process.env.R2_ENDPOINT;
		else process.env.R2_ENDPOINT = r2Endpoint;
	}
});
for (const name of storageVariables) {
	test.each([
		"//uploads.example.test",
		"https://",
		"https://invalid host.example.test",
		"file:///tmp/storage",
		"https://user:password@uploads.example.test",
	])(`desktop upload CSP identifies invalid ${name}: %s`, (endpoint) => {
		process.env[name] = endpoint;
		let message: string | undefined;
		try {
			transform();
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			message = error.message;
		}
		expect(message).toBe(`${name} must be an HTTP(S) URL without credentials`);
	});
}
