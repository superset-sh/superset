import { describe, expect, test } from "bun:test";
import { fileResponsePolicy, pageAssetResponsePolicy } from "./file-policy";

describe("fileResponsePolicy", () => {
	test("scriptable documents always download", () => {
		for (const type of [
			"text/html",
			"text/html; charset=utf-8",
			"application/xhtml+xml",
			"application/xml",
		]) {
			expect(
				fileResponsePolicy({ contentType: type, fetchDest: "document" })
					.disposition,
			).toBe("attachment");
			expect(
				fileResponsePolicy({ contentType: type, fetchDest: "image" })
					.disposition,
			).toBe("attachment");
		}
	});

	test("svg renders as an image, downloads as a document", () => {
		const asImage = fileResponsePolicy({
			contentType: "image/svg+xml",
			fetchDest: "image",
		});
		expect(asImage.disposition).toBe("inline");
		const navigated = fileResponsePolicy({
			contentType: "image/svg+xml",
			fetchDest: "document",
		});
		expect(navigated.disposition).toBe("attachment");
		const noDest = fileResponsePolicy({
			contentType: "image/svg+xml",
			fetchDest: undefined,
		});
		expect(noDest.disposition).toBe("attachment");
	});

	test("media, pdf, and plain text render inline", () => {
		for (const type of [
			"video/mp4",
			"image/png",
			"audio/mpeg",
			"application/pdf",
			"text/plain",
			"application/json",
		]) {
			expect(
				fileResponsePolicy({ contentType: type, fetchDest: "document" })
					.disposition,
			).toBe("inline");
		}
	});

	test("unknown binary downloads", () => {
		expect(
			fileResponsePolicy({
				contentType: "application/zip",
				fetchDest: "document",
			}).disposition,
		).toBe("attachment");
		expect(
			fileResponsePolicy({ contentType: "", fetchDest: undefined }).contentType,
		).toBe("application/octet-stream");
	});
});

describe("pageAssetResponsePolicy", () => {
	const policy = (contentType: string, fetchDest?: string) =>
		pageAssetResponsePolicy({ contentType, fetchDest });

	test("a page serves its own stylesheet and script inline", () => {
		// The media route downloads these; a page legitimately references them
		// as subresources, so blanket-reusing that policy would break pages.
		expect(policy("text/css", "style").disposition).toBe("inline");
		expect(policy("text/javascript", "script").disposition).toBe("inline");
	});

	test("an SVG renders as an image and downloads when navigated to", () => {
		expect(policy("image/svg+xml", "image").disposition).toBe("inline");
		expect(policy("image/svg+xml", "document").disposition).toBe("attachment");
		expect(policy("image/svg+xml", undefined).disposition).toBe("attachment");
	});

	test("scriptable documents other than the page's own download", () => {
		expect(policy("application/xhtml+xml", "document").disposition).toBe(
			"attachment",
		);
		expect(policy("text/xml", "document").disposition).toBe("attachment");
	});

	test("ordinary media stays inline", () => {
		expect(policy("image/png", "image").disposition).toBe("inline");
		expect(policy("video/mp4", "video").disposition).toBe("inline");
		expect(policy("font/woff2", "font").disposition).toBe("inline");
	});

	test("the served type is normalised, never the client's parameters", () => {
		expect(policy("image/PNG; charset=binary", "image").contentType).toBe(
			"image/png",
		);
		expect(policy("", "image").contentType).toBe("application/octet-stream");
	});
});

describe("varyOnFetchDest", () => {
	test("SVG varies, because its disposition is chosen from the fetch dest", () => {
		// Without Vary a shared cache hands a navigation the variant it stored
		// for an <img>, which quietly undoes the download guard.
		expect(
			pageAssetResponsePolicy({
				contentType: "image/svg+xml",
				fetchDest: "image",
			}).varyOnFetchDest,
		).toBe(true);
		expect(
			fileResponsePolicy({ contentType: "image/svg+xml", fetchDest: "image" })
				.varyOnFetchDest,
		).toBe(true);
	});

	test("types with a fixed disposition do not vary", () => {
		for (const type of [
			"image/png",
			"text/css",
			"text/html",
			"application/pdf",
		]) {
			expect(
				pageAssetResponsePolicy({ contentType: type, fetchDest: "document" })
					.varyOnFetchDest,
			).toBe(false);
		}
	});
});
