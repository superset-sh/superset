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

	// AE7: an API-key account is skipped at the default and eligible once its
	// rotation toggle is on.
	it("holds API-key accounts out of rotation by default", () => {
		const apiKey = account({
			accountId: "acct-c",
			accountKey: "key-c",
			credentialKind: "api_key",
			inRotation: false,
		});
		expect(isEligible(apiKey, {})).toBe(false);
		expect(isEligible(apiKey, { "acct-c": true })).toBe(true);
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
		expect(pickConsumeFirst([a, b])?.accountKey).toBe("key-b");
	});

	it("sorts accounts with no longest-period reset last", () => {
		const unknown = account({ accountKey: "key-a" });
		const known = account({
			accountKey: "key-b",
			windows: [window_("seven_day", "Weekly", 10, T0 + 2 * DAY)],
		});
		expect(pickConsumeFirst([unknown, known])?.accountKey).toBe("key-b");
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
		expect(pickConsumeFirst([scopedOnly, plainWeekly])?.accountKey).toBe(
			"key-a",
		);
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
		expect(pickConsumeFirst([b, a])?.accountKey).toBe("key-a");

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
		expect(pickConsumeFirst([soonestIsPlain, later])?.accountKey).toBe("key-a");
	});
});

describe("shouldSwitch", () => {
	const runtime = { cooldownUntil: null, activeAccountId: "acct-a" };

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
});
