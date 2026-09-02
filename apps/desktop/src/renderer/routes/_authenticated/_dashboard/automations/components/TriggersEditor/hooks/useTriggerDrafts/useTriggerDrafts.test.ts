import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useTriggerDrafts } = await import("./useTriggerDrafts");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * When the editor may write, and what it says while it may not.
 *
 *   ┌ Triggers ─────────────────── Discard   Save triggers ┐
 *   │  rows…                                               │
 *   └──────────────────────────────────────────────────────┘
 *
 * The set saves on request rather than as you type, because a trigger is
 * invalid the moment it is added and the API rejects the whole set: autosaving
 * meant a new row was saved, refused, and dropped on the next render.
 */

/** Valid: an hourly schedule needs nothing filled in. */
const schedule = (id?: string) => ({
	...(id ? { id } : {}),
	config: {
		kind: "schedule" as const,
		rrule: "FREQ=HOURLY",
		dtstart: "2026-01-01T00:00:00.000Z",
		timezone: "UTC",
	},
});

/** Invalid until a repository is chosen, which is how every GitHub row starts. */
const unfinishedGithub = () => ({
	config: {
		kind: "github" as const,
		event: "pull_request.opened",
		repositories: { mode: "list" as const, ids: [] as string[] },
		branches: { mode: "any" as const },
		labels: { mode: "any" as const },
		actor: { mode: "any" as const },
		includeForks: false,
	},
});

const setup = (
	triggers: unknown[] = [],
	onChange: (next: never) => undefined | Promise<unknown> = () => undefined,
) =>
	renderHook(
		({ saved }: { saved: unknown[] }) =>
			useTriggerDrafts(saved as never, onChange as never),
		{ initialProps: { saved: triggers } },
	);

describe("an editor nobody has touched", () => {
	test("is not dirty", () => {
		const { result } = setup([schedule("t1")]);
		expect(result.current.dirty).toBe(false);
	});

	test("holds the saved rows", () => {
		const { result } = setup([schedule("t1")]);
		expect(result.current.drafts).toHaveLength(1);
	});

	// The complaint must not land before the work: every trigger is incomplete
	// the instant it is added.
	test("says nothing is wrong, even about a row that could not save", () => {
		const { result } = setup([unfinishedGithub()]);
		expect(result.current.shownProblems).toEqual([]);
		expect(result.current.banner).toBeNull();
	});
});

describe("adding a row", () => {
	test("makes the editor dirty", () => {
		const { result } = setup([]);
		act(() => {
			result.current.add(schedule().config as never);
		});
		expect(result.current.dirty).toBe(true);
		expect(result.current.drafts).toHaveLength(1);
	});

	test("still says nothing is wrong until a save is attempted", () => {
		const { result } = setup([]);
		act(() => {
			result.current.add(unfinishedGithub().config as never);
		});
		expect(result.current.shownProblems).toEqual([]);
	});
});

describe("saving a valid set", () => {
	test("writes it and comes back clean", async () => {
		const onChange = mock(() => Promise.resolve());
		const { result } = setup([], onChange);
		act(() => {
			result.current.add(schedule().config as never);
		});
		await act(async () => {
			await result.current.save();
		});
		expect(onChange).toHaveBeenCalled();
		expect(result.current.dirty).toBe(false);
		expect(result.current.shownProblems).toEqual([]);
	});
});

describe("saving a set that cannot be written", () => {
	// The button is what asks for validation, so refusing to act while the set
	// is invalid would leave no way to find out why.
	test("does not write, and says what is wrong", async () => {
		const onChange = mock(() => Promise.resolve());
		const { result } = setup([unfinishedGithub()], onChange);
		await act(async () => {
			await result.current.save();
		});
		expect(onChange).not.toHaveBeenCalled();
		expect(result.current.shownProblems.length).toBeGreaterThan(0);
		expect(result.current.banner).not.toBeNull();
	});

	// They clear as each one is fixed, rather than only on the next attempt.
	test("keeps the complaints live as they are fixed", async () => {
		const { result } = setup([unfinishedGithub()]);
		await act(async () => {
			await result.current.save();
		});
		expect(result.current.shownProblems.length).toBeGreaterThan(0);

		act(() => {
			result.current.edit([schedule()] as never);
		});
		expect(result.current.shownProblems).toEqual([]);
		expect(result.current.banner).toBeNull();
	});
});

describe("a save the server refuses", () => {
	// This editor holds the only copy of the edits, and the mutation has
	// already reported why it failed.
	test("keeps the edits and stays dirty", async () => {
		const onChange = mock(() => Promise.reject(new Error("refused")));
		const { result } = setup([], onChange);
		act(() => {
			result.current.add(schedule().config as never);
		});
		await act(async () => {
			await result.current.save();
		});
		expect(result.current.drafts).toHaveLength(1);
		expect(result.current.dirty).toBe(true);
		expect(result.current.saving).toBe(false);
	});
});

describe("discarding", () => {
	test("puts the saved rows back", () => {
		const { result } = setup([schedule("t1")]);
		act(() => {
			result.current.add(schedule().config as never);
		});
		expect(result.current.drafts).toHaveLength(2);

		act(() => {
			result.current.discard();
		});
		expect(result.current.drafts).toHaveLength(1);
		expect(result.current.dirty).toBe(false);
	});

	test("clears complaints from an earlier attempt", async () => {
		const { result } = setup([schedule("t1")]);
		act(() => {
			result.current.add(unfinishedGithub().config as never);
		});
		await act(async () => {
			await result.current.save();
		});
		expect(result.current.shownProblems.length).toBeGreaterThan(0);

		act(() => {
			result.current.discard();
		});
		expect(result.current.shownProblems).toEqual([]);
	});
});

describe("the saved set changing underneath", () => {
	// It carries the ids the server assigned, so an untouched editor adopts it.
	test("is adopted when there is nothing to lose", () => {
		const { result, rerender } = setup([schedule("t1")]);
		rerender({ saved: [schedule("t1"), schedule("t2")] });
		expect(result.current.drafts).toHaveLength(2);
	});

	// Edits here were by definition never sent, so adopting would discard them.
	test("is ignored while there are unsaved edits", () => {
		const { result, rerender } = setup([schedule("t1")]);
		act(() => {
			result.current.add(schedule().config as never);
		});
		rerender({ saved: [schedule("t1"), schedule("t2"), schedule("t3")] });
		expect(result.current.drafts).toHaveLength(2);
		expect(result.current.dirty).toBe(true);
	});
});
