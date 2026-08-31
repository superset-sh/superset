import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectDirectoryPublish,
	videoCodecWarning,
} from "./collectDirectoryPublish";

function site(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "pages-dir-"));
	for (const [path, content] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, content);
	}
	return dir;
}

describe("collectDirectoryPublish", () => {
	test("finds the entry and every asset at its relative path", () => {
		const dir = site({
			"index.html": "<html></html>",
			"demo.mp4": "x",
			"img/chart.png": "y",
			".hidden": "z",
			"node_modules/pkg/a.js": "n",
		});
		const result = collectDirectoryPublish(dir);
		expect(result.entryFilePath).toBe(join(dir, "index.html"));
		expect(result.assets.map((a) => a.path)).toEqual([
			"demo.mp4",
			"img/chart.png",
		]);
	});

	test("refuses a directory without index.html", () => {
		const dir = site({ "main.html": "<html></html>" });
		expect(() => collectDirectoryPublish(dir)).toThrow(/index\.html/);
	});
});

describe("videoCodecWarning", () => {
	const ftyp = (brand: string) =>
		new Uint8Array([
			0,
			0,
			0,
			24,
			0x66,
			0x74,
			0x79,
			0x70,
			...brand
				.padEnd(4)
				.split("")
				.map((c) => c.charCodeAt(0)),
		]);

	test("warns on containers browsers refuse", () => {
		expect(videoCodecWarning("clip.mov", new Uint8Array())).not.toBeNull();
		expect(videoCodecWarning("clip.mkv", new Uint8Array())).not.toBeNull();
	});

	test("warns on hevc-branded mp4, passes h264-style brands", () => {
		expect(videoCodecWarning("clip.mp4", ftyp("hvc1"))).not.toBeNull();
		expect(videoCodecWarning("clip.mp4", ftyp("isom"))).toBeNull();
		expect(videoCodecWarning("clip.webm", new Uint8Array())).toBeNull();
	});
});
