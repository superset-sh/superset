import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { nativeWebGlobals } from "~/test-setup";
import { useDiffStats } from "./useDiffStats";

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
const WATCH_SETTLE_MS = 500;

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

function startHost() {
	const commands: string[] = [];
	const requests: string[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request, bunServer) {
			if (bunServer.upgrade(request)) return;
			requests.push(new URL(request.url).pathname);
			return new Response(null, { status: 404 });
		},
		websocket: {
			message(_socket, raw) {
				const command = JSON.parse(String(raw)) as { type: string };
				commands.push(command.type);
			},
		},
	});
	stopHost = () => void server.stop(true);
	const statusReads = () =>
		requests.filter((pathname) => pathname.includes("git.getStatus")).length;
	return { commands, statusReads, url: `http://127.0.0.1:${server.port}` };
}

function renderDiffStats(hostUrl: string, options?: { live?: boolean }) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(["relay-endpoint"], { url: hostUrl });
	const wrapper = ({ children }: { children: ReactNode }) => (
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
							usageRefusal: null,
						}}
					>
						{children}
					</SandboxAccessContext.Provider>
				</HostWorkspacesContext.Provider>
			</LocalHostServiceContext.Provider>
		</QueryClientProvider>
	);
	return renderHook(() => useDiffStats(WORKSPACE_ID, options), { wrapper });
}

describe("useDiffStats", () => {
	test("subscribes to git:changed by default so the stats stay live", async () => {
		const host = startHost();
		renderDiffStats(host.url);

		await waitFor(() => expect(host.commands).toContain("git:watch"));
	});

	test("a one-shot read fetches the stats without subscribing to git:changed", async () => {
		const host = startHost();
		renderDiffStats(host.url, { live: false });

		await waitFor(() => expect(host.statusReads()).toBeGreaterThan(0));
		await new Promise((resolve) => setTimeout(resolve, WATCH_SETTLE_MS));
		expect(host.commands).not.toContain("git:watch");
	});
});
