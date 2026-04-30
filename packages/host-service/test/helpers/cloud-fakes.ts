import { randomUUID } from "node:crypto";
import type { FakeApiOverrides } from "./fakes";

/**
 * Pre-canned cloud-API response factories. Tests compose these into
 * `apiOverrides` so the same handful of mocks ("ok host.ensure",
 * "echo-the-input v2Workspace.create") aren't redefined inline in
 * every test file.
 *
 * Convention: each factory returns an `(input) => response` shape
 * compatible with `FakeApiOverrides` values. Override-once helpers are
 * the building blocks; the bundled flow helpers below mix several
 * factories into a complete `apiOverrides` object for common scenarios.
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
	 * Echoes the requested branch/name back with a fresh UUID id. Used by
	 * any procedure that creates a workspace and inspects the returned
	 * row. `ensureMainWorkspace` calls this first inside many procedures,
	 * so each call needs a distinct id — we generate one per invocation.
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

	organization:
		(organizationId: string, name = "Test Org", slug = "test-org") =>
		() => ({ id: organizationId, name, slug }),

	userMe:
		(user: { id?: string; email?: string; name?: string } = {}) =>
		() => ({
			id: user.id ?? "user-1",
			email: user.email ?? "test@superset.local",
			name: user.name ?? "Test User",
		}),

	chatUpdateSession: () => () => ({ ok: true }),

	v2ProjectFindByGitHubRemote:
		(candidates: Array<{ id: string; name: string }> = []) =>
		() => ({ candidates }),
};

/**
 * Bundles for whole flows. Spread into `apiOverrides`. The intent is
 * that a test reads as "I want the workspace-create flow to succeed"
 * rather than enumerating four individual procedure mocks.
 */
export const cloudFlows = {
	/** Successful workspace creation: host.ensure + v2Workspace.create. */
	workspaceCreateOk(overrides: Partial<CloudWorkspace> = {}): FakeApiOverrides {
		return {
			"host.ensure.mutate": cloudOk.hostEnsure(),
			"v2Workspace.create.mutate": cloudOk.workspaceCreate(overrides),
		};
	},

	/** Successful workspace teardown: getFromHost + delete. */
	workspaceDeleteOk(
		options: { type?: "main" | "feature" } = { type: "feature" },
	): FakeApiOverrides {
		return {
			"v2Workspace.getFromHost.query": cloudOk.workspaceGetFromHost(options),
			"v2Workspace.delete.mutate": cloudOk.workspaceDelete(),
		};
	},
};
