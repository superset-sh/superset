import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		useUtils: () => ({
			git: { getPullRequestThreads: { invalidate: () => {} } },
		}),
		git: {
			setReviewThreadResolution: {
				useMutation: () => ({ mutate: () => {}, isPending: false }),
			},
		},
	},
}));
mock.module("renderer/components/MarkdownRenderer/components", () => ({
	SafeImage: () => null,
}));
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: { external: { copyText: { mutate: async () => {} } } },
}));
mock.module("renderer/stores", () => ({ useTheme: () => ({ type: "dark" }) }));
mock.module("renderer/components/CommentMarkdown", () => ({
	CommentMarkdown: ({ body }: { body: string }) => <p>{body}</p>,
}));
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { PullRequestCommentCard } = await import("./PullRequestCommentCard");
afterEach(cleanup);
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});
const comment = {
	id: "c1",
	authorLogin: "reviewer",
	body: "Keep the **selected line** visible.\n\nRead [the context](https://github.com/example/repo/pull/1).",
	kind: "review" as const,
	path: "src/app.ts",
	line: 42,
	diffSide: "LEFT" as const,
	isResolved: false,
};
describe("review cards", () => {
	test("renders the full comment body without making it a navigation button", () => {
		const onOpenInDiff = mock(() => {});
		const view = render(
			<PullRequestCommentCard
				workspaceId="ws"
				comment={comment}
				onOpenComment={() => {}}
				onOpenInDiff={onOpenInDiff}
			/>,
		);
		const body = view.getByText(/Keep the/);
		expect(body.textContent).toBe(comment.body);
		expect(body.closest("button")).toBeNull();
		fireEvent.click(body);
		expect(onOpenInDiff).not.toHaveBeenCalled();
	});
	test.each([
		["LEFT", "deletions"],
		["RIGHT", "additions"],
	] as const)("opens the %s diff from the file link", (diffSide, side) => {
		const onOpenInDiff = mock(() => {});
		const view = render(
			<PullRequestCommentCard
				workspaceId="ws"
				comment={{ ...comment, diffSide }}
				onOpenComment={() => {}}
				onOpenInDiff={onOpenInDiff}
			/>,
		);
		fireEvent.click(view.getByRole("button", { name: /src\/app.ts/ }));
		expect(onOpenInDiff).toHaveBeenCalledWith(
			"src/app.ts",
			42,
			undefined,
			side,
		);
	});
});
