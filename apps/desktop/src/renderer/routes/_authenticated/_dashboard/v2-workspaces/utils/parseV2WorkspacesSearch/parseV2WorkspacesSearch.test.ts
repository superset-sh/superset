import { describe, expect, it } from "bun:test";
import { parseV2WorkspacesSearch } from "./parseV2WorkspacesSearch";

describe("parseV2WorkspacesSearch", () => {
	it("accepts every view mode, including the archived view", () => {
		expect(parseV2WorkspacesSearch({ view: "archived" }).view).toBe("archived");
		expect(parseV2WorkspacesSearch({ view: "board" }).view).toBe("board");
		expect(parseV2WorkspacesSearch({ view: "list" }).view).toBe("list");
	});

	it("drops an unknown view rather than throwing", () => {
		expect(parseV2WorkspacesSearch({ view: "settings" }).view).toBeUndefined();
		expect(parseV2WorkspacesSearch({ view: 3 }).view).toBeUndefined();
	});

	it("keeps the tombstone lookback separate from the view", () => {
		const search = parseV2WorkspacesSearch({
			view: "archived",
			archived: "week",
		});
		expect(search.view).toBe("archived");
		expect(search.archived).toBe("week");
	});

	it("drops empty strings and unknown enum values", () => {
		const search = parseV2WorkspacesSearch({
			q: "",
			device: "host-1",
			pin: "nope",
			archived: "century",
		});
		expect(search.q).toBeUndefined();
		expect(search.device).toBe("host-1");
		expect(search.pin).toBeUndefined();
		expect(search.archived).toBeUndefined();
	});
});
