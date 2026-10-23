import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { PullRequestActivityReplyProvider } from "renderer/routes/_authenticated/_dashboard/pull-requests/providers/PullRequestActivityReplyProvider";
import type { PullRequestCommentCardProps } from "./PullRequestCommentCard";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { workspaceTrpc } = await import("@superset/workspace-client");
const { PullRequestCommentCard } = await import("./PullRequestCommentCard");

const target = {
	organizationId: "org",
	repoFullName: "example/repo",
	prNumber: 1,
};

function renderCard(
	props: Pick<
		PullRequestCommentCardProps,
		"comment" | "replies" | "onOpenInDiff"
	>,
	requestReply: ((target: { commentId: number }) => void) | null = null,
) {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<workspaceTrpc.Provider
				client={workspaceTrpc.createClient({ links: [] })}
				queryClient={queryClient}
			>
				<PullRequestActivityReplyProvider value={requestReply}>
					<PullRequestCommentCard target={target} {...props} />
				</PullRequestActivityReplyProvider>
			</workspaceTrpc.Provider>
		</QueryClientProvider>,
	);
}
afterEach(cleanup);
afterAll(async () => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const comment = {
	id: "c1",
	databaseId: 4242,
	url: "https://github.com/example/repo/pull/1#discussion_r4242",
	authorLogin: "reviewer",
	body: "Keep the **selected line** visible.\n\nRead [the context](https://github.com/example/repo/pull/1).",
	kind: "review" as const,
	path: "src/app.ts",
	line: 42,
	diffSide: "LEFT" as const,
	isResolved: false,
};
describe("review cards", () => {
	const replies = [
		{
			...comment,
			id: "c2",
			authorLogin: "author",
			body: "Fixed in the next push.",
		},
	];
	test("the header names the author and the file, and replies sit under the body", () => {
		const view = renderCard({
			comment: { ...comment, threadId: "T1" },
			replies,
		});
		const header = view.getByText("reviewer").closest("header");
		expect(header?.textContent).toContain("src/app.ts:42");
		expect(header?.textContent).not.toContain("Keep the");
		const card = header?.parentElement;
		const root = view.getByText(/Keep the/);
		const reply = view.getByText("Fixed in the next push.");
		expect(card?.contains(root)).toBe(true);
		expect(card?.contains(reply)).toBe(true);
		expect(
			Boolean(
				root.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING,
			),
		).toBe(true);
		expect(
			view.getByRole("button", { name: "Resolve conversation" }),
		).toBeTruthy();
		expect(view.queryByRole("button", { name: /Collapse/ })).toBeNull();
	});
	test("a resolved thread folds to its header until it is expanded", () => {
		const onOpenInDiff = mock(() => {});
		const view = renderCard({
			comment: { ...comment, threadId: "T1", isResolved: true },
			replies,
			onOpenInDiff,
		});
		const header = view.getByRole("button", { name: /Expand/ });
		expect(header.textContent).toContain("reviewer");
		expect(header.textContent).toContain("src/app.ts:42");
		expect(header.textContent).toContain("Resolved");
		expect(view.queryByText(/Keep the/)).toBeNull();
		expect(view.queryByText("Fixed in the next push.")).toBeNull();
		expect(view.queryByRole("button", { name: /^src\/app\.ts/ })).toBeNull();
		fireEvent.click(header);
		expect(view.getByText(/Keep the/)).toBeTruthy();
		expect(view.getByText("Fixed in the next push.")).toBeTruthy();
		expect(view.getByRole("button", { name: "Unresolve" })).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: /^src\/app\.ts/ }));
		expect(onOpenInDiff).toHaveBeenCalledWith(
			"src/app.ts",
			42,
			undefined,
			"deletions",
		);
	});
	test("renders the full comment body without making it a navigation button", () => {
		const onOpenInDiff = mock(() => {});
		const view = renderCard({ comment, onOpenInDiff });
		const body = view.getByText(/Keep the/);
		expect(body.textContent).toBe("Keep the selected line visible.");
		expect(view.getByText("selected line").tagName).toBe("STRONG");
		expect(view.getByRole("link", { name: "the context" })).toHaveProperty(
			"href",
			"https://github.com/example/repo/pull/1",
		);
		expect(body.closest("button")).toBeNull();
		fireEvent.click(body);
		expect(onOpenInDiff).not.toHaveBeenCalled();
	});
	test("an expanded card folds again when its thread becomes resolved elsewhere", () => {
		const resolved = { ...comment, threadId: "T1", isResolved: true };
		const client = workspaceTrpc.createClient({ links: [] });
		const queryClient = new QueryClient();
		const card = (next: typeof resolved) => (
			<QueryClientProvider client={queryClient}>
				<workspaceTrpc.Provider client={client} queryClient={queryClient}>
					<PullRequestCommentCard target={target} comment={next} />
				</workspaceTrpc.Provider>
			</QueryClientProvider>
		);
		const view = render(card(resolved));
		fireEvent.click(view.getByRole("button", { name: /Expand/ }));
		const rerender = (next: typeof resolved) => view.rerender(card(next));
		rerender({ ...resolved, isResolved: false });
		expect(view.getByText(/Keep the/)).toBeTruthy();
		rerender(resolved);
		expect(view.queryByText(/Keep the/)).toBeNull();
		expect(view.getByRole("button", { name: /Expand/ })).toBeTruthy();
	});
	test("Reply hands the thread to the composer, or opens GitHub when nothing can take it", () => {
		const requestReply = mock((_target: { commentId: number }) => {});
		const inline = renderCard({ comment }, requestReply);
		fireEvent.click(inline.getByRole("button", { name: "Reply" }));
		expect(requestReply).toHaveBeenCalledWith({
			commentId: 4242,
			author: { login: "reviewer", avatarUrl: undefined },
		});
		inline.unmount();
		const fallback = renderCard({ comment });
		expect(fallback.getByRole("link", { name: "Reply" })).toHaveProperty(
			"href",
			comment.url,
		);
		expect(fallback.queryByRole("button", { name: "Reply" })).toBeNull();
	});
	test.each([
		["LEFT", "deletions"],
		["RIGHT", "additions"],
	] as const)("opens the %s diff from the file link", (diffSide, side) => {
		const onOpenInDiff = mock(() => {});
		const view = renderCard({
			comment: { ...comment, diffSide },
			onOpenInDiff,
		});
		fireEvent.click(view.getByRole("button", { name: /^src\/app\.ts/ }));
		expect(onOpenInDiff).toHaveBeenCalledWith(
			"src/app.ts",
			42,
			undefined,
			side,
		);
	});
});
