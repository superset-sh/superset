import { describe, expect, it } from "bun:test";
import type { UsageQuotaWindow } from "../trpc/router/usage/types.ts";
import {
	type DecisionAccount,
	isEligible,
	isNearLimit,
	pickBest,
	pickConsumeFirst,
	scoreAccount,
	shouldSwitch,
	worstWindow,
} from "./decision.ts";
import { defaultAutoSwitchSettings } from "./engine-state.ts";
import type { AutoSwitchSettings } from "./types.ts";

const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function window_(
	id: string,
	label: string,
	usedPercent: number,
	resetsAt: number | null = null,
): UsageQuotaWindow {
	return {
		id,
		label,
		usedPercent,
		resetsAt: resetsAt === null ? null : new Date(resetsAt),
	};
}

/** A provider `resets_at` that did not parse: `getTime()` is NaN. */
function invalidResetWindow_(
	id: string,
	label: string,
	usedPercent: number,
): UsageQuotaWindow {
	return { id, label, usedPercent, resetsAt: new Date("not-a-date") };
}

function account(over: Partial<DecisionAccount> = {}): DecisionAccount {
	return {
		agent: "claude",
		accountId: "acct-a",
		accountKey: "key-a",
		selection: "/profiles/a",
		label: "work",
		credentialKind: "subscription",
		inRotation: true,
		managed: true,
		tokenState: "ok",
		windows: [
			window_("five_hour", "Session (5h)", 10),
			window_("seven_day", "Weekly", 20),
		],
		...over,
	};
}

function settings(over: Partial<AutoSwitchSettings> = {}): AutoSwitchSettings {
	return { ...defaultAutoSwitchSettings(), enabled: true, ...over };
}

describe("scoreAccount", () => {
	it("is the minimum headroom across the account-wide windows", () => {
		const claude = account({
			windows: [
				window_("five_hour", "Session (5h)", 91),
				window_("seven_day", "Weekly", 30),
			],
		});
		expect(scoreAccount(claude, [])).toBe(9);

		const codex = account({
			agent: "codex",
			windows: [
				window_("primary", "5h", 40),
				window_("secondary", "Weekly", 75),
			],
		});
		expect(scoreAccount(codex, [])).toBe(25);
	});

	it("ignores model windows that are not configured", () => {
		const row = account({
			windows: [
				window_("five_hour", "Session (5h)", 40),
				window_("seven_day", "Weekly", 40),
				window_("weekly_scoped:Fable", "Weekly · Fable", 100),
			],
		});
		expect(scoreAccount(row, [])).toBe(60);
	});

	// AE5: model window "Fable" at 100% while the account-wide windows are at
	// 40% makes the account near its limit.
	it("folds a configured model window in, matched case-insensitively", () => {
		const row = account({
			windows: [
				window_("five_hour", "Session (5h)", 40),
				window_("seven_day", "Weekly", 40),
				window_("weekly_scoped:Fable", "Weekly · Fable", 100),
			],
		});
		expect(scoreAccount(row, ["fable"])).toBe(0);
		expect(isNearLimit(scoreAccount(row, ["FABLE"]), 90)).toBe(true);
	});

	it("scores an account with no windows as fully available", () => {
		expect(scoreAccount(account({ windows: [] }), [])).toBe(100);
	});

	it("names the window that drove the score", () => {
		const row = account({
			windows: [
				window_("five_hour", "Session (5h)", 91),
				window_("seven_day", "Weekly", 30),
			],
		});
		expect(worstWindow(row, [])?.id).toBe("five_hour");
	});
});

describe("isNearLimit", () => {
	it("is true at or under the headroom the threshold leaves", () => {
		expect(isNearLimit(10, 90)).toBe(true);
		expect(isNearLimit(9, 90)).toBe(true);
		expect(isNearLimit(11, 90)).toBe(false);
	});
});

describe("isEligible", () => {
	it("keeps a stale access token eligible and scores it from last-known windows", () => {
		const stale = account({ tokenState: "token_stale" });
		expect(isEligible(stale, {})).toBe(true);
		expect(scoreAccount(stale, [])).toBe(80);
	});

	it("never picks an expired or signed-out login", () => {
		expect(isEligible(account({ tokenState: "token_expired" }), {})).toBe(
			false,
		);
		expect(isEligible(account({ tokenState: "signed_out" }), {})).toBe(false);
	});

	// An unreadable quota reports no windows, which scores a full 100 headroom
	// — the account an automatic switch would land on. It stays manual-only.
	it("refuses an account whose quota could not be read", () => {
		const unreadable = account({ tokenState: "unavailable", windows: [] });
		expect(scoreAccount(unreadable, [])).toBe(100);
		expect(isEligible(unreadable, {})).toBe(false);
		expect(isEligible(unreadable, { "claude:acct-a": true })).toBe(false);
	});

	// API billing remains manual-only even with a saved rotation override.
	it("holds API-key accounts out of rotation even with an override", () => {
		const apiKey = account({
			accountId: "acct-c",
			accountKey: "key-c",
			credentialKind: "api_key",
			inRotation: false,
		});
		expect(isEligible(apiKey, {})).toBe(false);
		expect(isEligible(apiKey, { "acct-c": true })).toBe(false);
	});

	// R16: the spelling the renderer writes and the router stores is
	// accountRotationKey — `${agent}:${accountId ?? selection ?? "default"}`.
	it("reads the toggle under the key the router actually writes", () => {
		expect(
			isEligible(account({ inRotation: true }), { "claude:acct-a": false }),
		).toBe(false);
		expect(
			isEligible(
				account({ accountId: null, selection: null, inRotation: false }),
				{ "claude:default": true },
			),
		).toBe(true);
	});

	// A hand-exported CLAUDE_CONFIG_DIR is Superset's to read, never to write,
	// so it never becomes a switch target — the rotation file cannot override
	// that the way it overrides the account's own flag.
	it("never picks a login Superset does not manage", () => {
		expect(isEligible(account({ managed: false }), {})).toBe(false);
		expect(
			isEligible(account({ managed: false }), { "claude:acct-a": true }),
		).toBe(false);
	});

	it("still honours the legacy bare-id and account-key spellings", () => {
		expect(isEligible(account({ inRotation: true }), { "acct-a": false })).toBe(
			false,
		);
		expect(isEligible(account({ inRotation: false }), { "key-a": true })).toBe(
			true,
		);
	});

	// A Codex home whose `auth.json` carries no `account_id` files its toggle
	// under the selection; the next auth refresh writes the identity and the
	// key becomes `codex:acct-x`. The account the user excluded must not walk
	// back into rotation on that poll.
	it("still honours a toggle filed under the selection before the identity was known", () => {
		const codex = account({
			agent: "codex",
			accountId: "acct-x",
			accountKey: "/home/u/.codex2/auth.json",
			selection: "/home/u/.codex2",
			credentialKind: "subscription",
			inRotation: true,
			windows: [
				window_("primary", "5h", 10),
				window_("secondary", "Weekly", 20),
			],
		});
		expect(isEligible(codex, { "codex:/home/u/.codex2": false })).toBe(false);
		expect(
			isEligible(
				{ ...codex, inRotation: false },
				{ "codex:/home/u/.codex2": true },
			),
		).toBe(true);
	});

	// The system-default login has neither an id nor a selection, so its toggle
	// is filed under `claude:default` — and a read of ~/.claude.json that
	// failed once reports no id at all. Once the identity is read the key
	// becomes `claude:acct-x`, and the account the user excluded must not walk
	// back into rotation on that poll.
	it("still honours a toggle filed under the default key before the identity was known", () => {
		const identified = account({ accountId: "acct-x", selection: null });
		expect(isEligible({ ...identified, inRotation: true }, {})).toBe(true);
		expect(
			isEligible(
				{ ...identified, inRotation: true },
				{
					"claude:default": false,
				},
			),
		).toBe(false);
		expect(
			isEligible(
				{ ...identified, inRotation: false },
				{
					"claude:default": true,
				},
			),
		).toBe(true);
	});
});

describe("pickBest", () => {
	it("takes the highest-scoring account", () => {
		const low = account({ accountKey: "key-a", windows: [] });
		const high = account({
			accountKey: "key-b",
			windows: [window_("five_hour", "Session (5h)", 5)],
		});
		expect(pickBest([low, high], [])?.accountKey).toBe("key-a");
		expect(
			pickBest([high, account({ accountKey: "key-c", windows: [] })], [])
				?.accountKey,
		).toBe("key-c");
	});
});

describe("pickConsumeFirst", () => {
	// AE4: A's weekly resets in 5 days, B's in 6 hours — B drains first.
	it("orders by the soonest reset of the longest-period window", () => {
		const a = account({
			accountKey: "key-a",
			windows: [
				window_("five_hour", "Session (5h)", 40),
				window_("seven_day", "Weekly", 40, T0 + 5 * DAY),
			],
		});
		const b = account({
			accountKey: "key-b",
			windows: [
				window_("five_hour", "Session (5h)", 50),
				window_("seven_day", "Weekly", 50, T0 + 6 * HOUR),
			],
		});
		expect(pickConsumeFirst([a, b], T0)?.accountKey).toBe("key-b");
	});

	it("sorts accounts with no longest-period reset last", () => {
		const unknown = account({ accountKey: "key-a" });
		const known = account({
			accountKey: "key-b",
			windows: [window_("seven_day", "Weekly", 10, T0 + 2 * DAY)],
		});
		expect(pickConsumeFirst([unknown, known], T0)?.accountKey).toBe("key-b");
	});

	// Some Claude plans report the weekly period only per model. Ignoring
	// `weekly_scoped:` left consume-first with no reset to rank those accounts
	// by, so every one of them sorted last and the strategy did nothing.
	it("ranks a Claude account by its scoped weekly window when that is all it has", () => {
		const scopedOnly = account({
			accountKey: "key-a",
			windows: [
				window_("five_hour", "Session (5h)", 40, T0 + HOUR),
				window_("weekly_scoped:Fable", "Weekly · Fable", 40, T0 + 6 * HOUR),
			],
		});
		const plainWeekly = account({
			accountKey: "key-b",
			windows: [window_("seven_day", "Weekly", 40, T0 + 5 * DAY)],
		});
		expect(
			pickConsumeFirst([scopedOnly, plainWeekly], T0, ["Fable"])?.accountKey,
		).toBe("key-a");
	});

	// Every reset unknown ties every candidate at Infinity. Picking nobody
	// there told the engine the agent was exhausted while an account with a
	// full session window was sitting right next to it.
	it("still picks a candidate when no account reports a reset", () => {
		const b = account({
			accountKey: "key-b",
			windows: [window_("five_hour", "Session (5h)", 20)],
		});
		const a = account({
			accountKey: "key-a",
			windows: [window_("five_hour", "Session (5h)", 30)],
		});
		expect(pickConsumeFirst([b, a], T0)?.accountKey).toBe("key-a");

		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("five_hour", "Session (5h)", 20)],
				}),
			],
			rotation: {},
			runtime: { cooldownUntil: null, activeAccountId: "acct-a" },
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountId).toBe("acct-b");
	});

	it("takes the soonest across the plain and scoped weekly windows", () => {
		const soonestIsPlain = account({
			accountKey: "key-a",
			windows: [
				window_("seven_day", "Weekly", 40, T0 + 2 * DAY),
				window_("weekly_scoped:Fable", "Weekly · Fable", 40, T0 + 5 * DAY),
			],
		});
		const later = account({
			accountKey: "key-b",
			windows: [window_("seven_day", "Weekly", 40, T0 + 3 * DAY)],
		});
		expect(
			pickConsumeFirst([soonestIsPlain, later], T0, ["Fable"])?.accountKey,
		).toBe("key-a");
	});
});

describe("shouldSwitch", () => {
	const runtime = { cooldownUntil: null, activeAccountId: "acct-a" };

	for (const [id, model] of [
		["weekly_scoped:Fable", "Fable"],
		["seven_day_sonnet", "Sonnet"],
	] as const) {
		it(`consume-first ignores unconfigured ${id} reset times`, () => {
			const input = {
				active: account({
					windows: [window_("seven_day", "Weekly", 40, T0 + 5 * DAY)],
				}),
				candidates: [
					account({
						accountId: "acct-b",
						accountKey: "key-b",
						windows: [
							window_("seven_day", "Weekly", 40, T0 + 6 * DAY),
							window_(id, model, 40, T0 + HOUR),
						],
					}),
				],
				rotation: {},
				runtime,
				now: T0,
			};
			expect(
				shouldSwitch({
					...input,
					settings: settings({ strategy: "consume-first" }),
				}),
			).toEqual({ switch: false, allExhausted: false });
			expect(
				shouldSwitch({
					...input,
					settings: settings({
						strategy: "consume-first",
						modelWindows: [model],
					}),
				}),
			).toMatchObject({ switch: true, reasonKind: "strategy" });
		});
	}

	// An API-billed login reports no windows, and no windows scores a full
	// 100 — the same "zero windows is not headroom" hazard isEligible already
	// guards for an unreadable account. Without this the engine moves onto
	// per-token billing while the paid plan still has room, and can never move
	// back, because nothing can beat 100 by the margin.
	const metered = () =>
		account({
			accountId: "acct-api",
			accountKey: "key-api",
			selection: "/profiles/api",
			credentialKind: "api_key",
			windows: [],
		});

	for (const strategy of ["best", "consume-first"] as const) {
		it(`${strategy} leaves an active API account selected`, () => {
			for (const tokenState of ["ok", "signed_out"] as const) {
				expect(
					shouldSwitch({
						settings: settings({ strategy }),
						active: { ...metered(), tokenState },
						candidates: [
							account({
								windows: [window_("seven_day", "Weekly", 10, T0 + DAY)],
							}),
						],
						rotation: {},
						runtime,
						now: T0,
					}),
				).toEqual({ switch: false, allExhausted: false });
			}
		});
	}

	it("never moves onto a metered account proactively", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 20)],
			}),
			candidates: [metered()],
			rotation: { "key-api": true },
			runtime,
			now: 0,
		});

		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	it("prefers a plan account over a metered one", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [
				metered(),
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					selection: "/profiles/b",
					windows: [window_("five_hour", "Session (5h)", 40)],
				}),
			],
			rotation: { "key-api": true, "key-b": true },
			runtime,
			now: 0,
		});

		expect(decision.switch).toBe(true);
		if (!decision.switch) throw new Error("expected a switch");
		expect(decision.target.accountKey).toBe("key-b");
	});

	// Automatic switching never changes billing modes.
	it("stays exhausted when only a metered account has room", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [metered()],
			rotation: { "key-api": true },
			runtime,
			now: 0,
		});

		expect(decision).toEqual({ switch: false, allExhausted: true });
	});

	// A stale access token skips the usage endpoint, and with no earlier read
	// to carry from it lands on zero windows — a full 100, the same hazard as
	// the metered login, on an account nobody could read.
	const staleUnread = () =>
		account({
			accountId: "acct-stale",
			accountKey: "key-stale",
			selection: "/profiles/stale",
			tokenState: "token_stale",
			windows: [],
		});

	it("never moves onto an unread stale account over one it can score", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 20)],
			}),
			candidates: [
				staleUnread(),
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					selection: "/profiles/b",
					windows: [window_("five_hour", "Session (5h)", 5)],
				}),
			],
			rotation: { "key-stale": true, "key-b": true },
			runtime,
			now: 0,
		});

		expect(decision).toMatchObject({ switch: true, reasonKind: "strategy" });
		expect(decision.switch && decision.target.accountKey).toBe("key-b");
	});

	// Last resort, not never: at the limit with nothing else left, an account
	// we could not read beats stopping.
	it("takes an unread stale account when nothing scorable has room", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [staleUnread()],
			rotation: { "key-stale": true },
			runtime,
			now: 0,
		});

		expect(decision.switch).toBe(true);
		if (!decision.switch) throw new Error("expected a switch");
		expect(decision.target.accountKey).toBe("key-stale");
		expect(decision.reasonKind).toBe("threshold");
	});

	// The metered login has no reset either, so it ties the plan account's
	// absent weekly window at Infinity and wins the accountKey tie-break.
	it("consume-first: prefers a plan account over a metered one", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [
				metered(),
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					selection: "/profiles/b",
					windows: [window_("five_hour", "Session (5h)", 40)],
				}),
			],
			rotation: { "key-api": true, "key-b": true },
			runtime,
			now: T0,
		});

		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountKey).toBe("key-b");
	});

	// consume-first ranks by the longest window's reset, and an account nobody
	// could read has none: it ties the readable account's absent weekly window
	// at Infinity and wins the accountKey tie-break, moving the user onto an
	// unread login while 80 points of headroom sit next to it.
	it("consume-first: prefers an account it can read over an unread stale one", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [
				staleUnread(),
				account({
					accountId: "acct-z",
					accountKey: "key-z",
					selection: "/profiles/z",
					windows: [window_("five_hour", "Session (5h)", 20)],
				}),
			],
			rotation: { "key-stale": true, "key-z": true },
			runtime,
			now: T0,
		});

		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountKey).toBe("key-z");
	});

	// The two last resorts are ordered, not one bucket: an unrankable plan
	// account still beats per-token billing. Folding them into a single
	// predicate leaves both unranked and lets the accountKey tie-break put the
	// user on the metered login.
	it("consume-first: drains an unread plan account before a metered one", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [metered(), staleUnread()],
			rotation: { "key-api": true, "key-stale": true },
			runtime,
			now: T0,
		});

		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountKey).toBe("key-stale");
	});

	// Mirror of the consume-first case: `best` ties every unrankable candidate at
	// 100, so without the metered tier the accountKey tie-break puts the user on
	// per-token billing while an unread plan login was available.
	it("best: takes an unread plan account before a metered one", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [metered(), staleUnread()],
			rotation: { "key-api": true, "key-stale": true },
			runtime,
			now: T0,
		});

		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountKey).toBe("key-stale");
	});

	// One window, and it is scoped to a model the user did not configure, so
	// nothing scores it: a full 100 that beats every account we can read, from
	// an account whose usage we know nothing about.
	it("never moves onto an account whose only window is an unconfigured model's", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 20)],
			}),
			candidates: [
				account({
					accountId: "acct-scoped",
					accountKey: "key-scoped",
					selection: "/profiles/scoped",
					windows: [window_("weekly_scoped:Fable", "Weekly · Fable", 0)],
				}),
			],
			rotation: { "key-scoped": true },
			runtime,
			now: 0,
		});

		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	// Mirror of the case above: the last-resort tier is a fallback, not a gate,
	// so with that account as the only candidate consume-first is handed it too
	// — and its scoped weekly window is a reset it ranks by, which beats the
	// active account's unknown one and would carry the proactive move.
	it("consume-first: never moves onto an account whose only window is an unconfigured model's", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 20)],
			}),
			candidates: [
				account({
					accountId: "acct-scoped",
					accountKey: "key-scoped",
					selection: "/profiles/scoped",
					windows: [
						window_("weekly_scoped:Fable", "Weekly · Fable", 0, T0 + DAY),
					],
				}),
			],
			rotation: { "key-scoped": true },
			runtime,
			now: T0,
		});

		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	it("stays put while auto-switch is off", () => {
		const decision = shouldSwitch({
			settings: settings({ enabled: false }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 99)],
			}),
			candidates: [account({ accountId: "acct-b", accountKey: "key-b" })],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision.switch).toBe(false);
	});

	// AE6: a switch 2 minutes ago with a 5-minute cooldown blocks the next one.
	it("stays put during the cooldown", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 99)],
			}),
			candidates: [account({ accountId: "acct-b", accountKey: "key-b" })],
			rotation: {},
			runtime: { cooldownUntil: T0 + 3 * 60_000, activeAccountId: "acct-a" },
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	it("best: moves off an account at the threshold regardless of the margin", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 91)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					label: "personal",
					windows: [window_("five_hour", "Session (5h)", 85)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({
			switch: true,
			reasonKind: "threshold",
			windowId: "five_hour",
			usedPercent: 91,
		});
		expect(decision.switch && decision.target.accountId).toBe("acct-b");
	});

	it("best: will not make a proactive move that misses the margin", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 80)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("five_hour", "Session (5h)", 85)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	it("best: makes a proactive move that meets the margin exactly", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 80)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("five_hour", "Session (5h)", 70)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "strategy" });
	});

	it("best: never lands on an account that is itself at the threshold", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 95)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("five_hour", "Session (5h)", 92)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: true });
	});

	// AE9: every in-rotation account at or over the threshold.
	it("reports the all-exhausted outcome instead of switching", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 96)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("five_hour", "Session (5h)", 99)],
				}),
				account({
					accountId: "acct-c",
					accountKey: "key-c",
					tokenState: "token_expired",
					windows: [window_("five_hour", "Session (5h)", 1)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: true });
	});

	// The ACTIVE account's own token, which the decision never used to read. An
	// expired or signed-out login reports no windows, and no windows scores a
	// full 100: never near its limit, and unbeatable by the margin, so the
	// agent stayed pinned to the one account it could not use.
	it("moves off an active login whose token has expired", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({ tokenState: "token_expired", windows: [] }),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					selection: "/profiles/b",
					windows: [window_("five_hour", "Session (5h)", 10)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});

		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		if (!decision.switch) throw new Error("expected a switch");
		expect(decision.target.accountKey).toBe("key-b");
	});

	it("reports all-exhausted when the signed-out active has nowhere to go", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({ tokenState: "signed_out", windows: [] }),
			candidates: [],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: true });
	});

	// That guard is deliberately narrower than isEligible's three states, and
	// these two tests are what keep it that way. For a CANDIDATE, unreadable
	// means "do not gamble on it"; for the SOURCE, it means "do not act on an
	// absence of data". A stale access token is the self-healing case — the CLI
	// renews it from a still-valid refresh token on its next run — and
	// `unavailable` is any non-2xx from the usage endpoint, so treating either
	// as unusable would move users off a perfectly healthy active account.
	const activeWithToken = (tokenState: DecisionAccount["tokenState"]) =>
		shouldSwitch({
			settings: settings(),
			active: account({
				tokenState,
				windows: [window_("five_hour", "Session (5h)", 20)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					selection: "/profiles/b",
					windows: [window_("five_hour", "Session (5h)", 40)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});

	it("stays on an active login whose access token is merely stale", () => {
		expect(activeWithToken("token_stale")).toEqual({
			switch: false,
			allExhausted: false,
		});
		expect(activeWithToken("token_stale")).toEqual(activeWithToken("ok"));
	});

	it("stays on an active login whose quota read did not land", () => {
		expect(activeWithToken("unavailable")).toEqual({
			switch: false,
			allExhausted: false,
		});
		expect(activeWithToken("unavailable")).toEqual(activeWithToken("ok"));
	});

	// AE4 end to end.
	it("consume-first: switches below the threshold to the sooner reset", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [
					window_("five_hour", "Session (5h)", 40),
					window_("seven_day", "Weekly", 40, T0 + 5 * DAY),
				],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						window_("five_hour", "Session (5h)", 50),
						window_("seven_day", "Weekly", 50, T0 + 6 * HOUR),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "strategy" });
		expect(decision.switch && decision.target.accountId).toBe("acct-b");
	});

	// R12: the account whose weekly window comes back first is the one to
	// drain, so a healthy pair must not swap on every cooldown expiry.
	it("consume-first: stays when the active account resets sooner", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [
					window_("five_hour", "Session (5h)", 40),
					window_("seven_day", "Weekly", 40, T0 + 6 * HOUR),
				],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						window_("five_hour", "Session (5h)", 30),
						window_("seven_day", "Weekly", 30, T0 + 5 * DAY),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	it("consume-first: still moves off an account at the threshold", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [
					window_("five_hour", "Session (5h)", 95),
					window_("seven_day", "Weekly", 40, T0 + 6 * HOUR),
				],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						window_("five_hour", "Session (5h)", 30),
						window_("seven_day", "Weekly", 30, T0 + 5 * DAY),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountId).toBe("acct-b");
	});

	it("consume-first: skips an account whose own score is under the margin", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("seven_day", "Weekly", 40, T0 + 5 * DAY)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("seven_day", "Weekly", 95, T0 + 6 * HOUR)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	// A candidate that is itself at the threshold is one the engine would have
	// to leave again on the next evaluation, and it still resets sooner, so the
	// pair would swap back and forth on every cooldown expiry.
	it("consume-first: skips an account already at the threshold", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("seven_day", "Weekly", 50, T0 + 5 * DAY)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("seven_day", "Weekly", 90, T0 + DAY)],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: false });
	});

	it("skips candidates held out of rotation", () => {
		const decision = shouldSwitch({
			settings: settings(),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 99)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [window_("five_hour", "Session (5h)", 1)],
				}),
			],
			rotation: { "claude:acct-b": false },
			runtime,
			now: T0,
		});
		expect(decision).toEqual({ switch: false, allExhausted: true });
	});

	// An unparseable `resets_at` made longestPeriodResetAt return NaN, and NaN
	// loses every comparison in pickConsumeFirst — the account was never picked
	// and the user was told every account was spent while this one had room.
	it("consume-first: still switches onto an account whose weekly reset did not parse", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 99)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						window_("five_hour", "Session (5h)", 10),
						invalidResetWindow_("seven_day", "Weekly", 10),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountId).toBe("acct-b");
	});

	// The unparseable window is listed first, so it must not stand in for the
	// sibling that does report a reset on the same account.
	it("consume-first: an unparseable reset does not poison a good sibling window", () => {
		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first", modelWindows: ["Opus"] }),
			active: account({
				windows: [window_("seven_day", "Weekly", 40, T0 + 5 * DAY)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						invalidResetWindow_("seven_day", "Weekly", 30),
						window_("weekly_scoped:opus", "Weekly (Opus)", 30, T0 + 6 * HOUR),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "strategy" });
		expect(decision.switch && decision.target.accountId).toBe("acct-b");
	});

	// A cached `resets_at` that has already elapsed — a carried window from a
	// token_stale account, or the gap between a reset and the next poll — used
	// to read as "resets soonest" and win, so the engine drained the account it
	// had the least fresh data about.
	it("consume-first: an elapsed weekly reset sorts last instead of soonest", () => {
		const stay = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [
					window_("five_hour", "Session (5h)", 40),
					window_("seven_day", "Weekly", 40, T0 + 2 * HOUR),
				],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						window_("five_hour", "Session (5h)", 10),
						window_("seven_day", "Weekly", 10, T0 - 8 * DAY),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(stay).toEqual({ switch: false, allExhausted: false });

		const decision = shouldSwitch({
			settings: settings({ strategy: "consume-first" }),
			active: account({
				windows: [window_("five_hour", "Session (5h)", 99)],
			}),
			candidates: [
				account({
					accountId: "acct-b",
					accountKey: "key-b",
					windows: [
						window_("five_hour", "Session (5h)", 10),
						window_("seven_day", "Weekly", 10, T0 - 8 * DAY),
					],
				}),
				account({
					accountId: "acct-c",
					accountKey: "key-c",
					windows: [
						window_("five_hour", "Session (5h)", 10),
						window_("seven_day", "Weekly", 10, T0 + 2 * HOUR),
					],
				}),
			],
			rotation: {},
			runtime,
			now: T0,
		});
		expect(decision).toMatchObject({ switch: true, reasonKind: "threshold" });
		expect(decision.switch && decision.target.accountId).toBe("acct-c");
	});
});
