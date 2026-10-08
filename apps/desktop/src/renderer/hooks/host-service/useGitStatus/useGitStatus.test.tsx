import { afterAll, afterEach, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ContextType, ReactNode } from "react";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { nativeWebGlobals } from "~/test-setup";
import { useGitStatus } from "./useGitStatus";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const domEvents = {
	Event: globalThis.Event,
	MessageEvent: globalThis.MessageEvent,
};
Object.assign(globalThis, {
	Event: nativeWebGlobals.Event,
	MessageEvent: nativeWebGlobals.MessageEvent,
});
afterAll(() => {
	Object.assign(globalThis, domEvents);
});

const WORKSPACE_ID = "workspace-1";
const MACHINE_ID = "this-machine";

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

function startHost() {
	const commands: string[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request, bunServer) {
			if (bunServer.upgrade(request)) return;
			return new Response(null, { status: 404 });
		},
		websocket: {
			message(socket, raw) {
				const command = JSON.parse(String(raw)) as { type: string };
				commands.push(command.type);
				if (command.type !== "git:watch") return;
				socket.send(
					JSON.stringify({ type: "git:changed", workspaceId: WORKSPACE_ID }),
				);
			},
		},
	});
	stopHost = () => void server.stop(true);
	return { commands, url: `http://127.0.0.1:${server.port}` };
}

function renderGitStatus(hostUrl: string) {
	const asked: string[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push(call.op.path);
			observer.next({
				result: {
					data:
						call.op.path === "git.getBaseBranch" ? { baseBranch: null } : {},
				},
			});
			observer.complete();
		});
	const queryClient = new QueryClient();
	queryClient.setQueryData(["relay-endpoint"], { url: hostUrl });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<QueryClientProvider client={queryClient}>
				<LocalHostServiceContext.Provider
					value={
						{
							machineId: MACHINE_ID,
							activeHostUrl: hostUrl,
						} as NonNullable<ContextType<typeof LocalHostServiceContext>>
					}
				>
					<HostWorkspacesContext.Provider
						value={
							{
								workspaces: [
									{
										id: WORKSPACE_ID,
										hostId: MACHINE_ID,
										organizationId: "org-1",
									},
								],
								isReady: true,
							} as NonNullable<ContextType<typeof HostWorkspacesContext>>
						}
					>
						<SandboxAccessContext.Provider
							value={{
								targets: [],
								isReady: true,
								agentCredentialsChangedWorkspaceId: null,
							}}
						>
							{children}
						</SandboxAccessContext.Provider>
					</HostWorkspacesContext.Provider>
				</LocalHostServiceContext.Provider>
			</QueryClientProvider>
		</workspaceTrpc.Provider>
	);
	const view = renderHook(() => useGitStatus(WORKSPACE_ID), { wrapper });
	const statusReads = () =>
		asked.filter((path) => path === "git.getStatus").length;
	return { statusReads, view };
}

test("watches the workspace's host for git changes and refetches status on one", async () => {
	const host = startHost();
	const { statusReads, view } = renderGitStatus(host.url);

	await waitFor(() => expect(host.commands).toContain("git:watch"));
	await waitFor(() => expect(statusReads()).toBeGreaterThanOrEqual(2));

	view.unmount();
	await waitFor(() => expect(host.commands).toContain("git:unwatch"));
});
