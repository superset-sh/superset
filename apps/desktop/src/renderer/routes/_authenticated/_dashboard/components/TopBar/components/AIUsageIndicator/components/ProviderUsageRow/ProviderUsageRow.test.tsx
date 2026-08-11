import { describe, expect, test } from "bun:test";
import type { ProviderUsage } from "lib/trpc/routers/provider-usage.schema";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderUsageRow } from "./ProviderUsageRow";

const claudeProvider: ProviderUsage = {
	providerId: "claude",
	providerName: "Claude",
	status: "ok",
	accountLabel: "Max",
	activeAccountId: "claude:max",
	windows: [
		{
			id: "five_hour",
			label: "5 hour",
			usedPercent: 52,
			remainingPercent: 48,
			resetAt: Date.now() + 60 * 60_000,
			windowSeconds: 18_000,
		},
	],
	accounts: [
		{
			id: "claude:max",
			providerId: "claude",
			profileName: "max",
			accountLabel: "Max",
			planLabel: "Max",
			isActive: true,
			status: "ok",
			statusMessage: null,
			windows: [
				{
					id: "five_hour",
					label: "5 hour",
					usedPercent: 52,
					remainingPercent: 48,
					resetAt: Date.now() + 60 * 60_000,
					windowSeconds: 18_000,
				},
			],
		},
	],
	errorMessage: null,
};

describe("ProviderUsageRow", () => {
	test("renders remaining capacity with accessible progress semantics", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow provider={claudeProvider} />,
		);

		expect(markup).toContain("Claude");
		expect(markup).toContain("48%");
		expect(markup).toContain('role="progressbar"');
		expect(markup).toContain('aria-valuenow="48"');
		expect(markup).toContain("Resets");
		expect(markup).toContain("Connected");
		expect(markup).toContain("sr-only");
	});

	test("renders a selectable sign-in message without fabricated limits", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow
				provider={{
					...claudeProvider,
					status: "not-configured",
					windows: [],
					accounts: [],
				}}
			/>,
		);

		expect(markup).toContain("Sign in with Claude CLI to see limits.");
		expect(markup).not.toContain('role="progressbar"');
	});

	test("renders the provider error message when usage is unavailable", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow
				provider={{
					...claudeProvider,
					status: "unavailable",
					windows: [],
					accounts: [],
					errorMessage: "Claude usage is temporarily unavailable.",
				}}
			/>,
		);

		expect(markup).toContain("Claude usage is temporarily unavailable.");
		expect(markup).toContain("Temporarily unavailable");
		expect(markup).not.toContain('role="progressbar"');
	});

	test("blurs email-like account labels when email privacy is enabled", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow
				provider={{
					...claudeProvider,
					accountLabel: "person@example.com",
				}}
				blurEmails
			/>,
		);

		expect(markup).toContain("person@example.com");
		expect(markup).toContain("Email hidden");
		expect(markup).toContain("blur-[3px]");
	});

	test("keeps non-email account labels readable while email privacy is enabled", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow provider={claudeProvider} blurEmails />,
		);

		expect(markup).toContain("Max");
		expect(markup).not.toContain("Email hidden");
	});

	test("renders inactive cached accounts separately from the active account", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow
				provider={{
					...claudeProvider,
					accounts: [
						...claudeProvider.accounts,
						{
							id: "claude:team",
							providerId: "claude",
							profileName: "team",
							accountLabel: "team@example.com",
							planLabel: "Team",
							isActive: false,
							status: "cached",
							statusMessage: "cached 4m ago",
							windows: [
								{
									id: "weekly",
									label: "Weekly",
									usedPercent: 25,
									remainingPercent: 75,
									resetAt: null,
									windowSeconds: 604_800,
								},
							],
						},
					],
				}}
				blurEmails
			/>,
		);

		expect(markup).toContain("team@example.com");
		expect(markup).toContain("cached 4m ago");
		expect(markup).toContain("75%");
		expect(markup).toContain("Inactive");
	});

	test("keeps Codex account switching visible when usage is unavailable", () => {
		const markup = renderToStaticMarkup(
			<ProviderUsageRow
				provider={{
					providerId: "codex",
					providerName: "Codex",
					status: "unavailable",
					accountLabel: "second@example.com",
					activeAccountId: "codex:acct-b",
					windows: [],
					errorMessage: "Codex usage is temporarily unavailable.",
					accounts: [
						{
							id: "codex:acct-b",
							providerId: "codex",
							profileName: "second-example-com",
							accountLabel: "second@example.com",
							planLabel: "pro",
							isActive: true,
							status: "no-data",
							statusMessage: "Use Codex once to record limits",
							windows: [],
						},
						{
							id: "codex:acct-a",
							providerId: "codex",
							profileName: "first-example-com",
							accountLabel: "first@example.com",
							planLabel: "pro",
							isActive: false,
							status: "cached",
							statusMessage: "cached",
							windows: [],
						},
					],
				}}
			/>,
		);

		expect(markup).toContain("first@example.com");
		expect(markup).toContain("Switch");
		expect(markup).toContain("Codex usage is temporarily unavailable.");
		expect(markup).toContain("Temporarily unavailable");
	});
});
