import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import type { TRPCLink } from "@trpc/client";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { getQueryKey } = await import("@trpc/react-query");
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const { toast } = await import("@superset/ui/sonner");
const { workspaceTrpc } = await import("@superset/workspace-client");
const { CommentThread } = await import("./CommentThread");

interface Reply {
	input: unknown;
	succeed: () => void;
	fail: (error: Error) => void;
}

let replies: Reply[] = [];
let queryClient: InstanceType<typeof QueryClient>;
let toastError: ReturnType<typeof spyOn<typeof toast, "error">>;

const hostLink: TRPCLink<AppRouter> = () => (call) =>
	observable((observer) => {
		if (call.op.path !== "git.replyToReviewThread") {
			observer.error(TRPCClientError.from(new Error(call.op.path)));
			return;
		}
		replies.push({
			input: call.op.input,
			succeed: () => {
				observer.next({ result: { data: null } });
				observer.complete();
			},
			fail: (error) => observer.error(TRPCClientError.from(error)),
		});
	});

const THREADS_KEY = getQueryKey(
	workspaceTrpc.git.getPullRequestThreads,
	{ workspaceId: "ws-1" },
	"query",
);

beforeEach(() => {
	replies = [];
	queryClient = new QueryClient();
	queryClient.setQueryData(THREADS_KEY, []);
	toastError = spyOn(toast, "error").mockImplementation(() => "");
});
afterEach(() => {
	cleanup();
	queryClient.clear();
	toastError.mockRestore();
});
afterAll(async () => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
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
			<workspaceTrpc.Provider
				client={workspaceTrpc.createClient({ links: [hostLink] })}
				queryClient={queryClient}
			>
				<CommentThread
					workspaceId="ws-1"
					threadId="thread-1"
					isResolved={false}
					comments={COMMENTS}
					replyToCommentId={orphaned ? undefined : 555}
				/>
			</workspaceTrpc.Provider>,
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

		expect(replies.map((reply) => reply.input)).toEqual([
			{ workspaceId: "ws-1", commentId: 555, body: "Looks good" },
		]);
		expect((textarea as HTMLTextAreaElement).value).toBe("");
		expect(queryClient.getQueryState(THREADS_KEY)?.isInvalidated).toBe(false);

		await act(async () => replies[0]?.succeed());
		await waitFor(() =>
			expect(queryClient.getQueryState(THREADS_KEY)?.isInvalidated).toBe(true),
		);
	});

	test("Cmd+Enter submits from the textarea", async () => {
		const { textarea, type } = await setup();
		await type("Ship it");
		await act(async () => {
			fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
		});

		expect(replies).toHaveLength(1);
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
		const { replyButton, textarea, type } = await setup();
		await type("first");
		await act(async () => {
			fireEvent.click(replyButton);
		});
		await type("again");
		await act(async () => {
			fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
		});

		expect((replyButton as HTMLButtonElement).disabled).toBe(true);
		expect(replies).toHaveLength(1);
	});

	test("keeps the draft when the thread has no comment to reply onto", async () => {
		const { textarea, replyButton, type } = await setup({ orphaned: true });
		await type("Orphaned");
		await act(async () => {
			fireEvent.click(replyButton);
		});

		expect(replies).toHaveLength(0);
		expect((textarea as HTMLTextAreaElement).value).toBe("Orphaned");
	});

	test("hands the draft back when GitHub rejects the reply", async () => {
		const { textarea, replyButton, type } = await setup();
		await type("Looks good");
		await act(async () => {
			fireEvent.click(replyButton);
		});
		expect((textarea as HTMLTextAreaElement).value).toBe("");

		await act(async () => replies[0]?.fail(new Error("boom")));
		await waitFor(() =>
			expect((textarea as HTMLTextAreaElement).value).toBe("Looks good"),
		);
	});
});
