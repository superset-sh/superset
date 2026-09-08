import { describe, expect, test } from "bun:test";
import { injectScriptTag, injectStylesheetLink } from "./inject";

const HREF = "/_superset/theme.css";
const LINK = `<link rel="stylesheet" href="${HREF}">`;

describe("injectStylesheetLink", () => {
	test("opens the head with the link", () => {
		expect(
			injectStylesheetLink("<html><head><title>x</title></head></html>", HREF),
		).toBe(`<html><head>${LINK}<title>x</title></head></html>`);
	});

	test("stays ahead of the page's own styles", () => {
		const html = "<head><style>body{background:#fff}</style></head>";
		const out = injectStylesheetLink(html, HREF);
		expect(out.indexOf(LINK)).toBeLessThan(out.indexOf("<style>"));
	});

	test("keeps attributes on the head tag", () => {
		expect(injectStylesheetLink('<head lang="en">x</head>', HREF)).toBe(
			`<head lang="en">${LINK}x</head>`,
		);
	});

	test("follows the doctype when there is no head", () => {
		expect(injectStylesheetLink("<!DOCTYPE html><p>hi</p>", HREF)).toBe(
			`<!DOCTYPE html>${LINK}<p>hi</p>`,
		);
	});

	test("is not fooled by a <header> element", () => {
		const html = "<header><style>p{color:red}</style></header>";
		expect(injectStylesheetLink(html, HREF)).toBe(`${LINK}${html}`);
	});

	test("follows a doctype that trails a newline", () => {
		expect(injectStylesheetLink("\n<!doctype html><p>hi</p>", HREF)).toBe(
			`\n<!doctype html>${LINK}<p>hi</p>`,
		);
	});

	test("goes first in a fragment", () => {
		expect(injectStylesheetLink("<p>hi</p>", HREF)).toBe(`${LINK}<p>hi</p>`);
	});

	test("skips a head written inside a comment", () => {
		const html = "<!-- <head> is where styles go --><head><p>hi</p></head>";
		expect(injectStylesheetLink(html, HREF)).toBe(
			`<!-- <head> is where styles go --><head>${LINK}<p>hi</p></head>`,
		);
	});

	test("skips a head written inside a script", () => {
		const html = '<script>d.write("<head>")</script><head lang="en">x</head>';
		expect(injectStylesheetLink(html, HREF)).toBe(
			`<script>d.write("<head>")</script><head lang="en">${LINK}x</head>`,
		);
	});

	test("skips a head written inside a style", () => {
		const html = "<style>/* <head> */</style><head>x</head>";
		expect(injectStylesheetLink(html, HREF)).toBe(
			`<style>/* <head> */</style><head>${LINK}x</head>`,
		);
	});

	test("reads past a > inside a quoted head attribute", () => {
		const html = '<head data-value=">"><p>hi</p></head>';
		expect(injectStylesheetLink(html, HREF)).toBe(
			`<head data-value=">">${LINK}<p>hi</p></head>`,
		);
	});

	test("falls back when the only head is inside a comment", () => {
		const html = "<!DOCTYPE html><!-- <head> --><p>hi</p>";
		expect(injectStylesheetLink(html, HREF)).toBe(
			`<!DOCTYPE html>${LINK}<!-- <head> --><p>hi</p>`,
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
