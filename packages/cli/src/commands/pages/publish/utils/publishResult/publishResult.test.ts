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
			path: "report.html",
			assets: { uploaded: 0, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: false,
			watching: false,
			watchNote: null,
			openNote: null,
		});
		expect(message).toBe(`Published "Q3 Report" v3\n${PAGE.url}`);
		expect(data.assets).toEqual({ uploaded: 0, reused: 0 });
		expect(data.watching).toBe(false);
		expect(data.id).toBe("p1");
	});

	test("directory publish: notes in fixed order — assets, warnings, external, watch", () => {
		const { data, message } = publishResult({
			page: PAGE,
			path: "report.html",
			assets: {
				uploaded: 1,
				reused: 1,
				warnings: ["demo.mov may not play in every browser"],
			},
			externalPath: "~external/report/index.html",
			unanchored: false,
			watching: true,
			watchNote: "Watching for comments — they will be sent to this session",
			openNote: "Could not open the page: no display",
		});
		expect(message.split("\n")).toEqual([
			'Published "Q3 Report" v3',
			PAGE.url,
			"2 assets (1 unchanged, not re-uploaded)",
			"demo.mov may not play in every browser",
			'Outside the workspace, so this page is keyed as "~external/report/index.html"',
			"Watching for comments — they will be sent to this session",
			"Could not open the page: no display",
		]);
		expect(data.watching).toBe(true);
		expect(data.assets).toEqual({ uploaded: 1, reused: 1 });
		expect(data.openNote).toBe("Could not open the page: no display");
	});

	test("open/watch failures land in data, not just the message", () => {
		const { data } = publishResult({
			page: PAGE,
			path: "report.html",
			assets: { uploaded: 0, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: false,
			watching: false,
			watchNote: "Not watching for comments: could not reach the host",
			openNote: null,
		});
		expect(data.watchNote).toBe(
			"Not watching for comments: could not reach the host",
		);
		expect(data.openNote).toBeUndefined();
	});

	test("unanchored publish: says how to reach this page again", () => {
		const { data, message } = publishResult({
			page: PAGE,
			path: "reports/q3.html",
			assets: { uploaded: 0, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: true,
			watching: false,
			watchNote: null,
			openNote: null,
		});
		expect(message.split("\n")).toEqual([
			'Published "Q3 Report" v3',
			PAGE.url,
			"No workspace, so the next publish of this file would create a second page",
			"To add a version instead: superset pages publish reports/q3.html --page p1",
		]);
		expect(data.unanchored).toBe(true);
		expect(data.id).toBe("p1");
	});

	test("unanchored publish: the command is in data, not only in the message", () => {
		const { data } = publishResult({
			page: PAGE,
			path: "reports/q3.html",
			assets: { uploaded: 0, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: true,
			watching: false,
			watchNote: null,
			openNote: null,
		});
		expect(data.republish).toBe(
			"superset pages publish reports/q3.html --page p1",
		);
	});

	test("unanchored publish: a path with spaces stays runnable", () => {
		const { data } = publishResult({
			page: PAGE,
			path: "my reports/q3.html",
			assets: { uploaded: 0, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: true,
			watching: false,
			watchNote: null,
			openNote: null,
		});
		expect(data.republish).toBe(
			'superset pages publish "my reports/q3.html" --page p1',
		);
	});

	test("anchored publish says nothing about --page", () => {
		const { data, message } = publishResult({
			page: PAGE,
			path: "report.html",
			assets: { uploaded: 0, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: false,
			watching: false,
			watchNote: null,
			openNote: null,
		});
		expect(message).not.toContain("--page");
		expect(data.republish).toBeUndefined();
	});

	test("one asset, none reused: singular wording, no reuse suffix", () => {
		const { message } = publishResult({
			page: PAGE,
			path: "report.html",
			assets: { uploaded: 1, reused: 0, warnings: [] },
			externalPath: null,
			unanchored: false,
			watching: false,
			watchNote: null,
			openNote: null,
		});
		expect(message).toContain("1 asset");
		expect(message).not.toContain("unchanged");
	});
});
