import { describe, expect, it } from "bun:test";
import { getBuiltInSlashCommands } from "./builtins";

describe("getBuiltInSlashCommands", () => {
	it("returns defensive copies for nested fields", () => {
		const first = getBuiltInSlashCommands();
		const second = getBuiltInSlashCommands();

		const firstNew = first.find((command) => command.name === "new");
		if (firstNew) {
			firstNew.aliases.push("extra");
		}

		const firstModel = first.find((command) => command.name === "model");
		if (firstModel?.action) {
			firstModel.action.type = "new_session";
		}

		expect(second.find((command) => command.name === "new")?.aliases).toEqual([
			"clear",
		]);
		expect(
			second.find((command) => command.name === "model")?.action?.type,
		).toBe("set_model");
	});
});
