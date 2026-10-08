import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { observable } = await import("@trpc/server/observable");
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../providers/ChatPaneActionsProvider"
);
type OpenPage = import("../../providers/ChatPaneActionsProvider").OpenPage;
const { PageLinkCard } = await import("./PageLinkCard");

afterEach(cleanup);
const PAGE_URL = "https://app.superset.sh/page/quarterly-report-a3f9k";

const readable = {
	status: "readable",
	preview: {
		id: "page-1",
		slug: "quarterly-report-a3f9k",
		title: "Quarterly report",
		description: "Revenue, churn and pipeline",
		url: PAGE_URL,
		updatedAt: new Date(),
		thumbnailUrl: null,
		createdBy: null,
	},
} as const;

function renderLink(
	answer: () => unknown,
	actions: { openPage?: OpenPage } = { openPage: () => {} },
) {
	const asked: string[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push(call.op.path);
			try {
				observer.next({ result: { data: answer() } });
				observer.complete();
			} catch (error) {
				observer.error(TRPCClientError.from(error as Error));
			}
		});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<cloudTrpc.Provider
			client={cloudTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<ChatPaneActionsProvider openPage={actions.openPage}>
				<PageLinkCard slug="quarterly-report-a3f9k" url={PAGE_URL} />
			</ChatPaneActionsProvider>
		</cloudTrpc.Provider>,
	);
	const settled = () =>
		waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
			expect(asked.length).toBeGreaterThan(0);
		});
	return { asked, settled, view };
}

describe("PageLinkCard", () => {
	test("shows the card for a page the reader can open, and opens it on click", async () => {
		const openPage = mock<OpenPage>(() => {});
		const { asked, view } = renderLink(() => readable, { openPage });
		expect(view.container.innerHTML).toBe("");

		const card = await view.findByRole("button");
		expect(card.textContent).toContain("Quarterly report");
		expect(asked).toEqual(["page.preview"]);

		fireEvent.click(card, { metaKey: true });
		expect(openPage).toHaveBeenCalledTimes(1);
		expect(openPage.mock.calls[0]?.[0]).toBe(PAGE_URL);
		expect(openPage.mock.calls[0]?.[1]).toHaveProperty("metaKey", true);
	});

	test.each([
		["a missing page", () => ({ status: "missing" })],
		["a page that needs its owner", () => ({ status: "needs_user" })],
		[
			"a failed lookup",
			() => {
				throw new Error("Failed to fetch");
			},
		],
	])("renders nothing for %s", async (_name, answer) => {
		const { settled, view } = renderLink(answer);
		await settled();
		expect(view.container.innerHTML).toBe("");
	});

	test("asks for nothing where the chat cannot open a page", async () => {
		const { asked, view } = renderLink(() => readable, {});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(asked).toEqual([]);
		expect(view.container.innerHTML).toBe("");
	});
});
