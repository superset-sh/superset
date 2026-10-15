import { describe, expect, it } from "bun:test";
import { buildAcquisitionSourceProperties } from "./acquisitionSource";

describe("buildAcquisitionSourceProperties", () => {
	it("records the option key and clears a stale Other answer", () => {
		expect(buildAcquisitionSourceProperties("hacker_news", "ignored")).toEqual({
			source: "hacker_news",
			$set: { acquisition_source: "hacker_news" },
			$unset: ["acquisition_source_other"],
		});
	});

	it("adds the trimmed free text only when Other is chosen", () => {
		expect(buildAcquisitionSourceProperties("other", "  a meetup  ")).toEqual({
			source: "other",
			other_text: "a meetup",
			$set: {
				acquisition_source: "other",
				acquisition_source_other: "a meetup",
			},
		});
	});

	it("returns nothing to send when the question is skipped", () => {
		expect(buildAcquisitionSourceProperties(null, "")).toBeNull();
	});
});
