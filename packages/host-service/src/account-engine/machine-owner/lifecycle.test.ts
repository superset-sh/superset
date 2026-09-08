import { expect, it } from "bun:test";
import { spawnAccountOwner } from "./lifecycle.ts";

it("refuses automatic subprocess spawning under a test runner", () => {
	expect(() => spawnAccountOwner()).toThrow(
		"automatic subprocess spawning is disabled",
	);
});
