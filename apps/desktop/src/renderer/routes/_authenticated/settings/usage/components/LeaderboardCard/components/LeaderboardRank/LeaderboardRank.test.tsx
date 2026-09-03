import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom is process-wide; unregister in afterAll so the shared mock
// document is restored for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const React = await import("react");
const { LeaderboardRank } = await import("./LeaderboardRank");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function membership(tokens: number) {
	return {
		handle: "kiet",
		visibility: "public" as const,
		lastPublishedAt: null,
		period: "30d" as const,
		range: { from: "2026-08-04", to: "2026-09-02" },
		tokens,
		usd: "0",
		sessions: 0,
		approximate: false,
		rank: 12,
		total: 340,
	};
}

describe("LeaderboardRank", () => {
	test("shows the rank and links to the profile and the board", () => {
		const { container, getByText } = render(
			React.createElement(LeaderboardRank, {
				membership: membership(1_500_000),
				collapsed: false,
				onToggleCollapsed: () => {},
				onManage: () => {},
			}),
		);

		expect(container.textContent).toContain("#12 of 340");
		expect(container.textContent).toContain("1.5M tokens in the last 30 days");

		const links = [...container.querySelectorAll("a")].map((a) =>
			a.getAttribute("href"),
		);
		expect(links).toContain("https://superset.sh/user/kiet");
		expect(links).toContain("https://superset.sh/leaderboard");
		expect(getByText("kiet")).toBeTruthy();
	});

	test("shows the rows above and below with the gap, and no names", () => {
		const neighbors = [
			{
				rank: 11,
				handle: "ahead",
				name: "Ada Ahead",
				tokens: 1_700_000,
				tier: 2,
			},
			{ rank: 12, handle: "kiet", name: null, tokens: 1_500_000, tier: 1 },
			{ rank: 13, handle: "behind", name: null, tokens: 1_100_000, tier: 1 },
		];
		const { container } = render(
			React.createElement(LeaderboardRank, {
				membership: membership(1_500_000),
				neighbors,
				collapsed: false,
				onToggleCollapsed: () => {},
				onManage: () => {},
			}),
		);
		const rows = [...container.querySelectorAll("li")].map((li) =>
			[...li.querySelectorAll("span, a")]
				.filter((el) => !el.querySelector("span, a"))
				.map((el) => el.textContent?.trim())
				.filter(Boolean)
				.join(" "),
		);
		expect(rows).toHaveLength(3);
		// 11 % 8 = 3, 13 % 8 = 5: aliases are stable per rank, never real names.
		expect(rows[0]).toBe("#11 Incognito Operator 1.7M");
		expect(rows[1]).toBe("#12 You 1.5M 200K to pass #11");
		expect(rows[2]).toBe("#13 Phantom Forklift 1.1M 400K behind you");
		expect(container.textContent).not.toContain("Ada Ahead");
		expect(container.textContent).not.toContain("@behind");
		// Only the user's own tier shows, and it sits with the headline rank.
		expect(container.querySelectorAll("li [class*=uppercase]")).toHaveLength(0);
		expect(container.querySelectorAll("[class*=uppercase]")).toHaveLength(1);
		expect(container.querySelector("section > div")?.textContent).toContain(
			"#12 of 340 on the leaderboardButton pusher",
		);
	});

	test("the settings button hands off to the opt-in section", () => {
		const onManage = mock(() => {});
		const { getByLabelText } = render(
			React.createElement(LeaderboardRank, {
				membership: membership(1_500_000),
				collapsed: false,
				onToggleCollapsed: () => {},
				onManage,
			}),
		);
		getByLabelText("Leaderboard settings").click();
		expect(onManage).toHaveBeenCalledTimes(1);
	});

	test("collapsed keeps the headline and actions, hides the rest", () => {
		const onToggleCollapsed = mock(() => {});
		const { container, getByLabelText } = render(
			React.createElement(LeaderboardRank, {
				membership: membership(1_500_000),
				neighbors: [{ rank: 11, tokens: 1_700_000, tier: 2 }],
				collapsed: true,
				onToggleCollapsed,
				onManage: () => {},
			}),
		);
		expect(container.textContent).toContain("#12 of 340");
		expect(container.textContent).toContain("Open leaderboard");
		expect(container.textContent).not.toContain("last 30 days");
		expect(container.querySelectorAll("li")).toHaveLength(0);
		getByLabelText("Expand").click();
		expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
	});

	test("says the user is unranked when nothing was published in the window", () => {
		const { container } = render(
			React.createElement(LeaderboardRank, {
				membership: membership(0),
				collapsed: false,
				onToggleCollapsed: () => {},
				onManage: () => {},
			}),
		);

		expect(container.textContent).toContain("not ranked yet");
		expect(container.textContent).not.toContain("#12");
	});
});
