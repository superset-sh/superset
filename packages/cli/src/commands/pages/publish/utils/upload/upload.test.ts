import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../../../../../lib/api-client";
import { uploadAssets } from "./upload";

const dir = mkdtempSync(join(tmpdir(), "upload-assets-"));
const write = (name: string, content: string) => {
	const filePath = join(dir, name);
	writeFileSync(filePath, content);
	return { path: name, filePath, sizeBytes: Buffer.byteLength(content) };
};

// A real PUT target instead of a mocked fetch; 500s when asked to.
const server = Bun.serve({
	port: 0,
	fetch: (req) =>
		new Response(null, {
			status: new URL(req.url).pathname === "/fail" ? 500 : 200,
		}),
});
afterAll(() => server.stop(true));

/**
 * Reuse is the server's answer now, so the fake states it directly rather
 * than reproducing a hash comparison the client no longer performs.
 */
function fakeApi({
	reusePaths = [],
	failUpload = false,
}: {
	reusePaths?: string[];
	failUpload?: boolean;
}) {
	const staged: { pageId: string; path: string; sha256: string }[] = [];
	const api = {
		page: {
			assets: {
				upload: {
					mutate: async (input: {
						pageId: string;
						path: string;
						sha256: string;
					}) => {
						staged.push(input);
						if (reusePaths.includes(input.path)) {
							return { fileId: `file-${input.path}`, upload: null };
						}
						return {
							fileId: `file-${input.path}`,
							upload: {
								url: `http://localhost:${server.port}/${
									failUpload ? "fail" : "ok"
								}`,
								headers: {},
							},
						};
					},
				},
			},
		},
	} as unknown as ApiClient;
	return { api, staged };
}

describe("uploadAssets", () => {
	test("an asset the server already has is staged but never sent", async () => {
		const { api, staged } = fakeApi({ reusePaths: ["style.css"] });
		const result = await uploadAssets({
			api,
			assets: [write("style.css", "body{}")],
			pageId: "p1",
		});
		expect(result).toMatchObject({ uploaded: 0, reused: 1 });
		expect(staged.map((item) => item.path)).toEqual(["style.css"]);
	});

	test("an asset the server does not have is uploaded", async () => {
		const { api, staged } = fakeApi({});
		const result = await uploadAssets({
			api,
			assets: [write("app.js", "new()")],
			pageId: "p1",
		});
		expect(result).toMatchObject({ uploaded: 1, reused: 0 });
		expect(staged[0]?.pageId).toBe("p1");
	});

	test("the content hash is what the server is given to decide reuse on", async () => {
		const { api, staged } = fakeApi({});
		await uploadAssets({
			api,
			assets: [write("a.txt", "same"), write("b.txt", "same")],
			pageId: "p1",
		});
		expect(staged[0]?.sha256).toBe(staged[1]?.sha256);
	});

	test("a rejected PUT surfaces the path and status", async () => {
		const { api } = fakeApi({ failUpload: true });
		await expect(
			uploadAssets({
				api,
				assets: [write("big.bin", "xxxx")],
				pageId: "p1",
			}),
		).rejects.toThrow("Uploading big.bin failed (500)");
	});
});
