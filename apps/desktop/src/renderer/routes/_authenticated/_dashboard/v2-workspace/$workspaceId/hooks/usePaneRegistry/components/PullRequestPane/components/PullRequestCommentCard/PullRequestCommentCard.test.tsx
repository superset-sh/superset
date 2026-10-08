import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { PullRequestCommentCardProps } from "./PullRequestCommentCard";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { QueryClient } = await import("@tanstack/react-query");
const { workspaceTrpc } = await import("@superset/workspace-client");
const { PullRequestCommentCard } = await import("./PullRequestCommentCard");

function renderCard(
	props: Pick<PullRequestCommentCardProps, "comment" | "onOpenInDiff">,
) {
	return render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [] })}
			queryClient={new QueryClient()}
		>
			<PullRequestCommentCard
				workspaceId="ws"
				onOpenComment={() => {}}
				{...props}
			/>
		</workspaceTrpc.Provider>,
	);
}
afterEach(cleanup);
afterAll(async () => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
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
	test.each([
		["LEFT", "deletions"],
		["RIGHT", "additions"],
	] as const)("opens the %s diff from the file link", (diffSide, side) => {
		const onOpenInDiff = mock(() => {});
		const view = renderCard({
			comment: { ...comment, diffSide },
			onOpenInDiff,
		});
		fireEvent.click(view.getByRole("button", { name: /src\/app.ts/ }));
		expect(onOpenInDiff).toHaveBeenCalledWith(
			"src/app.ts",
			42,
			undefined,
			side,
		);
	});
});
