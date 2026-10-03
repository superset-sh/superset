import { describe, expect, test } from "bun:test";
import {
	MAX_PAGE_STORAGE_BYTES,
	MAX_PAGE_STORAGE_KEYS_PER_USER,
	MAX_PAGE_STORAGE_VALUE_BYTES,
	pageStorageRefusal,
} from "./page-storage";

const empty = {
	totalBytes: 0,
	keysForUser: 0,
	replacingBytes: 0,
	replacingExisting: false,
};

describe("pageStorageRefusal", () => {
	test("admits a small first write", () => {
		expect(pageStorageRefusal(empty, 32)).toBeNull();
	});

	test("refuses an over-size value", () => {
		expect(
			pageStorageRefusal(empty, MAX_PAGE_STORAGE_VALUE_BYTES + 1),
		).toMatchObject({ code: "quota_exceeded" });
	});

	test("refuses a new key once the per-person count is full", () => {
		expect(
			pageStorageRefusal(
				{ ...empty, keysForUser: MAX_PAGE_STORAGE_KEYS_PER_USER },
				16,
			),
		).toMatchObject({ code: "quota_exceeded" });
	});

	test("still lets a full writer replace a slot they already hold", () => {
		expect(
			pageStorageRefusal(
				{
					totalBytes: 4096,
					keysForUser: MAX_PAGE_STORAGE_KEYS_PER_USER,
					replacingBytes: 16,
					replacingExisting: true,
				},
				16,
			),
		).toBeNull();
	});

	test("counts the page total after the replacement, not before", () => {
		expect(
			pageStorageRefusal(
				{
					totalBytes: MAX_PAGE_STORAGE_BYTES,
					keysForUser: 1,
					replacingBytes: 100,
					replacingExisting: true,
				},
				100,
			),
		).toBeNull();
	});

	test("refuses a write that would push the page over", () => {
		expect(
			pageStorageRefusal({ ...empty, totalBytes: MAX_PAGE_STORAGE_BYTES }, 1),
		).toMatchObject({ code: "quota_exceeded" });
	});

	test("a replacement that grows past the cap is still refused", () => {
		expect(
			pageStorageRefusal(
				{
					totalBytes: MAX_PAGE_STORAGE_BYTES,
					keysForUser: 1,
					replacingBytes: 10,
					replacingExisting: true,
				},
				2000,
			),
		).toMatchObject({ code: "quota_exceeded" });
	});
});
