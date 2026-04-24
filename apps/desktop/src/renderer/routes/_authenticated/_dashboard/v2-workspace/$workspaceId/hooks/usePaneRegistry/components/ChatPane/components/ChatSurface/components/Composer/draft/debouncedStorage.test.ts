import { describe, expect, it } from "bun:test";
import {
	createDebouncedStorage,
	createMemoryStorage,
} from "./debouncedStorage";

async function wait(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createDebouncedStorage", () => {
	it("coalesces rapid writes to the same key into the last value", async () => {
		const inner = createMemoryStorage();
		const outer = createDebouncedStorage(inner, 20);
		outer.setItem("k", "a");
		outer.setItem("k", "b");
		outer.setItem("k", "c");
		expect(inner.getItem("k")).toBeNull();
		await wait(40);
		expect(inner.getItem("k")).toBe("c");
	});

	it("reads reflect pending writes before they commit", () => {
		const inner = createMemoryStorage();
		const outer = createDebouncedStorage(inner, 50);
		outer.setItem("k", "pending");
		expect(outer.getItem("k")).toBe("pending");
		expect(inner.getItem("k")).toBeNull();
	});

	it("flush commits all pending writes immediately", () => {
		const inner = createMemoryStorage();
		const outer = createDebouncedStorage(inner, 10_000);
		outer.setItem("a", "1");
		outer.setItem("b", "2");
		outer.flush();
		expect(inner.getItem("a")).toBe("1");
		expect(inner.getItem("b")).toBe("2");
	});

	it("removeItem is debounced and flush respects it", () => {
		const inner = createMemoryStorage();
		inner.setItem("k", "existing");
		const outer = createDebouncedStorage(inner, 10_000);
		outer.removeItem("k");
		expect(outer.getItem("k")).toBeNull();
		expect(inner.getItem("k")).toBe("existing");
		outer.flush();
		expect(inner.getItem("k")).toBeNull();
	});
});
