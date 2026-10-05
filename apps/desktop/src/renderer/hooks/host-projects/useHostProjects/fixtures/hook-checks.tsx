import { afterAll, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const hosts = [{ organizationId: "org", machineId: "local", isOnline: true }];
const local = {
	activeHostUrl: "local",
	machineId: "local",
	activeOrganizationId: "org",
};
mock.module("renderer/env.renderer", () => ({
	env: { SKIP_ENV_VALIDATION: true },
}));
mock.module("renderer/hooks/known-hosts/useKnownHosts", () => ({
	useKnownHosts: () => ({ hosts, settled: true }),
}));
mock.module("renderer/hooks/useRelayUrl", () => ({
	useRelayUrl: () => "relay",
}));
mock.module("renderer/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({ useLocalHostService: () => local }),
);
mock.module("renderer/lib/host-event-bus", () => ({
	getHostEventBus: () => ({ on: () => () => {}, retain: () => () => {} }),
}));
mock.module("idb-keyval", () => ({
	get: async () => undefined,
	set: async () => {},
	del: async () => {},
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		project: {
			list: {
				query: async () => [
					{ id: "project", repoPath: "/project", tags: ["team"] },
				],
			},
		},
		tagFolders: {
			list: {
				query: async () => [
					{
						scope: "projects",
						tag: "team",
						displayName: "Team",
						color: null,
						tabOrder: 0,
					},
				],
			},
		},
	}),
}));
const { renderHook, waitFor, act } = await import("@testing-library/react");
const { useHostProjects } = await import("../useHostProjects");
const { useHostTagFolders } = await import(
	"../../useHostTagFolders/useHostTagFolders"
);
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

test("real host hooks retain their result identities on unrelated renders and react to data changes", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const { result, rerender, unmount } = renderHook(
		() => ({ projects: useHostProjects(), folders: useHostTagFolders() }),
		{ wrapper },
	);
	await waitFor(() => {
		expect(result.current.projects.projects).toHaveLength(1);
		expect(result.current.folders.tagFolders).toHaveLength(1);
	});
	expect(result.current.projects.isReady).toBe(true);
	expect(
		client.getQueryData([
			"host-service",
			"projects",
			"list",
			"org",
			"mock-user",
			"local",
		]),
	).toBeDefined();
	const projectResults = result.current.projects.hostResults;
	const folderResults = result.current.folders.hostResults;
	const projects = result.current.projects.projects;
	const folders = result.current.folders.tagFolders;
	rerender();
	expect(result.current.projects.hostResults).toBe(projectResults);
	expect(result.current.folders.hostResults).toBe(folderResults);
	expect(result.current.projects.projects).toBe(projects);
	expect(result.current.folders.tagFolders).toBe(folders);
	await act(async () => {
		client.setQueryData(
			["host-tag-folders", "org", "local"],
			[
				{
					scope: "projects",
					tag: "team",
					displayName: "Renamed",
					color: null,
					tabOrder: 0,
				},
			],
		);
	});
	await waitFor(() =>
		expect(result.current.folders.tagFolders[0]?.displayName).toBe("Renamed"),
	);
	expect(result.current.folders.hostResults).not.toBe(folderResults);
	expect(result.current.projects.hostResults).toBe(projectResults);
	unmount();
	client.clear();
});
