import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readdirSync, readFileSync, statSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

const HERE = import.meta.dir;

/**
 * Every sentence file — `providers/slack/slack.tsx`. All of them, not one per
 * directory: `google` holds both `gmail.tsx` and `googleCalendar.tsx`, and a
 * check that stopped at the first file would have passed while the second was
 * unwired.
 */
function sentenceFiles(): { provider: string; source: string }[] {
	return readdirSync(HERE)
		.filter((entry) => entry !== "components")
		.filter((entry) => statSync(join(HERE, entry)).isDirectory())
		.flatMap((provider) =>
			readdirSync(join(HERE, provider))
				.filter((name) => name.endsWith(".tsx") && /^[a-z]/.test(name))
				.map((file) => ({
					provider: `${provider}/${file.replace(/\.tsx$/, "")}`,
					source: readFileSync(join(HERE, provider, file), "utf8"),
				})),
		);
}

/**
 * A chip whose options are fetched has to be handed the fetch's state, or it
 * cannot tell "still loading" and "we couldn't reach the provider" apart from
 * "there is genuinely nothing" — and it loses its Refresh with them.
 *
 * This is asserted over the source rather than a render because the failure is
 * an omission: the chip renders perfectly well without the prop, just mute
 * about everything that matters. Four providers shipped that way, each looking
 * fine on screen.
 */
describe("provider sentences", () => {
	test("every chip over a fetched list receives the option state", () => {
		const missing: string[] = [];
		for (const { provider, source } of sentenceFiles()) {
			for (const chip of source.match(/<ScopeChip\b[\s\S]*?\/>/g) ?? []) {
				// `options={[]}` is a chip with nothing to fetch (a typed branch
				// name); only fetched lists have a state to report.
				if (!/options=\{options\./.test(chip)) continue;
				if (!chip.includes("state={state}")) {
					const field = chip.match(/scope=\{[\w.?]*\.(\w+)\}/)?.[1] ?? "?";
					missing.push(`${provider}.${field}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});

	test("no sentence reaches for the option-state map by group name", () => {
		// The context hands each provider its own resolved state; naming the
		// group again is how one gets pointed at the wrong list.
		const offenders = sentenceFiles()
			.filter(({ source }) => source.includes("optionState"))
			.map(({ provider }) => provider);
		expect(offenders).toEqual([]);
	});
});
