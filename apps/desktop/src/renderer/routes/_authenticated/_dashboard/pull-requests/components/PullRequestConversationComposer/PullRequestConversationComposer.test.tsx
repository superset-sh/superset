import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type ComponentProps, createRef } from "react";
import superjson from "superjson";
import {
	PullRequestConversationComposer,
	type PullRequestConversationComposerHandle,
} from "./PullRequestConversationComposer";

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

const target = { projectId: "p1", hostUrl: "http://host.test", prNumber: 1 };

function startHost() {
	const posted: { procedure: string; input: unknown }[] = [];
	const t = initTRPC.create({ transformer: superjson });
	const record = (procedure: string) =>
		t.procedure
			.input((input) => input)
			.mutation(({ input }) => {
				posted.push({ procedure, input });
				return null;
			});
	const router = t.router({
		pullRequests: t.router({
			addComment: record("addComment"),
			replyToThread: record("replyToThread"),
		}),
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request) =>
			fetchRequestHandler({ endpoint: "/trpc", req: request, router }),
	});
	stopHost = () => void server.stop(true);
	return { posted, url: `http://127.0.0.1:${server.port}` };
}

function renderComposer(
	props: Omit<
		ComponentProps<typeof PullRequestConversationComposer>,
		"target" | "ref"
	> & { hostUrl?: string } = {},
) {
	const { hostUrl, ...composerProps } = props;
	const handle = createRef<PullRequestConversationComposerHandle>();
	const view = render(
		<QueryClientProvider client={new QueryClient()}>
			<PullRequestConversationComposer
				ref={handle}
				target={hostUrl ? { ...target, hostUrl } : target}
				{...composerProps}
			/>
		</QueryClientProvider>,
	);
	return {
		view,
		handle,
		field: () => view.getByRole("textbox") as HTMLTextAreaElement,
	};
}

describe("the Activity comment box", () => {
	test("at the end of the section it is a plain comment box that leaves focus alone", () => {
		const { view, field } = renderComposer();
		expect(field().placeholder).toBe("Leave a comment");
		expect(view.getByRole("button", { name: "Post comment" })).toBeTruthy();
		expect(view.queryByRole("button", { name: "Cancel" })).toBeNull();
		expect(document.activeElement).not.toBe(field());
	});

	test("under a card it opens on the quote with the caret after it, and Cancel closes it", () => {
		const onClose = mock(() => {});
		const { view, field } = renderComposer({
			initialBody: "> LGTM\n\n",
			onClose,
		});
		expect(field().placeholder).toBe("Write a reply");
		expect(field().value).toBe("> LGTM\n\n");
		expect(document.activeElement).toBe(field());
		expect(field().selectionStart).toBe("> LGTM\n\n".length);
		expect(view.getByRole("button", { name: "Post reply" })).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("a second quote joins what is already written", () => {
		const { handle, field } = renderComposer({
			initialBody: "> first\n\n",
			onClose: () => {},
		});
		fireEvent.change(field(), { target: { value: "> first\n\nAgreed." } });
		act(() => handle.current?.quote("> second"));
		expect(field().value).toBe("> first\n\nAgreed.\n\n> second\n\n");
	});

	test("Shift+Enter stays in the pill; Enter posts the comment and empties it", async () => {
		const host = startHost();
		const { field } = renderComposer({ hostUrl: host.url });
		fireEvent.change(field(), { target: { value: "Looks good.\n" } });
		expect(fireEvent.keyDown(field(), { key: "Enter", shiftKey: true })).toBe(
			true,
		);
		expect(fireEvent.keyDown(field(), { key: "Enter" })).toBe(false);
		await waitFor(() => expect(field().value).toBe(""));
		expect(host.posted).toEqual([
			{
				procedure: "addComment",
				input: { projectId: "p1", prNumber: 1, body: "Looks good." },
			},
		]);
	});

	test("Cancel stays disabled while a reply is posting", async () => {
		let release: () => void = () => {};
		const server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: () =>
				new Promise<Response>((resolve) => {
					release = () => resolve(new Response(null, { status: 500 }));
				}),
		});
		stopHost = () => {
			release();
			void server.stop(true);
		};
		const { view, field } = renderComposer({
			hostUrl: `http://127.0.0.1:${server.port}`,
			threadCommentId: 42,
			onClose: () => {},
		});
		const cancel = view.getByRole("button", { name: "Cancel" });
		expect(cancel).toHaveProperty("disabled", false);
		fireEvent.change(field(), { target: { value: "On it." } });
		fireEvent.keyDown(field(), { key: "Enter" });
		await waitFor(() => expect(cancel).toHaveProperty("disabled", true));
	});
	test("Enter in a reply box answers its thread and closes the box", async () => {
		const host = startHost();
		const onClose = mock(() => {});
		const { field } = renderComposer({
			hostUrl: host.url,
			threadCommentId: 42,
			onClose,
		});
		fireEvent.change(field(), { target: { value: "Done in the next push." } });
		fireEvent.keyDown(field(), { key: "Enter" });
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(host.posted).toEqual([
			{
				procedure: "replyToThread",
				input: {
					projectId: "p1",
					prNumber: 1,
					commentId: 42,
					body: "Done in the next push.",
				},
			},
		]);
	});
});
