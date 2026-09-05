import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom is process-wide; unregister in afterAll so the shared mock
// document is restored for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface ReplyVariables {
	workspaceId: string;
	commentId: number;
	body: string;
}
interface ReplyMutationOptions {
	onSuccess?: () => void;
	onError?: (error: Error, variables: ReplyVariables) => void;
}

const replyMutate = mock((_variables: ReplyVariables) => {});
const invalidateThreads = mock((_input: { workspaceId: string }) => {});
// The component wires its reply mutation once per render; capturing the
// options lets a test settle the request the way tRPC would.
let replyOptions: ReplyMutationOptions = {};
let replyPending = false;

mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		useUtils: () => ({
			git: { getPullRequestThreads: { invalidate: invalidateThreads } },
		}),
		git: {
			setReviewThreadResolution: {
				useMutation: () => ({ mutate: () => {}, isPending: false }),
			},
			replyToReviewThread: {
				useMutation: (options: ReplyMutationOptions) => {
					replyOptions = options;
					return { mutate: replyMutate, isPending: replyPending };
				},
			},
		},
	},
}));

// Comment bodies are irrelevant here, and the real renderer pulls in
// react-syntax-highlighter, whose CommonJS build extends React.PureComponent
// at load time. Two earlier suites replace `react` with a hooks-only stub
// for the rest of the process, so loading it from here crashes on CI.
mock.module("renderer/components/CommentMarkdown", () => ({
	CommentMarkdown: ({ body }: { body: string }) => body,
}));

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { CommentThread } = await import("./CommentThread");

beforeEach(() => {
	replyMutate.mockClear();
	invalidateThreads.mockClear();
	replyOptions = {};
	replyPending = false;
});
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const COMMENTS = [
	{ id: "c1", authorLogin: "octocat", body: "Rename this?", createdAt: 0 },
];

// `orphaned` renders a thread whose comments carry no databaseId — passing
// an explicit undefined would just trigger a default parameter.
async function setup({ orphaned = false } = {}) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<CommentThread
				workspaceId="ws-1"
				threadId="thread-1"
				isResolved={false}
				comments={COMMENTS}
				replyToCommentId={orphaned ? undefined : 555}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	const textarea = ui.getByPlaceholderText("Write a reply…");
	const replyButton = ui.getByRole("button", { name: "Reply" });
	const type = async (text: string) => {
		await act(async () => {
			fireEvent.change(textarea, { target: { value: text } });
		});
	};
	return { textarea, replyButton, type };
}

describe("CommentThread reply", () => {
	test("posts the trimmed draft onto the thread's comment and clears it", async () => {
		const { textarea, replyButton, type } = await setup();
		await type("  Looks good  ");
		await act(async () => {
			fireEvent.click(replyButton);
		});

		expect(replyMutate.mock.calls).toEqual([
			[{ workspaceId: "ws-1", commentId: 555, body: "Looks good" }],
		]);
		expect((textarea as HTMLTextAreaElement).value).toBe("");

		await act(async () => {
			replyOptions.onSuccess?.();
		});
		expect(invalidateThreads.mock.calls).toEqual([[{ workspaceId: "ws-1" }]]);
	});

	test("Cmd+Enter submits from the textarea", async () => {
		const { textarea, type } = await setup();
		await type("Ship it");
		await act(async () => {
			fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
		});

		expect(replyMutate).toHaveBeenCalledTimes(1);
	});

	test("keeps Reply disabled until there is a non-blank draft", async () => {
		const { replyButton, type } = await setup();
		expect((replyButton as HTMLButtonElement).disabled).toBe(true);
		await type("   ");
		expect((replyButton as HTMLButtonElement).disabled).toBe(true);
		await type("hi");
		expect((replyButton as HTMLButtonElement).disabled).toBe(false);
	});

	test("does not post while a reply is already in flight", async () => {
		replyPending = true;
		const { replyButton, textarea, type } = await setup();
		await type("again");
		await act(async () => {
			fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
		});

		expect((replyButton as HTMLButtonElement).disabled).toBe(true);
		expect(replyMutate).not.toHaveBeenCalled();
	});

	test("keeps the draft when the thread has no comment to reply onto", async () => {
		const { textarea, replyButton, type } = await setup({ orphaned: true });
		await type("Orphaned");
		await act(async () => {
			fireEvent.click(replyButton);
		});

		expect(replyMutate).not.toHaveBeenCalled();
		expect((textarea as HTMLTextAreaElement).value).toBe("Orphaned");
	});

	test("hands the draft back when GitHub rejects the reply", async () => {
		const { textarea, replyButton, type } = await setup();
		await type("Looks good");
		await act(async () => {
			fireEvent.click(replyButton);
		});
		expect((textarea as HTMLTextAreaElement).value).toBe("");

		await act(async () => {
			replyOptions.onError?.(new Error("boom"), {
				workspaceId: "ws-1",
				commentId: 555,
				body: "Looks good",
			});
		});
		expect((textarea as HTMLTextAreaElement).value).toBe("Looks good");
	});
});
