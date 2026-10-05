import { mock } from "bun:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const projectsKey = ["projects"];
const pending = new Map();
const started = new Map();
for (const id of ["a", "b"]) {
	pending.set(id, Promise.withResolvers());
	started.set(id, Promise.withResolvers());
}
mock.module("react", () => ({
	useMemo: (fn) => fn(),
	useCallback: (fn) => fn,
}));
mock.module("@lingui/react/macro", () => ({
	useLingui: () => ({ t: ({ message }) => message }),
}));
mock.module("@superset/alert-prompt", () => ({ prompt: async () => "New" }));
mock.module("react-native", () => ({ Alert: { alert: () => {} } }));
mock.module("@/hooks/useHostProjects", () => ({
	hostProjectsQueryKey: () => projectsKey,
}));
mock.module("@/lib/host-service/client", () => ({
	hostServiceUrl: () => "https://host.example",
	getHostServiceClientByUrl: () => ({
		project: {
			setTags: {
				mutate: ({ projectId }) => {
					started.get(projectId)?.resolve();
					return pending.get(projectId)?.promise;
				},
			},
		},
		tagFolders: {
			upsert: { mutate: async () => {} },
			delete: { mutate: async () => {} },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	useQueryClient: () => queryClient,
	useQuery: () => ({ data: [], isSuccess: true }),
}));
const { useProjectCollections } = await import("../useProjectCollections");
queryClient.setQueryData(projectsKey, [
	{ id: "a", tags: ["old-a"] },
	{ id: "b", tags: ["old-b"] },
]);
function CollectionsFixture() {
	return useProjectCollections(
		{ organizationId: "org", machineId: "host", isOnline: true },
		[],
	);
}
const actions = CollectionsFixture();
const first =
	process.argv[2] === "create"
		? actions.newCollection("a")
		: actions.moveProject("a", "new-a");
await started.get("a")?.promise;
const second = actions.moveProject("b", "new-b");
await started.get("b")?.promise;
pending.get("a")?.reject(new Error("setTags failed"));
await first;
assert.deepEqual(queryClient.getQueryData(projectsKey), [
	{ id: "a", tags: ["old-a"] },
	{ id: "b", tags: ["new-b"] },
]);
pending.get("b")?.resolve();
await second;
queryClient.clear();
