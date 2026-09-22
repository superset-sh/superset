import { afterEach, describe, expect, mock, test } from "bun:test";
import type { WebClient } from "@slack/web-api";
import { extractSlackImageAssets } from "./slack-image-assets";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function slack(size?: number) {
	return {
		files: {
			info: async () => ({
				file: {
					id: "F1",
					name: "image.png",
					mimetype: "image/png",
					url_private_download: "https://files.slack.com/test",
					size,
				},
			}),
		},
	} as unknown as WebClient;
}
function extract(size?: number, count = 1) {
	return extractSlackImageAssets({
		eventFiles: Array.from({ length: count }, (_, i) => ({ id: `F${i}` })),
		slack: slack(size),
		slackToken: "test",
	});
}
function setFetch(fn: () => Promise<Response>) {
	const fetchMock = mock(fn);
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

describe("Slack image limits", () => {
	test("rejects metadata over the per-image limit before download", async () => {
		const download = setFetch(async () => new Response());
		await expect(extract(5 * 1024 * 1024 + 1)).rejects.toMatchObject({
			code: "safety_limit_exceeded",
		});
		expect(download).not.toHaveBeenCalled();
	});
	test("rejects a large content length before reading the body", async () => {
		setFetch(
			async () =>
				new Response("", {
					headers: { "content-length": String(6 * 1024 * 1024) },
				}),
		);
		await expect(extract()).rejects.toMatchObject({
			code: "safety_limit_exceeded",
		});
	});
	test("cancels an oversized streamed body even when metadata understates its size", async () => {
		const cancel = mock(() => {});
		setFetch(
			async () =>
				new Response(
					new ReadableStream({
						pull(controller) {
							controller.enqueue(new Uint8Array(3 * 1024 * 1024));
						},
						cancel,
					}),
				),
		);
		await expect(extract(1)).rejects.toMatchObject({
			code: "safety_limit_exceeded",
		});
		expect(cancel).toHaveBeenCalledTimes(1);
	});
	test("accepts an image at the exact per-image boundary", async () => {
		const bytes = new Uint8Array(5 * 1024 * 1024);
		setFetch(
			async () =>
				new Response(bytes, { headers: { "content-type": "image/png" } }),
		);
		const images = await extract(bytes.length);
		expect(Buffer.from(images[0]?.base64Data ?? "", "base64").length).toBe(
			bytes.length,
		);
	});
	test("bounds total request size across individually valid images", async () => {
		const bytes = new Uint8Array(5 * 1024 * 1024);
		const download = setFetch(async () => new Response(bytes));
		await expect(extract(bytes.length, 5)).rejects.toMatchObject({
			code: "safety_limit_exceeded",
		});
		expect(download).toHaveBeenCalledTimes(4);
	});
});
