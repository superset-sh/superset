import { describe, expect, test } from "bun:test";
import type { PaginationTarget } from "./useMultiRepoProjectPagination";
import { buildPaginatedQueryTargets } from "./useMultiRepoProjectPagination";

const targets: PaginationTarget[] = [
	{ key: "host-1\0web,api", hostUrl: "http://localhost:3201" },
	{ key: "host-2\0docs", hostUrl: "http://localhost:3202" },
];

describe("buildPaginatedQueryTargets", () => {
	test("starts every target on its first page", () => {
		expect(buildPaginatedQueryTargets(targets, {})).toEqual([
			{ target: targets[0], page: 1 },
			{ target: targets[1], page: 1 },
		]);
	});

	test("expands only targets with additional requested pages", () => {
		expect(
			buildPaginatedQueryTargets(targets, { "host-1\0web,api": 3 }),
		).toEqual([
			{ target: targets[0], page: 1 },
			{ target: targets[0], page: 2 },
			{ target: targets[0], page: 3 },
			{ target: targets[1], page: 1 },
		]);
	});
});
