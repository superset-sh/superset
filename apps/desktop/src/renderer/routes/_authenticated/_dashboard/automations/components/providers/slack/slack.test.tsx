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
const { slackProvider } = await import("./slack");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * What a Slack row looks like, and must keep looking like.
 *
 * The diagrams over each block are the point of this file: the components
 * underneath are expected to be generalized, and these say what the result has
 * to render regardless of how it is built. Copy, order and which words are
 * openable are all fixed here on purpose.
 *
 *     [word ▾]  a chip — a button you can open
 *      word     fixed wording, not a control
 *      (!)      marked as blocking the save
 *      [🗑]     remove, always last
 */

const CHANNELS = [
	{ id: "C1", label: "#general", botMember: true },
	{ id: "C2", label: "#secret", botMember: false },
];

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
				options={{ slack: { channels: CHANNELS, people: [] } }}
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
		// Joined from the row's own parts, not textContent: the spaces a reader
		// sees are flex gaps, so textContent runs the words together.
		sentence: [...(view.container.firstElementChild?.children ?? [])]
			.map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.join(" "),
	};
}

const message = (over: Record<string, unknown> = {}) => ({
	kind: "slack",
	event: "message_in_channel",
	messageFilter: null,
	actor: { mode: "any" },
	channels: { mode: "list", ids: [] },
	completionReaction: "white_check_mark",
	...over,
});

const reaction = (over: Record<string, unknown> = {}) => ({
	kind: "slack",
	event: "reaction_added",
	emoji: { mode: "list", ids: [] },
	actor: { mode: "any" },
	channels: { mode: "list", ids: ["C1"] },
	...over,
});

/**
 * A message row, as added:
 *
 *   ⌗ [Any message ▾] from Anyone in [Select channels ▾]
 *     ; react with [✅ ▾] upon completion             [🗑]
 */
describe("a Slack message row that was just added", () => {
	test("asks for a channel", async () => {
		const { chip } = await row(message());
		expect(chip("Select channels")).toBeDefined();
	});

	test("matches any message by default", async () => {
		const { chip } = await row(message());
		expect(chip("Any message")).toBeDefined();
	});

	// Ahead-of-time people filters were removed from Slack rows: every new
	// trigger listens to anyone, so this is a statement rather than a choice.
	test("listens to anyone, and does not offer to narrow it", async () => {
		const { ui, queryChip } = await row(message());
		expect(ui.getByText("Anyone")).toBeDefined();
		expect(queryChip("Anyone")).toBeNull();
	});

	test("a row saved with a people filter keeps its chip", async () => {
		const { chip } = await row(
			message({ actor: { mode: "list", ids: ["U1"] } }),
		);
		expect(chip("U1")).toBeDefined();
	});

	// A row saved before this field existed has no key at all, and the schema
	// defaults it on save, so the chip has to show the same default.
	test("acknowledges with a check mark by default", async () => {
		const { chip } = await row(message());
		expect(chip("✅")).toBeDefined();
	});

	test("can be removed", async () => {
		const { ui } = await row(message());
		expect(ui.getByLabelText("Remove trigger")).toBeDefined();
	});
});

/**
 * The message filter, once it has something in it:
 *
 *   ⌗ [Matching "deploy" ▾] from Anyone in [#general ▾] …
 */
describe("a Slack row filtering the message body", () => {
	// The verb matters: a bare quoted string beside the sentence reads as the
	// message itself rather than as a filter over it.
	test("says what it is matching, in quotes", async () => {
		const { chip } = await row(
			message({ messageFilter: { pattern: "deploy", isRegex: false } }),
		);
		expect(chip('Matching "deploy"')).toBeDefined();
	});

	test("says Any message when there is no filter", async () => {
		const { chip } = await row(message());
		expect(chip("Any message")).toBeDefined();
	});
});

/**
 * Channels, one and many:
 *
 *   … in [#general ▾]        … in [2 channels ▾]
 */
describe("a Slack row that names its channels", () => {
	test("names one channel", async () => {
		const { chip } = await row(
			message({ channels: { mode: "list", ids: ["C1"] } }),
		);
		expect(chip("#general")).toBeDefined();
	});

	test("counts several", async () => {
		const { chip } = await row(
			message({ channels: { mode: "list", ids: ["C1", "C2"] } }),
		);
		expect(chip("2 channels")).toBeDefined();
	});

	// Slack only delivers events from channels the bot is in, so "any channel"
	// would promise more than it can watch.
	test("does not offer to watch every channel", async () => {
		const { open } = await row(message());
		const picker = await open("Select channels");
		expect(picker.queryByText("Any channel")).toBeNull();
	});

	// The roster lists only channels the bot can see plus public ones; a pasted
	// id is the way in for anything else.
	test("invites a channel id to be pasted", async () => {
		const { open } = await row(message());
		const picker = await open("Select channels");
		expect(
			picker.getByPlaceholderText("Search channels or paste channel ID..."),
		).toBeDefined();
	});
});

/**
 * A reaction row:
 *
 *   ⌗ Reaction [Select emoji ▾] added by Anyone to a message in [#general ▾]
 */
describe("a Slack reaction row", () => {
	test("asks which reaction, since it has no default", async () => {
		const { chip } = await row(reaction());
		expect(chip("Select emoji")).toBeDefined();
	});

	test("shows a known reaction as its glyph", async () => {
		const { chip } = await row(
			reaction({ emoji: { mode: "list", ids: ["eyes"] } }),
		);
		expect(chip("👀")).toBeDefined();
	});

	// A workspace's custom emoji have no glyph here and read as :name:.
	test("shows a custom reaction by name", async () => {
		const { chip } = await row(
			reaction({ emoji: { mode: "list", ids: ["shipit"] } }),
		);
		expect(chip(":shipit:")).toBeDefined();
	});

	test("counts several reactions", async () => {
		const { chip } = await row(
			reaction({ emoji: { mode: "list", ids: ["eyes", "bug"] } }),
		);
		expect(chip("2 reactions")).toBeDefined();
	});
});

/**
 * The completion reaction, which can be turned off:
 *
 *   … ; react with [No reaction ▾] upon completion
 */
describe("a Slack row's completion reaction", () => {
	test("can be set to none", async () => {
		const { chip } = await row(message({ completionReaction: null }));
		expect(chip("No reaction")).toBeDefined();
	});

	test("shows a custom reaction by name", async () => {
		const { chip } = await row(message({ completionReaction: "shipit" }));
		expect(chip(":shipit:")).toBeDefined();
	});
});

/**
 * A channel-created row — no channel to pick, because it is workspace-wide:
 *
 *   ⌗ Channel created matching [Any name ▾]                     [🗑]
 */
describe("a Slack channel-created row", () => {
	const created = (over: Record<string, unknown> = {}) => ({
		kind: "slack",
		event: "channel_created",
		messageFilter: null,
		actor: { mode: "any" },
		channels: { mode: "any" },
		...over,
	});

	test("filters on the name and nothing else", async () => {
		const { chip, queryChip } = await row(created());
		expect(chip("Any name")).toBeDefined();
		expect(queryChip("Select channels")).toBeNull();
	});

	test("says what name it is matching", async () => {
		const { chip } = await row(
			created({ messageFilter: { pattern: "incident-", isRegex: false } }),
		);
		expect(chip('Matching "incident-"')).toBeDefined();
	});
});

/**
 * A row watching a channel the bot is not in — configured fine, silent
 * forever. The warning is the only thing that says so.
 */
describe("a Slack row watching a channel the bot is not in", () => {
	const warningsFor = (config: Record<string, unknown>) =>
		slackProvider.runtimeWarnings?.(config as never, {
			slack: { channels: CHANNELS },
		}) ?? [];

	test("names the channel and says who to invite", () => {
		expect(
			warningsFor(message({ channels: { mode: "list", ids: ["C1", "C2"] } })),
		).toEqual([
			"This trigger will not run for messages in #secret until @Superset is invited.",
		]);
	});

	test("stays quiet when the bot is in every channel it watches", () => {
		expect(
			warningsFor(message({ channels: { mode: "list", ids: ["C1"] } })),
		).toEqual([]);
	});

	// A new channel is announced workspace-wide, so membership is irrelevant
	// and warning about it would be noise on a trigger that works.
	test("stays quiet for channel_created", () => {
		expect(
			warningsFor({
				kind: "slack",
				event: "channel_created",
				channels: { mode: "list", ids: ["C2"] },
			}),
		).toEqual([]);
	});

	test("does not accuse a channel before the roster has arrived", () => {
		expect(
			slackProvider.runtimeWarnings?.(
				message({ channels: { mode: "list", ids: ["C2"] } }) as never,
				{},
			),
		).toEqual([]);
	});
});

/**
 * Not connected — the sentence collapses, because nothing in it could be
 * filled in:
 *
 *   ⌗ Message in channel  Requires connection      [🗑] [Connect ↗]
 */
describe("a Slack row whose integration is not connected", () => {
	const disconnected = () => row(message(), { requiresConnection: true });

	test("collapses to the name of the trigger", async () => {
		const { ui } = await disconnected();
		expect(ui.getByText("Message in channel")).toBeDefined();
	});

	test("says a connection is required and offers the fix", async () => {
		const { ui, chip } = await disconnected();
		expect(ui.getByText("Requires connection")).toBeDefined();
		expect(chip(/Connect/)).toBeDefined();
	});

	test("hides the pickers entirely", async () => {
		const { queryChip } = await disconnected();
		expect(queryChip("Select channels")).toBeNull();
		expect(queryChip("Any message")).toBeNull();
	});

	test("can still be removed", async () => {
		const { ui } = await disconnected();
		expect(ui.getByLabelText("Remove trigger")).toBeDefined();
	});
});

/**
 * A refused save marks the word it is blocked on, and only that one:
 *
 *   ⌗ [Any message ▾] from Anyone in [Select channels ▾](!)
 */
describe("a Slack row a save was refused on", () => {
	const MARK = "ring-amber-500/50";
	const refused = () =>
		row(message(), {
			problems: [{ index: 0, field: "channels", message: "Choose a channel" }],
		});

	test("marks the chip the save is blocked on", async () => {
		const { chip } = await refused();
		expect(chip("Select channels").className).toContain(MARK);
	});

	test("leaves the chips that are fine alone", async () => {
		const { chip } = await refused();
		expect(chip("Any message").className).not.toContain(MARK);
	});
});

describe("a Slack row that cannot be edited", () => {
	test("disables every word of the sentence", async () => {
		const { ui } = await row(message(), { disabled: true });
		for (const button of ui.getAllByRole("button")) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
	});
});

/**
 * The order and wording, which per-element queries cannot see: getByRole finds
 * a chip wherever it sits, so only the whole sentence catches a slot moving or
 * a connecting word changing.
 */
describe("the wording of a Slack row", () => {
	// The filter chip is the subject rather than trailing a "Message" label it
	// would collide with.
	test("a message trigger leads with the filter, then who, then where", async () => {
		const { sentence } = await row(message());
		expect(sentence).toBe(
			"Any message from Anyone in Select channels ; react with ✅ upon completion",
		);
	});

	// Actor beside its verb: at the end it read as the message's author rather
	// than the reactor's.
	test("a reaction trigger puts the actor beside its verb", async () => {
		const { sentence } = await row(reaction());
		expect(sentence).toBe(
			"Reaction Select emoji added by Anyone to a message in #general",
		);
	});

	test("a channel-created trigger filters on the name and nothing else", async () => {
		const { sentence } = await row({
			kind: "slack",
			event: "channel_created",
			messageFilter: null,
			actor: { mode: "any" },
			channels: { mode: "any" },
		});
		expect(sentence).toBe("Channel created matching Any name");
	});
});
