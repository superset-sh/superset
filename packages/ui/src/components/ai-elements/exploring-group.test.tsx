import { describe, expect, it } from "bun:test";
import { buildSummary } from "./exploring-group";

describe("ExploringGroup", () => {
	describe("buildSummary", () => {
		it("counts files and searches correctly", () => {
			const items = [
				{ icon: () => null, title: "Read", isPending: false, isError: false },
				{ icon: () => null, title: "Read", isPending: false, isError: false },
				{
					icon: () => null,
					title: "Searched",
					isPending: false,
					isError: false,
				},
			];

			expect(buildSummary(items)).toBe("2 files 1 search");
		});

		it("returns singular form for single items", () => {
			const items = [
				{ icon: () => null, title: "Read", isPending: false, isError: false },
			];
			expect(buildSummary(items)).toBe("1 file");
		});

		it("handles mixed file and search patterns", () => {
			const items = [
				{ icon: () => null, title: "Glob", isPending: false, isError: false },
				{
					icon: () => null,
					title: "Explored",
					isPending: false,
					isError: false,
				},
				{
					icon: () => null,
					title: "Searched",
					isPending: false,
					isError: false,
				},
				{
					icon: () => null,
					title: "Searched",
					isPending: false,
					isError: false,
				},
			];

			expect(buildSummary(items)).toBe("2 files 2 searches");
		});
	});
});
