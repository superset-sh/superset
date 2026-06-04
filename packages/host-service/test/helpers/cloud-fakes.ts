import { randomUUID } from "node:crypto";
import type { FakeApiOverrides } from "./fakes";

/**
 * Pre-canned cloud-API response factories. Tests compose these into
 * `apiOverrides` so common mocks aren't redefined inline. `cloudOk.*`
 * are the building blocks; `cloudFlows.*` bundles them for whole flows.
 */

interface CloudWorkspace {
	id: string;
	projectId: string;
	branch: string;
	name: string;
	type?: "main" | "feature";
}

export const cloudOk = {
	hostEnsure:
		(machineId = "test-machine-1") =>
		() => ({ machineId }),

	/**
	 * Echoes branch/name back with a fresh UUID id per call. Many
	 * procedures call `ensureMainWorkspace` first, which hits this same
	 * mock — each invocation needs a distinct id to avoid PK collisions.
	 */
	workspaceCreate:
		(overrides: Partial<CloudWorkspace> = {}) =>
		(input: unknown): CloudWorkspace => {
			const i = input as { branch: string; name: string; projectId: string };
			return {
				id: randomUUID(),
				projectId: i.projectId,
				branch: i.branch,
				name: i.name,
				...overrides,
			};
		},

	workspaceDelete: () => () => ({ success: true }),

	/** Returns a feature workspace by default; override `type: "main"` to
	 *  exercise the main-workspace guard paths. */
	workspaceGetFromHost:
		(workspace: { type?: "main" | "feature" } = { type: "feature" }) =>
		() =>
			workspace,

	v2ProjectFindByGitHubRemote:
		(candidates: Array<{ id: string; name: string }> = []) =>
		() => ({ candidates }),
};

/**
 * Whole-flow bundles. Spread into `apiOverrides` so a test reads as
 * "I want the workspace-create flow to succeed" rather than enumerating
 * each procedure mock.
 */
export const cloudFlows = {
	workspaceCreateOk(overrides: Partial<CloudWorkspace> = {}): FakeApiOverrides {
		return {
			"host.ensure.mutate": cloudOk.hostEnsure(),
			"v2Workspace.create.mutate": cloudOk.workspaceCreate(overrides),
		};
	},

	workspaceDeleteOk(
		options: { type?: "main" | "feature" } = { type: "feature" },
	): FakeApiOverrides {
		return {
			"v2Workspace.getFromHost.query": cloudOk.workspaceGetFromHost(options),
			"v2Workspace.delete.mutate": cloudOk.workspaceDelete(),
		};
	},
};
