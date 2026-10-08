import { describe, expect, test } from "bun:test";
import { readPageViewers, setPageViewers } from "./pagePresenceStore";

const ada = { id: "u1", name: "Ada", image: null, color: "#000" };
const grace = { id: "u2", name: "Grace", image: null, color: "#111" };

describe("pagePresenceStore", () => {
	test("two views of one page share a list, and closing one keeps the other's", () => {
		const pane = Symbol("pane");
		const detail = Symbol("detail");
		setPageViewers("p1", pane, [ada]);
		setPageViewers("p1", detail, [ada, grace]);
		expect(readPageViewers("p1").map((viewer) => viewer.id)).toEqual([
			"u1",
			"u2",
		]);

		setPageViewers("p1", detail, []);
		expect(readPageViewers("p1")).toEqual([ada]);
		expect(readPageViewers("p2")).toEqual([]);
	});
});
