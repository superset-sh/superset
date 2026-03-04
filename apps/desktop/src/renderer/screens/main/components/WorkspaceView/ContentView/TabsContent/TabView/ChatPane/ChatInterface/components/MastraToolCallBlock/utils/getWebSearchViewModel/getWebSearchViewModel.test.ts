import { describe, expect, it } from "bun:test";
import { getWebSearchViewModel } from "./getWebSearchViewModel";

describe("getWebSearchViewModel", () => {
	it("maps structured results array", () => {
		const viewModel = getWebSearchViewModel({
			args: { query: "superset" },
			result: {
				results: [
					{
						title: "Superset - Run 10+ parallel coding agents on your machine",
						url: "https://superset.sh/",
						content: "snippet",
					},
				],
			},
		});

		expect(viewModel.query).toBe("superset");
		expect(viewModel.results).toEqual([
			{
				title: "Superset - Run 10+ parallel coding agents on your machine",
				url: "https://superset.sh/",
			},
		]);
	});

	it("parses transcript-style text with headings and urls", () => {
		const viewModel = getWebSearchViewModel({
			args: { query: "superset.sh terminal for coding agents" },
			result: {
				text: `Answer: summary

## superset/README.md at main - GitHub
https://github.com/superset-sh/superset/blob/main/README.md
Description text

## Superset - Run 10+ parallel coding agents on your machine
https://superset.sh/`,
			},
		});

		expect(viewModel.results).toEqual([
			{
				title: "superset/README.md at main - GitHub",
				url: "https://github.com/superset-sh/superset/blob/main/README.md",
			},
			{
				title: "Superset - Run 10+ parallel coding agents on your machine",
				url: "https://superset.sh/",
			},
		]);
	});

	it("reads nested text payloads and deduplicates urls", () => {
		const viewModel = getWebSearchViewModel({
			args: { query: "superset" },
			result: {
				result: {
					output: {
						text: `## Superset
https://superset.sh/
https://superset.sh/`,
					},
				},
			},
		});

		expect(viewModel.results).toEqual([
			{
				title: "Superset",
				url: "https://superset.sh/",
			},
		]);
	});
});
