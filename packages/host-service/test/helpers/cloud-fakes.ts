import type { FakeApiOverrides } from "./fakes";

/**
 * Pre-canned cloud-API response factories. Tests compose these into
 * `apiOverrides` so common mocks aren't redefined inline. `cloudOk.*`
 * are the building blocks; `cloudFlows.*` bundles them for whole flows.
 */

export const cloudOk = {
	hostEnsure:
		(machineId = "test-machine-1") =>
		() => ({ machineId }),

	projectFindByGitHubRemote:
		(candidates: Array<{ id: string; name: string }> = []) =>
		() => ({ candidates }),
};

/**
 * Whole-flow bundles. Spread into `apiOverrides` so a test reads as
 * "I want the workspace-create flow to succeed" rather than enumerating
 * each procedure mock.
 */
export const cloudFlows = {
	workspaceCreateOk(): FakeApiOverrides {
		return { "host.ensure.mutate": cloudOk.hostEnsure() };
	},

	workspaceDeleteOk(): FakeApiOverrides {
		return {};
	},
};
