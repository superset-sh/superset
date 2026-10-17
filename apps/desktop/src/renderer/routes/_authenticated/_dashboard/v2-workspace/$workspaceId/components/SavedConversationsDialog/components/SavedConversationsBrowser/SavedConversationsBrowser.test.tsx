import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Suspense } from "react";
import {
	removeHostServiceSecret,
	setHostServiceSecret,
} from "renderer/lib/host-service-auth";
import superjson from "superjson";
import { SavedConversationsBrowser } from "./SavedConversationsBrowser";

const { act, cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
afterEach(cleanup);

const props = {
	hostUrl: "http://127.0.0.1:1",
	workspaceId: "test-workspace",
	agent: "claude",
	account: { selection: "account-B", identity: "test-identity" },
	accountLabel: "Account B",
	onBack: () => {},
	onOpened: () => {},
};
const never = new Promise<void>(() => {});
function Suspend({ enabled }: { enabled: boolean }) {
	if (enabled) throw never;
	return null;
}

test("unmount reports to the latest committed busy callback", () => {
	const client = new QueryClient({
		defaultOptions: { queries: { enabled: false } },
	});
	const first = mock((_busy: boolean) => {});
	const latest = mock((_busy: boolean) => {});
	const content = (onBusy: (busy: boolean) => void) => (
		<QueryClientProvider client={client}>
			<SavedConversationsBrowser {...props} onBusy={onBusy} />
		</QueryClientProvider>
	);
	try {
		const view = render(content(first));
		view.rerender(content(latest));
		view.unmount();
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledWith(false);
	} finally {
		client.clear();
	}
});

test("a suspended render cannot replace the committed cleanup callback", () => {
	const client = new QueryClient({
		defaultOptions: { queries: { enabled: false } },
	});
	const committed = mock((_busy: boolean) => {});
	const discarded = mock((_busy: boolean) => {});
	const content = (onBusy: (busy: boolean) => void, suspend: boolean) => (
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>Suspended</span>}>
				<SavedConversationsBrowser {...props} onBusy={onBusy} />
				<Suspend enabled={suspend} />
			</Suspense>
		</QueryClientProvider>
	);
	try {
		const view = render(content(committed, false));
		view.rerender(content(discarded, true));
		expect(view.getByText("Suspended")).toBeTruthy();
		view.unmount();
		expect(committed).toHaveBeenCalledWith(false);
		expect(discarded).not.toHaveBeenCalled();
	} finally {
		client.clear();
	}
});

test("pending opening and unmount use committed callbacks without reporting after disposal", async () => {
	const opening = Promise.withResolvers<{ terminalId: string }>();
	const started = Promise.withResolvers<void>();
	const t = initTRPC.create({ transformer: superjson });
	const page = {
		candidates: [],
		conversations: [
			{
				id: "saved",
				nativeSessionId: "test-session",
				revision: "revision",
				state: "ready",
				terminalId: "existing",
				canFocusExisting: true,
			},
		],
		nextCursor: null,
	};
	const router = t.router({
		savedConversations: t.router({
			list: t.procedure.query(() => page),
			open: t.procedure.mutation(() => {
				started.resolve();
				return opening.promise;
			}),
		}),
	});
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: (req) =>
			fetchRequestHandler({
				endpoint: "/trpc",
				req,
				router,
				allowMethodOverride: true,
			}),
	});
	const hostUrl = server.url.origin;
	setHostServiceSecret(hostUrl, "test-only-secret");
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const first = mock((_busy: boolean) => {});
	const latest = mock((_busy: boolean) => {});
	const opened = mock(() => {});
	const content = (onBusy: (busy: boolean) => void) => (
		<QueryClientProvider client={client}>
			<SavedConversationsBrowser
				{...props}
				hostUrl={hostUrl}
				onBusy={onBusy}
				onOpened={opened}
			/>
		</QueryClientProvider>
	);
	try {
		const view = render(content(first));
		await waitFor(() => expect(view.getByRole("radio")).toBeTruthy());
		fireEvent.click(view.getByRole("radio"));
		const form = view.container.querySelector("form");
		if (!form) throw new Error("Saved conversation form missing");
		fireEvent.submit(form);
		await act(async () => started.promise);
		expect(first).toHaveBeenCalledWith(true);
		view.rerender(content(latest));
		view.unmount();
		expect(latest).toHaveBeenCalledWith(false);
		await act(async () => {
			opening.resolve({ terminalId: "existing" });
			await waitFor(() => expect(server.pendingRequests).toBe(0));
		});
		expect(opened).not.toHaveBeenCalled();
		expect(first.mock.calls).toEqual([[true]]);
		expect(latest.mock.calls).toEqual([[false]]);
	} finally {
		opening.resolve({ terminalId: "existing" });
		client.clear();
		removeHostServiceSecret(hostUrl);
		await server.stop(true);
	}
});
