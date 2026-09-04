import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, within } = await import("@testing-library/react");
const { TriggerSentence } = await import("../../TriggerSentence");
const { CHIP_INVALID } = await import("../../TriggerSentence/chipStyles");
const { githubProvider } = await import("./github");
const { createGithubConfig } = await import("./grammar");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * What a GitHub row looks like, and must keep looking like.
 *
 * The diagrams over each block are the point of this file: the components
 * underneath are expected to be generalized, and these say what the result has
 * to render regardless of how it is built.
 *
 *     [word ▾]  a chip — a button you can open
 *      word     fixed wording, not a control
 *      (!)      marked as blocking the save
 *      [🗑]     remove, always last
 */

const REPOS = [
	{ id: "10", label: "superset", hint: "superset-sh" },
	{ id: "20", label: "domains", hint: "superset-sh" },
];

/**
 * Renders one GitHub row in a given state and hands back its parts.
 *
 * `chip` finds a word of the sentence by the text on it, which is how a person
 * finds it too. `sentence` joins the row's own children rather than reading
 * textContent, because the spaces a reader sees are flex gaps — textContent
 * runs the words together.
 */
async function row(
	config: Record<string, unknown>,
	props: Record<string, unknown> = {},
) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<TriggerSentence
				trigger={{ id: "t1", config } as never}
				onChange={() => {}}
				onRemove={() => {}}
				options={{ github: { repositories: REPOS, people: [], viewer: [] } }}
				{...props}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	return {
		ui,
		chip: (name: string | RegExp) => ui.getByRole("button", { name }),
		queryChip: (name: string | RegExp) => ui.queryByRole("button", { name }),
		open: async (name: string | RegExp) => {
			await act(async () => {
				ui.getByRole("button", { name }).click();
			});
			return ui;
		},
		chips: () =>
			ui
				.getAllByRole("button")
				.map((button) => (button.textContent ?? "").trim()),
		sentence: [...(view.container.firstElementChild?.children ?? [])]
			.map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.join(" "),
	};
}

const config = (event: string, over: Record<string, unknown> = {}) => ({
	...createGithubConfig(event as never),
	...over,
});

/**
 * As added — the repository is the one thing with no default:
 *
 *   ⌥ PR opened in [Select repo ▾] by [Anyone ▾]               [🗑]
 */
describe("a GitHub row that was just added", () => {
	test("asks for a repository, because it has no default", async () => {
		const { chip } = await row(config("pull_request.opened"));
		expect(chip("Select repo")).toBeDefined();
	});

	test("watches anyone until told otherwise", async () => {
		const { chip } = await row(config("pull_request.opened"));
		expect(chip("Anyone")).toBeDefined();
	});

	test("can be removed", async () => {
		const { ui } = await row(config("pull_request.opened"));
		expect(ui.getByLabelText("Remove trigger")).toBeDefined();
	});

	// An empty repository list matches nothing, so an unfinished trigger cannot
	// fire on every repository. The offer has to be absent from inside the
	// picker — on the closed chip "Any repo" is only ever a label for a scope
	// that is already "any", so asserting there proves nothing.
	test("does not offer to watch every repository", async () => {
		const { open } = await row(config("pull_request.opened"));
		const picker = await open("Select repo");
		expect(picker.queryByText("Any repo")).toBeNull();
	});

	// One repository, because branches and labels belong to one and cannot be
	// listed until it is known.
	test("takes one repository, not a set", async () => {
		const { open } = await row(config("pull_request.opened"));
		const picker = await open("Select repo");
		expect(picker.queryByRole("checkbox")).toBeNull();
	});
});

/**
 *   ⌥ PR opened in [superset ▾] by [Anyone ▾]
 */
describe("a GitHub row watching one repository", () => {
	const chosen = () =>
		config("pull_request.opened", {
			repositories: { mode: "list", ids: ["10"] },
		});

	test("names the repository rather than counting it", async () => {
		const { chip } = await row(chosen());
		expect(chip("superset")).toBeDefined();
	});

	test("no longer asks for one", async () => {
		const { queryChip } = await row(chosen());
		expect(queryChip("Select repo")).toBeNull();
	});
});

/**
 *   … by [Anyone ▾]   [Me ▾]   [saddlepaddle ▾]   [2 people ▾]
 *                              [Specific People ▾]  ← chosen, none named
 */
describe("a GitHub row filtering by person", () => {
	const withActor = (actor: unknown) =>
		config("pull_request.opened", {
			repositories: { mode: "list", ids: ["10"] },
			actor,
		});

	test('resolves "Me" at delivery, so the row simply says Me', async () => {
		const { chip } = await row(withActor({ mode: "me" }));
		expect(chip("Me")).toBeDefined();
	});

	// A typed login labels itself; there is no roster to look it up in, which
	// is the whole reason the field takes typed names.
	test("shows a named person by the name that was typed", async () => {
		const { chip } = await row(
			withActor({ mode: "list", ids: ["saddlepaddle"] }),
		);
		expect(chip("saddlepaddle")).toBeDefined();
	});

	test("counts several named people", async () => {
		const { chip } = await row(
			withActor({ mode: "list", ids: ["alice", "bob"] }),
		);
		expect(chip("2 people")).toBeDefined();
	});

	// An empty set matches nobody and blocks saving, so it reads as unset even
	// though a mode was deliberately chosen.
	test("reads as unset when specific people are chosen but none named", async () => {
		const { chip } = await row(withActor({ mode: "list", ids: [] }));
		expect(chip("Specific People")).toBeDefined();
	});
});

/**
 * Not connected — the sentence collapses, because nothing in it could be
 * filled in:
 *
 *   ⌥ Pull request Opened  Requires connection   [🗑] [Connect ↗]
 */
describe("a GitHub row whose integration is not connected", () => {
	const disconnected = () =>
		row(config("pull_request.opened"), { requiresConnection: true });

	// With no connection there is nothing to populate the pickers, so a
	// sentence full of empty ones would only ask for choices nobody can make.
	// The name comes off the Add Trigger menu, nested path and all.
	test("collapses to the name of the trigger", async () => {
		const { ui } = await disconnected();
		expect(ui.getByText("Pull request Opened")).toBeDefined();
	});

	test("says a connection is required", async () => {
		const { ui } = await disconnected();
		expect(ui.getByText("Requires connection")).toBeDefined();
	});

	test("offers the way to fix it", async () => {
		const { chip } = await disconnected();
		expect(chip(/Connect/)).toBeDefined();
	});

	test("hides the pickers entirely", async () => {
		const { queryChip } = await disconnected();
		expect(queryChip("Select repo")).toBeNull();
		expect(queryChip("Anyone")).toBeNull();
	});

	test("can still be removed", async () => {
		const { ui } = await disconnected();
		expect(ui.getByLabelText("Remove trigger")).toBeDefined();
	});
});

/**
 *   ⌥ PR opened in [Select repo ▾](!) by [Anyone ▾]
 */
describe("a GitHub row a save was refused on", () => {
	// There is no Save button — the set saves itself once valid — so marking
	// the chip is the only thing that says which word is holding it back.
	const refused = () =>
		row(config("pull_request.opened"), {
			problems: [
				{ index: 0, field: "repositories", message: "Choose a repository" },
			],
		});

	const MARK = "ring-amber-500/50";

	test("marks the chip the save is blocked on", async () => {
		const { chip } = await refused();
		expect(CHIP_INVALID).toContain(MARK);
		expect(chip("Select repo").className).toContain(MARK);
	});

	test("leaves the chips that are fine alone", async () => {
		const { chip } = await refused();
		expect(chip("Anyone").className).not.toContain(MARK);
	});
});

describe("a GitHub row that cannot be edited", () => {
	test("disables every word of the sentence", async () => {
		const { ui } = await row(config("pull_request.opened"), {
			disabled: true,
		});
		for (const button of ui.getAllByRole("button")) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
	});
});

/**
 * The order and wording of the parts, which per-element queries cannot see:
 * `getByRole` finds a chip wherever it sits, so only the whole sentence catches
 * a slot moving or a connecting word changing.
 */
describe("the wording of a GitHub row", () => {
	test("a pull request trigger names where, then who", async () => {
		const { sentence } = await row(
			config("pull_request.opened", {
				repositories: { mode: "list", ids: ["10"] },
			}),
		);
		expect(sentence).toBe("PR opened in superset by Anyone");
	});

	// The comment events carry two different people — whoever wrote the
	// comment, and whoever opened the thing commented on.
	test("a comment trigger keeps the commenter and the author apart", async () => {
		const { sentence } = await row(
			config("comment_added", {
				repositories: { mode: "list", ids: ["10"] },
			}),
		);
		expect(sentence).toBe(
			"Any comment by Anyone on a PR by Anyone in superset",
		);
	});

	test("a push trigger names the branch before the repository", async () => {
		const { sentence } = await row(
			config("push_to_branch", {
				repositories: { mode: "list", ids: ["10"] },
			}),
		);
		expect(sentence).toBe("Push to Any branch in superset by Anyone");
	});

	// Being put on a PR names two people: whoever was asked, then whoever
	// asked. The first is the one "Me" is for.
	test("a review request names who was asked before where", async () => {
		const { sentence } = await row(
			config("pull_request.review_requested", {
				repositories: { mode: "list", ids: ["10"] },
			}),
		);
		expect(sentence).toBe("Review requested from Anyone in superset by Anyone");
	});
});

describe('a GitHub row that filters by "Me" with no account connected', () => {
	// Configured fine, permanently silent: "Me" resolves against the owner's
	// GitHub identity when each event arrives, and there isn't one.
	const warningsFor = (over: Record<string, unknown>, viewer: unknown[] = []) =>
		githubProvider.runtimeWarnings?.(
			config("pull_request.opened", over) as never,
			{ github: { viewer: viewer as never } },
		) ?? [];

	test("warns that it will not fire", () => {
		const warnings = warningsFor({ actor: { mode: "me" } });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("no GitHub account is connected");
	});

	test("stays quiet once an account resolves", () => {
		expect(
			warningsFor({ actor: { mode: "me" } }, [{ id: "42", label: "satya" }]),
		).toEqual([]);
	});

	test("stays quiet when no scope asks for Me", () => {
		expect(warningsFor({})).toEqual([]);
	});
});

/**
 * The optional filters, which start wide open rather than empty — clearing the
 * last value returns them to "any" rather than leaving a list that matches
 * nothing:
 *
 *   ⌥ Label [Any label ▾] changed in [superset ▾] by [Anyone ▾]
 *   ⌥ Push to [Any branch ▾] in [superset ▾] by [Anyone ▾]
 */
describe("a GitHub row's optional filters", () => {
	const inRepo = (event: string, over: Record<string, unknown> = {}) =>
		config(event, { repositories: { mode: "list", ids: ["10"] }, ...over });

	test("labels start wide open", async () => {
		const { chip } = await row(inRepo("label_change"));
		expect(chip("Any label")).toBeDefined();
	});

	test("one label is named", async () => {
		const { chip } = await row(
			inRepo("label_change", { labels: { mode: "list", ids: ["bug"] } }),
		);
		expect(chip("bug")).toBeDefined();
	});

	// Labels are typed, not picked, so a label containing spaces has to survive
	// as one value.
	test("a label with spaces stays one label", async () => {
		const { chip } = await row(
			inRepo("label_change", {
				labels: { mode: "list", ids: ["good first issue"] },
			}),
		);
		expect(chip("good first issue")).toBeDefined();
	});

	test("several labels are counted", async () => {
		const { chip } = await row(
			inRepo("label_change", {
				labels: { mode: "list", ids: ["bug", "urgent"] },
			}),
		);
		expect(chip("2 labels")).toBeDefined();
	});

	test("branches start wide open", async () => {
		const { chip } = await row(inRepo("push_to_branch"));
		expect(chip("Any branch")).toBeDefined();
	});
});

/**
 * The comment body filter, which carries the verb the sentence does not:
 *
 *   ⌥ [Matching "LGTM" ▾] by [Anyone ▾] on a PR by [Anyone ▾] in [superset ▾]
 */
describe("a GitHub row filtering a comment body", () => {
	test("starts matching any comment", async () => {
		const { chip } = await row(
			config("comment_added", { repositories: { mode: "list", ids: ["10"] } }),
		);
		expect(chip("Any comment")).toBeDefined();
	});

	test("says what it is matching, in quotes", async () => {
		const { chip } = await row(
			config("comment_added", {
				repositories: { mode: "list", ids: ["10"] },
				commentFilter: { pattern: "LGTM", isRegex: false },
			}),
		);
		expect(chip('Matching "LGTM"')).toBeDefined();
	});
});
