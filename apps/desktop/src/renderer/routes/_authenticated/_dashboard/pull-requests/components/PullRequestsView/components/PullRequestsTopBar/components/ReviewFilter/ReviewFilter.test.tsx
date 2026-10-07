import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { ReviewFilter } = await import("./ReviewFilter");
afterEach(cleanup);
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

test("native choices use current cycle and gate absent rule/team capabilities", async () => {
	let value: string | null = "reviewed-by-me";
	render(
		<ReviewFilter
			value="reviewed-by-me"
			onChange={(next) => {
				value = next;
			}}
			searchSelection={{
				mode: "gitlab",
				ready: true,
				hasGitlab: true,
				approvalRules: false,
			}}
		/>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(
			page.getByRole("button", {
				name: "Reviews: Reviewed by you in the current review cycle",
			}),
		);
	});
	expect(
		page.queryByRole("radio", {
			name: "Awaiting review from you or your team",
		}),
	).toBeNull();
	expect(
		(
			page.getByRole("radio", {
				name: /Approved with all approval rules met/,
			}) as HTMLInputElement
		).disabled,
	).toBe(true);
	expect(
		page.getByText("GitLab reviewed filters use the current review cycle."),
	).toBeTruthy();
	await act(async () => {
		fireEvent.click(page.getByRole("radio", { name: "All reviews" }));
	});
	expect(value).toBeNull();
});
test("preserves all GitHub options and disables mixed team requests with a precise reason", async () => {
	const view = render(
		<ReviewFilter
			value={null}
			onChange={() => {}}
			searchSelection={{
				mode: "github",
				ready: true,
				hasGitlab: false,
				approvalRules: true,
			}}
		/>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Reviews: All reviews" }));
	});
	expect(page.getAllByRole("radio")).toHaveLength(9);
	expect(
		(
			page.getByRole("radio", {
				name: "Awaiting review from you or your team",
			}) as HTMLInputElement
		).disabled,
	).toBe(false);
	view.rerender(
		<ReviewFilter
			value={null}
			onChange={() => {}}
			searchSelection={{
				mode: "mixed",
				ready: true,
				hasGitlab: true,
				approvalRules: true,
			}}
		/>,
	);
	expect(
		(
			page.getByRole("radio", {
				name: /Awaiting review from you or your team/,
			}) as HTMLInputElement
		).disabled,
	).toBe(true);
	expect(
		page.getByText(
			"Team review requests are unavailable for selected GitLab projects.",
		),
	).toBeTruthy();
});

test("saved unsupported native review filter stays visible and can be cleared", async () => {
	let value: string | null = "team-review-requested";
	render(
		<ReviewFilter
			value="team-review-requested"
			onChange={(next) => {
				value = next;
			}}
			searchSelection={{
				mode: "gitlab",
				ready: true,
				hasGitlab: true,
				approvalRules: false,
			}}
		/>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(
			page.getByRole("button", {
				name: "Reviews: Awaiting review from you or your team",
			}),
		);
	});
	expect(
		page.getByText(
			"Current review filter is unavailable for this selection. Choose All reviews to clear it.",
		),
	).toBeTruthy();
	await act(async () => {
		fireEvent.click(page.getByRole("radio", { name: "All reviews" }));
	});
	expect(value).toBeNull();
});

test("saved review filter while capabilities load does not show unsupported warning", async () => {
	render(
		<ReviewFilter
			value="reviewed-by-me"
			onChange={() => {}}
			searchSelection={{
				mode: "unknown",
				ready: false,
				hasGitlab: false,
				approvalRules: false,
			}}
		/>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: /Reviews:/ }));
	});
	expect(
		page.queryByText(
			"Current review filter is unavailable for this selection. Choose All reviews to clear it.",
		),
	).toBeNull();
});
