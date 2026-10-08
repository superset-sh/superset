import { expect, test } from "bun:test";
import { describeMessage } from "./tools";

test("a card posted by an app lists with its title and link", () => {
	expect(
		describeMessage({
			ts: "1.2",
			bot_id: "B1",
			text: "",
			attachments: [
				{
					title: "#8195 docs(agents): assign new PRs",
					title_link: "https://github.com/superset-sh/superset/pull/8195",
				},
			],
		}),
	).toBe(
		"[1.2] B1: #8195 docs(agents): assign new PRs https://github.com/superset-sh/superset/pull/8195",
	);
});
