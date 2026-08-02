import { describe, expect, test } from "bun:test";
import type { ProviderUsage } from "lib/trpc/routers/provider-usage.schema";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderUsageRow } from "./ProviderUsageRow";

const claudeProvider: ProviderUsage = {
	providerId: "claude",
	providerName: "Claude",
	status: "ok",
	accountLabel: "Max",
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
				}}
			/>,
		);

		expect(markup).toContain("Sign in with Claude CLI to see limits.");
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
});
