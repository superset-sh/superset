import { describe, expect, it } from "bun:test";
import { preparePullRequestMarkdown } from "./preparePullRequestMarkdown";

describe("preparePullRequestMarkdown", () => {
	it("drops template comments but leaves html and code as written", () => {
		expect(
			preparePullRequestMarkdown(
				"<!-- READ BEFORE OPENING -->\nLine one<br>Line two <sub>x</sub>\n\n```html\n<!-- kept -->\n```\n`<!-- inline -->`",
			),
		).toBe(
			"Line one<br>Line two <sub>x</sub>\n\n```html\n<!-- kept -->\n```\n`<!-- inline -->`",
		);
	});

	it("reads a comment-only body as empty", () => {
		expect(preparePullRequestMarkdown("<!-- a -->\n\n<!-- b -->")).toBe("");
	});

	it("labels GitHub alert markers outside code", () => {
		expect(
			preparePullRequestMarkdown(
				"> [!NOTE]\n> Mind the gap.\n\n> [!warning]  \n> Hot.\n\n```md\n> [!NOTE]\n```",
				{
					note: "Hinweis",
					tip: "Tipp",
					important: "Wichtig",
					warning: "Warnung",
					caution: "Achtung",
				},
			),
		).toBe(
			"> **Hinweis**\n> Mind the gap.\n\n> **Warnung**\n> Hot.\n\n```md\n> [!NOTE]\n```",
		);
	});
});
