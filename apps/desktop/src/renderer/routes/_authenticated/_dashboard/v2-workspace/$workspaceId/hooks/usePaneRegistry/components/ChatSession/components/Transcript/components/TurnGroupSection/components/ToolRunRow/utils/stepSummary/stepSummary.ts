import { plural } from "@lingui/core/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { formatList } from "@superset/i18n/format";
import { stepCounts } from "../../../../utils/stepCounts";

/** One phrase of a step summary; `count` is the placeholder every plural shares. */
function stepPhrase(
	concept: keyof ReturnType<typeof stepCounts>,
	count: number,
): string {
	switch (concept) {
		case "reads":
			return plural(count, { one: "read # file", other: "read # files" });
		case "searches":
			return plural(count, { one: "# search", other: "# searches" });
		case "commands":
			return plural(count, { one: "ran # command", other: "ran # commands" });
		case "edits":
			return plural(count, { one: "edited # file", other: "edited # files" });
		case "fetches":
			return plural(count, { one: "fetched # page", other: "fetched # pages" });
		case "tools":
			return plural(count, { one: "used # tool", other: "used # tools" });
	}
}

const STEP_CONCEPT_ORDER = [
	"reads",
	"searches",
	"commands",
	"edits",
	"fetches",
	"tools",
] as const;

/**
 * "ran 6 commands, edited 3 files, read 2 files": what the run did, in the
 * order it is most often done, instead of how many calls it took.
 */
export function stepSummary(items: readonly ToolCall[]): string {
	const counts = stepCounts(items);
	const phrases = STEP_CONCEPT_ORDER.filter(
		(concept) => counts[concept] > 0,
	).map((concept) => stepPhrase(concept, counts[concept]));
	return formatList(phrases, { type: "unit", style: "short" });
}
