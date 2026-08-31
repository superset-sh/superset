import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../../../../../lib/api-client";
import { uploadAssets } from "./uploadAssets";

const dir = mkdtempSync(join(tmpdir(), "upload-assets-"));
const write = (name: string, content: string) => {
	const filePath = join(dir, name);
	writeFileSync(filePath, content);
	return {
		path: name,
		filePath,
		sizeBytes: Buffer.byteLength(content),
	};
};
const sha = (content: string) =>
	createHash("sha256").update(content).digest("hex");

// A real PUT target instead of a mocked fetch; 500s when asked to.
const server = Bun.serve({
	port: 0,
	fetch: (req) =>
		new Response(null, {
			status: new URL(req.url).pathname === "/fail" ? 500 : 200,
		}),
});
afterAll(() => server.stop(true));

function fakeApi({
	previous,
	failUpload = false,
	resolveThrows = false,
}: {
	previous?: { path: string; fileId: string; sha256: string }[];
	failUpload?: boolean;
	resolveThrows?: boolean;
}) {
	const createdUploads: string[] = [];
	const completed: string[] = [];
	const api = {
		page: {
			resolveByEntryPath: {
				query: async () => {
					if (resolveThrows) throw new Error("offline");
					return previous
						? { latestVersionId: "v-latest", latestVersion: 1 }
						: null;
				},
			},
		},
		file: {
			list: {
				query: async () =>
					(previous ?? []).map((item) => ({
						path: item.path,
						file: { id: item.fileId, sha256: item.sha256 },
					})),
			},
			createUpload: {
				mutate: async (input: { name: string }) => {
					createdUploads.push(input.name);
					return {
						id: `new-${input.name}`,
						uploadUrl: `http://localhost:${server.port}/${failUpload ? "fail" : "ok"}`,
						headers: {},
					};
				},
			},
			complete: {
				mutate: async ({ id }: { id: string }) => {
					completed.push(id);
					return {};
				},
			},
		},
	} as unknown as ApiClient;
	return { api, createdUploads, completed };
}

describe("uploadAssets", () => {
	test("republish reuses an unchanged asset without uploading", async () => {
		const asset = write("style.css", "body{}");
		const { api, createdUploads } = fakeApi({
			previous: [{ path: "style.css", fileId: "f-old", sha256: sha("body{}") }],
		});
		const result = await uploadAssets({
			api,
			assets: [asset],
			target: { pageId: "p1" },
		});
		expect(result.reused).toBe(1);
		expect(result.published).toEqual([{ path: "style.css", fileId: "f-old" }]);
		expect(createdUploads).toEqual([]);
	});

	test("a changed asset re-uploads and completes", async () => {
		const asset = write("app.js", "new()");
		const { api, createdUploads, completed } = fakeApi({
			previous: [{ path: "app.js", fileId: "f-old", sha256: sha("old()") }],
		});
		const result = await uploadAssets({
			api,
			assets: [asset],
			target: { pageId: "p1" },
		});
		expect(result.reused).toBe(0);
		expect(createdUploads).toEqual(["app.js"]);
		expect(completed).toEqual(["new-app.js"]);
		expect(result.published[0]?.fileId).toBe("new-app.js");
	});

	test("an asset absent from the LATEST version re-uploads even if an older version had it — reuse is one version deep by design", async () => {
		const asset = write("logo.png", "png-bytes");
		const { api, createdUploads } = fakeApi({ previous: [] });
		const result = await uploadAssets({
			api,
			assets: [asset],
			target: { pageId: "p1" },
		});
		expect(result.reused).toBe(0);
		expect(createdUploads).toEqual(["logo.png"]);
	});

	test("a failed reuse lookup degrades to uploading everything", async () => {
		const asset = write("data.json", "{}");
		const { api, createdUploads } = fakeApi({ resolveThrows: true });
		const result = await uploadAssets({
			api,
			assets: [asset],
			target: { pageId: "p1" },
		});
		expect(result.reused).toBe(0);
		expect(createdUploads).toEqual(["data.json"]);
	});

	test("a rejected PUT surfaces the path and status", async () => {
		const asset = write("big.bin", "xxxx");
		const { api } = fakeApi({ failUpload: true });
		await expect(
			uploadAssets({ api, assets: [asset], target: null }),
		).rejects.toThrow("Uploading big.bin failed (500)");
	});
});
