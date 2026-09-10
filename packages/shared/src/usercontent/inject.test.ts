import { describe, expect, test } from "bun:test";
import { injectScriptTag, injectStyleTag } from "./inject";

const CSS = "body{color:red}";
const LINK = `<style>${CSS}</style>`;

describe("injectStyleTag", () => {
	test("opens the head with the link", () => {
		expect(
			injectStyleTag("<html><head><title>x</title></head></html>", CSS),
		).toBe(`<html><head>${LINK}<title>x</title></head></html>`);
	});

	test("stays ahead of the page's own styles", () => {
		const html = "<head><style>body{background:#fff}</style></head>";
		const out = injectStyleTag(html, CSS);
		expect(out.indexOf(LINK)).toBeLessThan(
			out.indexOf("body{background:#fff}"),
		);
	});

	test("keeps attributes on the head tag", () => {
		expect(injectStyleTag('<head lang="en">x</head>', CSS)).toBe(
			`<head lang="en">${LINK}x</head>`,
		);
	});

	test("follows the doctype when there is no head", () => {
		expect(injectStyleTag("<!DOCTYPE html><p>hi</p>", CSS)).toBe(
			`<!DOCTYPE html>${LINK}<p>hi</p>`,
		);
	});

	test("is not fooled by a <header> element", () => {
		const html = "<header><style>p{color:red}</style></header>";
		expect(injectStyleTag(html, CSS)).toBe(`${LINK}${html}`);
	});

	test("follows a doctype that trails a newline", () => {
		expect(injectStyleTag("\n<!doctype html><p>hi</p>", CSS)).toBe(
			`\n<!doctype html>${LINK}<p>hi</p>`,
		);
	});

	test("goes first in a fragment", () => {
		expect(injectStyleTag("<p>hi</p>", CSS)).toBe(`${LINK}<p>hi</p>`);
	});

	test("skips a head written inside a comment", () => {
		const html = "<!-- <head> is where styles go --><head><p>hi</p></head>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<!-- <head> is where styles go --><head>${LINK}<p>hi</p></head>`,
		);
	});

	test("skips a head written inside a script", () => {
		const html = '<script>d.write("<head>")</script><head lang="en">x</head>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<script>d.write("<head>")</script><head lang="en">${LINK}x</head>`,
		);
	});

	test("skips a head written inside a style", () => {
		const html = "<style>/* <head> */</style><head>x</head>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<style>/* <head> */</style><head>${LINK}x</head>`,
		);
	});

	test("reads past a > inside a quoted head attribute", () => {
		const html = '<head data-value=">"><p>hi</p></head>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<head data-value=">">${LINK}<p>hi</p></head>`,
		);
	});

	test("falls back when the only head is inside a comment", () => {
		const html = "<!DOCTYPE html><!-- <head> --><p>hi</p>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<!DOCTYPE html>${LINK}<!-- <head> --><p>hi</p>`,
		);
	});

	test("skips a head written inside another element's attribute", () => {
		const html =
			'<div data-hint="write your styles in <head>"></div><head>x</head>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<div data-hint="write your styles in <head>"></div><head>${LINK}x</head>`,
		);
	});

	test("falls back when the only head is inside an attribute", () => {
		const html = '<!DOCTYPE html><div title="a <head> tag">hi</div>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<!DOCTYPE html>${LINK}<div title="a <head> tag">hi</div>`,
		);
	});

	test("does not mistake header for head", () => {
		const html = "<header>top</header><head>x</head>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<header>top</header><head>${LINK}x</head>`,
		);
	});

	test("scans a document with many script blocks and no head", () => {
		const html = `<!DOCTYPE html>${"<script>var a = 1;</script>".repeat(2000)}<p>hi</p>`;
		expect(injectStyleTag(html, CSS)).toBe(
			`<!DOCTYPE html>${LINK}${"<script>var a = 1;</script>".repeat(2000)}<p>hi</p>`,
		);
	});
});

describe("injectScriptTag", () => {
	test("closes the body with the script", () => {
		expect(injectScriptTag("<body><p>hi</p></body>", "/r.js")).toBe(
			'<body><p>hi</p><script src="/r.js"></script></body>',
		);
	});

	test("appends when there is no body", () => {
		expect(injectScriptTag("<p>hi</p>", "/r.js")).toBe(
			'<p>hi</p><script src="/r.js"></script>',
		);
	});
});
