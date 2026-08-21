import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAssetReferences, rewriteAssetReferences } from "./assets";

let dir: string;
let htmlPath: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "pages-assets-"));
	htmlPath = join(dir, "index.html");
	writeFileSync(join(dir, "logo.png"), "png-bytes");
	writeFileSync(join(dir, "hero.jpg"), "jpg-bytes");
	writeFileSync(join(dir, "hero@2x.jpg"), "jpg-bytes-2x");
	writeFileSync(join(dir, "styles.css"), "css");
	writeFileSync(join(dir, "bg.gif"), "gif-bytes");
});

const refs = (html: string) =>
	collectAssetReferences(html, htmlPath)
		.map((asset) => asset.reference)
		.sort();

describe("collectAssetReferences", () => {
	test("finds relative references that resolve to real files", () => {
		expect(refs(`<img src="./logo.png"><link href="styles.css">`)).toEqual([
			"./logo.png",
			"styles.css",
		]);
	});

	test("ignores references that already resolve without us", () => {
		const html = `
			<img src="https://cdn.example.com/a.png">
			<img src="//cdn.example.com/b.png">
			<img src="data:image/png;base64,AAAA">
			<a href="#section">jump</a>
			<a href="mailto:hi@example.com">mail</a>`;
		expect(refs(html)).toEqual([]);
	});

	test("ignores a relative path with no file behind it", () => {
		// Leaving it alone beats turning it into a dead attachment link.
		expect(refs(`<img src="./missing.png">`)).toEqual([]);
	});

	test("strips a query string when resolving, keeps it in the reference", () => {
		expect(refs(`<img src="./logo.png?v=2">`)).toEqual(["./logo.png?v=2"]);
	});

	test("finds every entry of a srcset", () => {
		expect(refs(`<img srcset="hero.jpg 1x, hero@2x.jpg 2x">`)).toEqual([
			"hero.jpg",
			"hero@2x.jpg",
		]);
	});

	test("finds url() in a style block and in an inline style", () => {
		const html = `
			<style>body { background: url('bg.gif'); }</style>
			<div style="background: url(logo.png)"></div>`;
		expect(refs(html)).toEqual(["bg.gif", "logo.png"]);
	});

	test("deduplicates a reference used twice", () => {
		expect(refs(`<img src="./logo.png"><img src="./logo.png">`)).toEqual([
			"./logo.png",
		]);
	});

	test("resolves the file to an absolute path on disk", () => {
		const [asset] = collectAssetReferences(`<img src="./logo.png">`, htmlPath);
		expect(asset?.absolutePath).toBe(join(dir, "logo.png"));
	});
});

describe("rewriteAssetReferences", () => {
	const urls = (entries: Record<string, string>) =>
		new Map(Object.entries(entries));

	test("points a reference at its uploaded URL", () => {
		const out = rewriteAssetReferences(
			`<img src="./logo.png">`,
			htmlPath,
			urls({ "./logo.png": "https://blob.example.com/logo-x1.png" }),
		);
		expect(out).toContain('src="https://blob.example.com/logo-x1.png"');
		expect(out).not.toContain("./logo.png");
	});

	test("leaves absolute URLs untouched", () => {
		const html = `<img src="https://cdn.example.com/a.png">`;
		expect(rewriteAssetReferences(html, htmlPath, urls({}))).toContain(
			"https://cdn.example.com/a.png",
		);
	});

	test("rewrites srcset entries and preserves their descriptors", () => {
		const out = rewriteAssetReferences(
			`<img srcset="hero.jpg 1x, hero@2x.jpg 2x">`,
			htmlPath,
			urls({
				"hero.jpg": "https://b.example.com/1.jpg",
				"hero@2x.jpg": "https://b.example.com/2.jpg",
			}),
		);
		expect(out).toContain(
			'srcset="https://b.example.com/1.jpg 1x, https://b.example.com/2.jpg 2x"',
		);
	});

	test("rewrites url() inside a style block", () => {
		const out = rewriteAssetReferences(
			`<style>body { background: url('bg.gif'); }</style>`,
			htmlPath,
			urls({ "bg.gif": "https://b.example.com/bg.gif" }),
		);
		expect(out).toContain("url('https://b.example.com/bg.gif')");
	});

	test("leaves a reference alone when it has no uploaded URL", () => {
		const out = rewriteAssetReferences(
			`<img src="./logo.png">`,
			htmlPath,
			urls({}),
		);
		expect(out).toContain('src="./logo.png"');
	});

	test("does not touch the same path written in body text", () => {
		// Rewriting by string substitution would corrupt this; parsing does not.
		const out = rewriteAssetReferences(
			`<p>edit ./logo.png to change it</p><img src="./logo.png">`,
			htmlPath,
			urls({ "./logo.png": "https://b.example.com/logo.png" }),
		);
		expect(out).toContain("<p>edit ./logo.png to change it</p>");
		expect(out).toContain('src="https://b.example.com/logo.png"');
	});
});
