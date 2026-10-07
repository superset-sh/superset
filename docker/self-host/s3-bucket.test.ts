import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { privateS3Bucket } from "./s3-bucket.js";

const env = {
	S3_ENDPOINT: "https://storage.example.test",
	S3_BUCKET: "private-bucket",
	S3_ACCESS_KEY: "dummy-access",
	S3_SECRET_KEY: "dummy-secret",
};
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
	fetchMock = spyOn(globalThis, "fetch");
	fetchMock.mockImplementation(async () => new Response("fixture"));
});
afterEach(() => fetchMock.mockRestore());

test.each([
	".",
	"..",
	"../public/avatar",
	"pages/../avatar",
	"a/./b",
])("private S3 rejects dot segments before a request: %s", async (key) => {
	await expect(privateS3Bucket(env).get(key)).rejects.toThrow(
		"Storage paths must not contain dot segments",
	);
	expect(fetchMock).not.toHaveBeenCalled();
});
test("private S3 rejects a bucket with dot segments", async () => {
	await expect(
		privateS3Bucket({ ...env, S3_BUCKET: "../public" }).get("avatar"),
	).rejects.toThrow("Storage paths must not contain dot segments");
	expect(fetchMock).not.toHaveBeenCalled();
});
test("private S3 preserves legitimate dots and literal percent escapes", async () => {
	const object = await privateS3Bucket(env).get("files/a.b/%2e%2e/content.txt");
	expect(await object?.text()).toBe("fixture");
	expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
		"https://storage.example.test/private-bucket/files/a.b/%252e%252e/content.txt",
	);
});
