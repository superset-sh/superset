import { describe, expect, it } from "bun:test";
import type { PromptInputCommand } from "../../types";
import { rankCommands } from "./rankCommands";

function command(id: string): PromptInputCommand {
	return { id, title: `/${id}`, onSelect: () => {} };
}

describe("rankCommands", () => {
	it("puts the command named exactly by the query ahead of longer ones it starts", () => {
		const ranked = rankCommands(
			[
				command("mcp:notion:make-a-page"),
				command("mcp"),
				command("superset-mcp"),
			],
			"mcp",
		);
		expect(ranked.map((entry) => entry.id)).toEqual([
			"mcp",
			"mcp:notion:make-a-page",
			"superset-mcp",
		]);
	});
});
