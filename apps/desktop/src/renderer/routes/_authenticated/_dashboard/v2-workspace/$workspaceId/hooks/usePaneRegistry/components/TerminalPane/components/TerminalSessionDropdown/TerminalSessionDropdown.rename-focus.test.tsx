import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import type { AppRouter } from "@superset/host-service";
import { createWorkspaceStore, type RendererContext } from "@superset/panes";
import { useRunAfterMenuClose } from "@superset/ui/hooks/use-run-after-menu-close";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { CollectionsContext } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { getCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { PaneViewerData } from "../../../../../../types";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, renderHook, waitFor, within } =
	await import("@testing-library/react");
const { TerminalSessionDropdown } = await import("./TerminalSessionDropdown");

afterEach(cleanup);

function renderDropdown() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "terminal-1" } }],
	});
	const tab = store.getState().tabs[0];
	assert(tab?.activePaneId);
	const pane = tab.panes[tab.activePaneId];
	assert(pane);
	const noop = () => {};
	const context: RendererContext<PaneViewerData> = {
		pane: { ...pane, parentDirection: null },
		tab: { ...tab, position: 0 },
		store,
		isActive: true,
		headerActions: null,
		actions: {
			close: noop,
			focus: noop,
			setTitle: noop,
			pin: noop,
			updateData: noop,
			split: noop,
		},
	};
	const link: TRPCLink<AppRouter> =
		() =>
		({ op }) =>
			observable((observer) => {
				if (op.path !== "terminal.list")
					throw new Error(`Unexpected request: ${op.path}`);
				observer.next({
					result: {
						data: {
							sessions: [
								{
									terminalId: "terminal-1",
									title: "Shell",
									customTitle: "Session name",
									createdAt: 1,
									exited: false,
									exitCode: 0,
									attached: true,
								},
							],
						},
					},
				});
				observer.complete();
			});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const client = workspaceTrpc.createClient({ links: [link] });
	render(
		<workspaceTrpc.Provider client={client} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<CollectionsContext.Provider
					value={{
						...getCollections("session-rename-focus"),
						activeOrganizationId: "session-rename-focus",
						switchOrganization: async () => {},
					}}
				>
					<LocalHostServiceContext.Provider
						value={{
							machineId: "local",
							activeHostUrl: null,
							activeOrganizationId: null,
							activeOrganizationName: null,
							hostServiceStatus: "unknown",
							waitForHostReady: async () => null,
						}}
					>
						<HostWorkspacesContext.Provider
							value={{
								workspaces: [],
								isReady: true,
								hostsSettled: true,
								cache: {
									resolveHostUrl: () => null,
									isSandboxHost: () => false,
									upsertWorkspace: noop,
									removeWorkspace: noop,
									invalidateHost: noop,
									hasLiveTargets: false,
									refetchAll: async () => {},
								},
							}}
						>
							<TerminalSessionDropdown
								context={context}
								launcher={{
									mint: () => "new-terminal",
									create: async () => "new-terminal",
								}}
								workspaceId="workspace-1"
								onSessionRemoved={noop}
							/>
						</HostWorkspacesContext.Provider>
					</LocalHostServiceContext.Provider>
				</CollectionsContext.Provider>
			</QueryClientProvider>
		</workspaceTrpc.Provider>,
	);
	return within(document.body);
}

async function openMenu() {
	const page = renderDropdown();
	const trigger = page.getByRole("button", { name: "Terminal sessions" });
	await act(async () => {
		fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
	});
	const menu = await page.findByRole("menu");
	await page.findByRole("button", { name: "Rename Shell" });
	const closed = new Promise<void>((resolve) => {
		menu.addEventListener(
			"focusScope.autoFocusOnUnmount",
			() => queueMicrotask(resolve),
			{ once: true },
		);
	});
	return { page, trigger, menu, closed };
}

test("renaming from the production session menu focuses and selects the name after menu close", async () => {
	const { page, closed } = await openMenu();
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Rename Shell" }));
	});
	await act(async () => {
		await closed;
	});
	const input = page.getByRole("textbox", {
		name: "Session name",
	}) as HTMLInputElement;
	await waitFor(() => expect(document.activeElement).toBe(input));
	expect(input.selectionStart).toBe(0);
	expect(input.selectionEnd).toBe(input.value.length);
	expect(input.value).toBe("Session name");
	expect(page.queryByRole("menu")).toBeNull();
});

test("dismissing the production session menu without renaming restores its trigger focus", async () => {
	const { page, trigger, menu, closed } = await openMenu();
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Escape" });
	});
	await act(async () => {
		await closed;
	});
	expect(page.queryByRole("dialog")).toBeNull();
	expect(document.activeElement).toBe(trigger);
});

for (const restoreFocusOnClose of [false, true]) {
	test(`shared hook preserves the focus restoration contract (opt-in: ${restoreFocusOnClose})`, () => {
		const { result } = renderHook(() =>
			useRunAfterMenuClose(
				restoreFocusOnClose ? { restoreFocusOnClose: true } : undefined,
			),
		);
		const event = new Event("focusScope.autoFocusOnUnmount", {
			cancelable: true,
		});
		result.current.onCloseAutoFocus(event);
		expect(event.defaultPrevented).toBe(!restoreFocusOnClose);
	});

	test(`shared hook consumes a queued action once before restoring focus (opt-in: ${restoreFocusOnClose})`, () => {
		const { result } = renderHook(() =>
			useRunAfterMenuClose(
				restoreFocusOnClose ? { restoreFocusOnClose: true } : undefined,
			),
		);
		let calls = 0;
		result.current.runAfterClose(() => {
			calls += 1;
		});
		const firstClose = new Event("focusScope.autoFocusOnUnmount", {
			cancelable: true,
		});
		result.current.onCloseAutoFocus(firstClose);
		expect(calls).toBe(1);
		expect(firstClose.defaultPrevented).toBe(true);

		const secondClose = new Event("focusScope.autoFocusOnUnmount", {
			cancelable: true,
		});
		result.current.onCloseAutoFocus(secondClose);
		expect(calls).toBe(1);
		expect(secondClose.defaultPrevented).toBe(!restoreFocusOnClose);
	});
}
