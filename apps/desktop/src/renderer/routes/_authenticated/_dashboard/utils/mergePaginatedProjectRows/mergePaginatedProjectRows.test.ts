import { describe, expect, test } from "bun:test";
import { mergePaginatedProjectRows } from "./mergePaginatedProjectRows";

interface Row {
	id: string;
	updatedAt: string | null;
}

const merge = (
	pages: Array<{ page: number; isPending: boolean; rows: Row[] }>,
) =>
	mergePaginatedProjectRows({
		pages,
		getKey: (row) => row.id,
		getUpdatedAt: (row) => row.updatedAt,
	});

describe("mergePaginatedProjectRows", () => {
	test("sorts the first repository batch by update time", () => {
		expect(
			merge([
				{
					page: 1,
					isPending: false,
					rows: [{ id: "older", updatedAt: "2026-08-04T12:00:00Z" }],
				},
				{
					page: 1,
					isPending: false,
					rows: [{ id: "newer", updatedAt: "2026-08-05T12:00:00Z" }],
				},
			]).map((row) => row.id),
		).toEqual(["newer", "older"]);
	});

	test("appends complete later batches without reordering earlier rows", () => {
		const firstPage = [
			{ id: "first", updatedAt: "2026-08-05T12:00:00Z" },
			{ id: "second", updatedAt: "2026-08-04T12:00:00Z" },
		];
		const pages = [
			{ page: 1, isPending: false, rows: firstPage },
			{
				page: 2,
				isPending: false,
				rows: [{ id: "third", updatedAt: "2026-08-06T12:00:00Z" }],
			},
		];
		expect(merge(pages).map((row) => row.id)).toEqual([
			"first",
			"second",
			"third",
		]);
	});

	test("waits for every repository in a later batch and removes duplicates", () => {
		const pages = [
			{
				page: 1,
				isPending: false,
				rows: [{ id: "first", updatedAt: "2026-08-05T12:00:00Z" }],
			},
			{
				page: 2,
				isPending: false,
				rows: [{ id: "first", updatedAt: "2026-08-06T12:00:00Z" }],
			},
			{ page: 2, isPending: true, rows: [] },
		];
		expect(merge(pages).map((row) => row.id)).toEqual(["first"]);

		pages[2] = {
			page: 2,
			isPending: false,
			rows: [{ id: "second", updatedAt: "2026-08-07T12:00:00Z" }],
		};
		expect(merge(pages).map((row) => row.id)).toEqual(["first", "second"]);
	});
});
