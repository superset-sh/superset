import { describe, expect, test } from "bun:test";
import { buildQuestionAnswers } from "./questionAnswers";

describe("buildQuestionAnswers", () => {
	test("does not repeat a selected option entered again as custom text", () => {
		expect(
			buildQuestionAnswers(
				[{ question: "Which fruit?" }],
				{ "Which fruit?": ["Papaya"] },
				{ "Which fruit?": "  papaya  " },
			),
		).toEqual({ "Which fruit?": "Papaya" });
	});

	test("keeps distinct multi-select and custom answers in selection order", () => {
		expect(
			buildQuestionAnswers(
				[{ question: "Choose tools" }],
				{ "Choose tools": ["Read", "Write", "Read"] },
				{ "Choose tools": "Bash" },
			),
		).toEqual({ "Choose tools": "Read, Write, Bash" });
	});
});
