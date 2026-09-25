import { describe, expect, test } from "bun:test";
import { selectServingHostId } from "./useProjectHost";

describe("selectServingHostId", () => {
	test("prefers the local host when it serves the project", () => {
		expect(
			selectServingHostId(["remote-machine", "local-machine"], "local-machine"),
		).toBe("local-machine");
	});

	test("falls back to the first serving host", () => {
		expect(selectServingHostId(["remote-a", "remote-b"], "local-machine")).toBe(
			"remote-a",
		);
	});

	test("does not silently route an unavailable project to the local host", () => {
		expect(selectServingHostId([], "local-machine")).toBeNull();
	});
});
