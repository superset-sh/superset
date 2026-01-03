import { beforeEach, describe, expect, it } from "bun:test";
import {
	type TerminalOutputFilter,
	TerminalOutputFilterChain,
} from "./terminal-output-filter";

describe("TerminalOutputFilterChain", () => {
	let chain: TerminalOutputFilterChain;

	beforeEach(() => {
		chain = new TerminalOutputFilterChain();
	});

	describe("register", () => {
		it("should register a filter", () => {
			const filter: TerminalOutputFilter = {
				id: "test-filter",
				description: "Test filter",
				filter: (data) => data.replace("foo", "bar"),
			};

			chain.register(filter);

			expect(chain.getRegisteredFilters()).toEqual(["test-filter"]);
		});

		it("should not register duplicate filters", () => {
			const filter: TerminalOutputFilter = {
				id: "test-filter",
				description: "Test filter",
				filter: (data) => data,
			};

			chain.register(filter);
			chain.register(filter);

			expect(chain.getRegisteredFilters()).toEqual(["test-filter"]);
		});
	});

	describe("unregister", () => {
		it("should unregister a filter", () => {
			const filter: TerminalOutputFilter = {
				id: "test-filter",
				description: "Test filter",
				filter: (data) => data,
			};

			chain.register(filter);
			const result = chain.unregister("test-filter");

			expect(result).toBe(true);
			expect(chain.getRegisteredFilters()).toEqual([]);
		});

		it("should return false for non-existent filter", () => {
			const result = chain.unregister("non-existent");
			expect(result).toBe(false);
		});
	});

	describe("apply", () => {
		it("should apply filters in order", () => {
			chain.register({
				id: "filter-1",
				description: "Add A",
				filter: (data) => `${data}A`,
			});
			chain.register({
				id: "filter-2",
				description: "Add B",
				filter: (data) => `${data}B`,
			});

			const result = chain.apply("X");
			expect(result).toBe("XAB");
		});

		it("should stop early if data is empty", () => {
			let secondFilterCalled = false;

			chain.register({
				id: "filter-1",
				description: "Clear all",
				filter: () => "",
			});
			chain.register({
				id: "filter-2",
				description: "Should not be called",
				filter: (data) => {
					secondFilterCalled = true;
					return data;
				},
			});

			const result = chain.apply("test");
			expect(result).toBe("");
			expect(secondFilterCalled).toBe(false);
		});

		it("should return original data with no filters", () => {
			const result = chain.apply("test data");
			expect(result).toBe("test data");
		});
	});

	describe("clear", () => {
		it("should remove all filters", () => {
			chain.register({
				id: "filter-1",
				description: "Filter 1",
				filter: (data) => data,
			});
			chain.register({
				id: "filter-2",
				description: "Filter 2",
				filter: (data) => data,
			});

			chain.clear();

			expect(chain.getRegisteredFilters()).toEqual([]);
		});
	});
});
