import { afterEach, expect, mock, test } from "bun:test";
import type { UsageLimitAction } from "@superset/chat/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import {
	HOST_USAGE_QUOTA_QUERY_KEY,
	type UsageAccount,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { UsageLimitNotice } from "./UsageLimitNotice";

afterEach(cleanup);

const HOUR_MS = 60 * 60 * 1000;

function renderNotice(
	props: ComponentProps<typeof UsageLimitNotice>,
	accounts: UsageAccount[] = [],
) {
	const client = new QueryClient();
	client.setQueryData([...HOST_USAGE_QUOTA_QUERY_KEY, null], accounts);
	return render(
		<QueryClientProvider client={client}>
			<UsageLimitNotice {...props} />
		</QueryClientProvider>,
	);
}

test("while the window is closed it names the limit and model and offers to resume at the reset", () => {
	const onRespond = mock<(action: UsageLimitAction) => void>();
	const view = renderNotice({
		limit: {
			hitAtMs: Date.now(),
			resetsAtMs: Date.now() + 2 * HOUR_MS,
			window: "five_hour",
			model: "claude-sonnet-5-5",
		},
		modelLabel: "Sonnet 5.5",
		onRespond,
	});
	const text = view.container.textContent ?? "";
	expect(text).toContain("5-hour limit reached");
	expect(text).toContain("Sonnet 5.5 · Resets in 2h");
	fireEvent.click(view.getByText("Resume at reset"));
	expect(onRespond.mock.calls).toEqual([["resume_at_reset"]]);
});

test("an armed resume can be cancelled", () => {
	const onRespond = mock<(action: UsageLimitAction) => void>();
	const view = renderNotice({
		limit: {
			hitAtMs: Date.now(),
			resetsAtMs: Date.now() + HOUR_MS,
			resumeAtReset: true,
		},
		onRespond,
	});
	fireEvent.click(view.getByText("Resuming at reset"));
	expect(onRespond.mock.calls).toEqual([["cancel_resume_at_reset"]]);
});

test("once the window is open, or when no reset is known, it offers to resume now", () => {
	const onRespond = mock<(action: UsageLimitAction) => void>();
	const view = renderNotice({
		limit: { hitAtMs: Date.now() - HOUR_MS, resetsAtMs: Date.now() - 1 },
		onRespond,
	});
	expect(view.container.textContent).toContain("Limit has reset");
	fireEvent.click(view.getByText("Resume"));
	fireEvent.click(view.getByLabelText("Dismiss the usage limit notice"));
	expect(onRespond.mock.calls).toEqual([["resume"], ["dismiss"]]);

	cleanup();
	const bare = renderNotice({ limit: { hitAtMs: Date.now() }, onRespond });
	expect(bare.container.textContent).not.toContain("Resets");
	expect(bare.getByText("Resume")).toBeTruthy();
});

test("the account menu is only for agents whose logins the host can switch", () => {
	const plain = renderNotice({
		limit: { hitAtMs: Date.now() },
		onRespond: () => undefined,
	});
	expect(plain.queryByLabelText("Switch account")).toBeNull();
	cleanup();
	const claude = renderNotice({
		limit: { hitAtMs: Date.now() },
		onRespond: () => undefined,
		agent: "claude",
		hostUrl: null,
	});
	expect(claude.getByLabelText("Switch account").textContent).toBe("Account");
});

function account(selection: string | null, isDefault: boolean): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: selection ?? "system",
		sourceLabel: selection ?? "System",
		email: selection === null ? "running@example.com" : "default@example.com",
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection,
		isDefault,
		fetchedAt: new Date(),
	};
}

test("the account menu identifies the session's captured login even after the host default changes", async () => {
	const current = account(null, false);
	const next = account("/profiles/next", true);
	const view = renderNotice(
		{
			limit: { hitAtMs: 1 },
			onRespond: () => undefined,
			agent: "claude",
			hostUrl: null,
			sessionAccount: {
				agent: "claude",
				selection: null,
				credentialKind: "subscription",
				identity: "captured",
				email: "running@example.com",
			},
			onSwitchAccount: async () => undefined,
		},
		[current, next],
	);
	const trigger = view.getByLabelText("Switch account");
	expect(trigger.textContent).toBe("running@example.com");
	fireEvent.keyDown(trigger, { key: "Enter" });
	const running = await view.findByRole("menuitem", {
		name: "running@example.com",
	});
	const hostDefault = view.getByRole("menuitem", {
		name: "default@example.com",
	});
	expect(running.getAttribute("aria-disabled")).toBe("true");
	expect(hostDefault.getAttribute("aria-disabled")).not.toBe("true");
});

test("an unknown session account is not inferred from the host default", () => {
	const view = renderNotice(
		{
			limit: { hitAtMs: 1 },
			onRespond: () => undefined,
			agent: "claude",
			hostUrl: null,
		},
		[account("/profiles/next", true)],
	);
	expect(view.getByLabelText("Switch account").textContent).toBe("Account");
});
