import { describe, expect, test } from "bun:test";
import { publishResult } from "./publishResult";

const PAGE = {
	id: "p1",
	title: "Q3 Report",
	version: 3,
	url: "https://app.example/page/q3-report",
};

describe("publishResult", () => {
	test("default response: title, version, url — nothing else", () => {
		const { data, message } = publishResult({
			page: PAGE,
			assets: { published: [], reused: 0, warnings: [] },
			externalPath: null,
			watching: false,
			watchNote: null,
		});
		expect(message).toBe(`Published "Q3 Report" v3\n${PAGE.url}`);
		expect(data.assets).toEqual([]);
		expect(data.watching).toBe(false);
		expect(data.id).toBe("p1");
	});

	test("directory publish: notes in fixed order — assets, warnings, external, watch", () => {
		const { data, message } = publishResult({
			page: PAGE,
			assets: {
				published: [
					{ path: "a.css", fileId: "f1" },
					{ path: "demo.mov", fileId: "f2" },
				],
				reused: 1,
				warnings: ["demo.mov may not play in every browser"],
			},
			externalPath: "~external/report/index.html",
			watching: true,
			watchNote: "Watching for comments — they will be sent to this session",
		});
		expect(message.split("\n")).toEqual([
			'Published "Q3 Report" v3',
			PAGE.url,
			"2 assets (1 unchanged, not re-uploaded)",
			"demo.mov may not play in every browser",
			'Outside the workspace, so this page is keyed as "~external/report/index.html"',
			"Watching for comments — they will be sent to this session",
		]);
		expect(data.watching).toBe(true);
		expect(data.assets).toHaveLength(2);
	});

	test("one asset, none reused: singular wording, no reuse suffix", () => {
		const { message } = publishResult({
			page: PAGE,
			assets: {
				published: [{ path: "a.css", fileId: "f1" }],
				reused: 0,
				warnings: [],
			},
			externalPath: null,
			watching: false,
			watchNote: null,
		});
		expect(message).toContain("1 asset");
		expect(message).not.toContain("unchanged");
	});
});
