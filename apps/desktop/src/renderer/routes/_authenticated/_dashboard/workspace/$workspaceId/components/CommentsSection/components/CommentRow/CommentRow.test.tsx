import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { NormalizedComment } from "../../types";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { CommentRow } = await import("./CommentRow");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const comment: NormalizedComment = {
	id: "comment-1",
	authorLogin: "reviewer",
	body: "Please simplify this.",
	kind: "review",
	path: "src/app.ts",
	line: 42,
	diffSide: "LEFT",
	isResolved: false,
};

describe("review comment navigation", () => {
	test.each([
		["LEFT", "deletions"],
		["RIGHT", "additions"],
	] as const)("opens the %s side at the comment line", (diffSide, expectedSide) => {
		const onOpenInDiff = mock(() => {});
		const onOpen = mock(() => {});
		const view = render(
			<CommentRow
				comment={{ ...comment, diffSide }}
				copiedActionKey={null}
				onCopy={() => {}}
				onOpen={onOpen}
				onOpenInDiff={onOpenInDiff}
			/>,
		);
		expect(view.getByText("src/app.ts:42")).toBeTruthy();
		fireEvent.click(
			view.getByRole("button", { name: "View comment by reviewer" }),
		);
		expect(onOpenInDiff).toHaveBeenCalledWith(
			"src/app.ts",
			42,
			undefined,
			expectedSide,
		);
		expect(onOpen).not.toHaveBeenCalled();
	});
	test("opens conversation comments in a comment pane", () => {
		const onOpenInDiff = mock(() => {});
		const onOpen = mock(() => {});
		const view = render(
			<CommentRow
				comment={{
					...comment,
					kind: "conversation",
					path: undefined,
					line: undefined,
				}}
				copiedActionKey={null}
				onCopy={() => {}}
				onOpen={onOpen}
				onOpenInDiff={onOpenInDiff}
			/>,
		);
		fireEvent.click(
			view.getByRole("button", { name: "View comment by reviewer" }),
		);
		expect(onOpen).toHaveBeenCalledWith(
			expect.objectContaining({
				commentId: "comment-1",
				body: "Please simplify this.",
			}),
		);
		expect(onOpenInDiff).not.toHaveBeenCalled();
	});
});
