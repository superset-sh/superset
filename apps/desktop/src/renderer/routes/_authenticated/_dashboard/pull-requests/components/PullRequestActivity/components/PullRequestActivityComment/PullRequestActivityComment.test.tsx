import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { PullRequestDetailComment } from "../../../../hooks/usePullRequestDetail";
import { PullRequestActivityReplyProvider } from "../../../../providers/PullRequestActivityReplyProvider";
import { PullRequestActivityComment } from "./PullRequestActivityComment";

afterEach(() => {
	window.getSelection()?.removeAllRanges();
	cleanup();
});

const comment: PullRequestDetailComment = {
	id: "c1",
	kind: "comment",
	author: { login: "maya", name: null },
	body: "Please rename the hook.\n\nAnd add a test for it.",
	createdAt: "2026-10-03T10:00:00Z",
	reviewState: null,
	url: "https://github.com/example/repo/pull/1#issuecomment-1",
};
const target = { projectId: "p1", hostUrl: "http://host.test", prNumber: 1 };

function renderComment(canReply: boolean) {
	const view = render(
		<QueryClientProvider client={new QueryClient()}>
			<PullRequestActivityReplyProvider value={canReply ? target : null}>
				<PullRequestActivityComment
					comment={comment}
					prUrl="https://github.com/example/repo/pull/1"
				/>
			</PullRequestActivityReplyProvider>
		</QueryClientProvider>,
	);
	return {
		view,
		clickReply: () =>
			fireEvent.click(view.getByRole("button", { name: "Reply" })),
		replyBox: () => view.queryByRole("textbox") as HTMLTextAreaElement | null,
	};
}

function select(text: Node, start: number, end: number) {
	const range = document.createRange();
	range.setStart(text, start);
	range.setEnd(text, end);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

describe("replying to a conversation comment", () => {
	test("Reply opens a box under the comment that starts from a quote of it", () => {
		const { view, clickReply, replyBox } = renderComment(true);
		expect(replyBox()).toBeNull();
		clickReply();
		const box = replyBox();
		if (!box) throw new Error("no reply box");
		const body = view.getByText("Please rename the hook.");
		expect(
			Boolean(
				body.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
			),
		).toBe(true);
		expect(body.closest("article")?.contains(box)).toBe(false);
		expect(box.value.startsWith("> Please rename the hook.")).toBe(true);
		expect(box.value).toContain("And add a test for it.");
		expect(box.value.endsWith("\n\n")).toBe(true);
		expect(document.activeElement).toBe(box);
	});

	test("a selection inside the comment is what gets quoted, and a later one joins the open box", () => {
		const { view, clickReply, replyBox } = renderComment(true);
		const text = view.getByText("And add a test for it.").firstChild;
		if (!text) throw new Error("no text node to select");
		select(text, 4, 14);
		clickReply();
		expect(replyBox()?.value).toBe("> add a test\n\n");
		select(text, 15, 21);
		clickReply();
		expect(view.getAllByRole("textbox")).toHaveLength(1);
		expect(replyBox()?.value).toBe("> add a test\n\n> for it\n\n");
	});

	test("Cancel closes the box, and Reply again starts over", () => {
		const { view, clickReply, replyBox } = renderComment(true);
		clickReply();
		fireEvent.click(view.getByRole("button", { name: "Cancel" }));
		expect(replyBox()).toBeNull();
		clickReply();
		expect(replyBox()?.value.startsWith("> Please rename the hook.")).toBe(
			true,
		);
	});

	test("where nothing can take a reply, Reply opens the comment on GitHub", () => {
		const { view } = renderComment(false);
		expect(view.queryByRole("button", { name: "Reply" })).toBeNull();
		expect(view.getByRole("link", { name: "Reply" })).toHaveProperty(
			"href",
			comment.url,
		);
	});
});
