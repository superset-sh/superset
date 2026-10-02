import { describe, expect, test } from "bun:test";
import { isViewerAlone } from "./isViewerAlone";

describe("isViewerAlone", () => {
	test("nobody, or only the viewer, is alone", () => {
		expect(isViewerAlone([], "me")).toBe(true);
		expect(isViewerAlone([{ userId: "me" }], "me")).toBe(true);
	});

	test("anyone else in the box is company", () => {
		expect(isViewerAlone([{ userId: "kiet" }], "me")).toBe(false);
		expect(isViewerAlone([{ userId: "me" }, { userId: "kiet" }], "me")).toBe(
			false,
		);
	});
});
