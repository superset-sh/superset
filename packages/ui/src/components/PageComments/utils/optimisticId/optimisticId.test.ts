import { describe, expect, test } from "bun:test";
import { isOptimisticId, optimisticId } from "./optimisticId";

describe("optimisticId", () => {
	test("mints ids it recognises as its own", () => {
		expect(isOptimisticId(optimisticId())).toBe(true);
	});

	test("mints a distinct id each call", () => {
		expect(optimisticId()).not.toBe(optimisticId());
	});

	test("does not claim a server id", () => {
		expect(isOptimisticId("cmt_01HZY8QX")).toBe(false);
		expect(isOptimisticId("")).toBe(false);
	});
});
