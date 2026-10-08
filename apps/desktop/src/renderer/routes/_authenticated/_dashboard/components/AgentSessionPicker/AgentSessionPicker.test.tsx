import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ContextType } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import superjson from "superjson";
import { AgentSessionPicker } from "./AgentSessionPicker";
import { EXISTING_PREFIX } from "./hooks/useAgentSessionTarget";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE_ID = "workspace-1";
const MACHINE_ID = "this-machine";
const TERMINAL_ID = "terminal-1";

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

function startHost() {
	const listed: unknown[] = [];
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		terminal: t.router({
			list: t.procedure
				.input((input) => input)
				.query(({ input }) => {
					listed.push(input);
					return {
						sessions: [{ terminalId: TERMINAL_ID, title: "Fix the login" }],
					};
				}),
		}),
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request) =>
			fetchRequestHandler({
				endpoint: "/trpc",
				req: request,
				router,
				allowMethodOverride: true,
			}),
	});
	stopHost = () => void server.stop(true);
	return { listed, url: `http://127.0.0.1:${server.port}` };
}

test("names an existing session by the title its host reports", async () => {
	const host = startHost();
	const queryClient = new QueryClient();
	queryClient.setQueryData(["relay-endpoint"], { url: host.url });
	const session = {
		terminalId: TERMINAL_ID,
		agentId: "claude",
	} as TerminalAgentBinding;

	const view = render(
		<QueryClientProvider client={queryClient}>
			<LocalHostServiceContext.Provider
				value={
					{
						machineId: MACHINE_ID,
						activeHostUrl: host.url,
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
						<AgentSessionPicker
							workspaceId={WORKSPACE_ID}
							value={`${EXISTING_PREFIX}${TERMINAL_ID}`}
							onValueChange={() => {}}
							sessions={[session]}
							configs={[]}
						/>
					</SandboxAccessContext.Provider>
				</HostWorkspacesContext.Provider>
			</LocalHostServiceContext.Provider>
		</QueryClientProvider>,
	);

	expect(view.getByLabelText("Choose agent").textContent).toContain("claude");
	expect(await view.findByText("Fix the login")).toBeDefined();
	expect(host.listed).toEqual([{ workspaceId: WORKSPACE_ID }]);
});
