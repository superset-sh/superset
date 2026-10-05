import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { TRPCError } from "@trpc/server";
import { userError } from "../../i18n-error";

/** Where an automation runs: the columns create and update write together. */
export interface AutomationTarget {
	targetHostId: string | null;
	v2ProjectId: string | null;
	v2WorkspaceId: string | null;
	cloudWorkspaceId: string | null;
	environmentId: string | null;
	continueAgentSession: boolean;
}

export const NO_TARGET: AutomationTarget = {
	targetHostId: null,
	v2ProjectId: null,
	v2WorkspaceId: null,
	cloudWorkspaceId: null,
	environmentId: null,
	continueAgentSession: false,
};

/** Undefined keeps what the automation has; null clears it. */
export type TargetInput = {
	[K in keyof AutomationTarget]?: AutomationTarget[K] | null;
};

export interface TargetLookups {
	/** The workspace a legacy client retargets to by its id alone. */
	legacyWorkspace?: { projectId: string; hostId: string };
	/** The environment of the cloud workspace being newly pinned. */
	pinEnvironmentId?: string | null;
}

export interface TargetPlan {
	target: AutomationTarget;
	hostsToVerify: string[];
	/** Set for a cloud target; the environment to check only when it changed. */
	cloud: { environmentToVerify: string | null } | null;
}

/** A legacy client names a host's workspace without its host. */
export function needsLegacyWorkspace(input: TargetInput): boolean {
	return Boolean(input.v2WorkspaceId) && !input.targetHostId;
}

export function newCloudPin(
	existing: AutomationTarget,
	input: TargetInput,
): string | null {
	return input.cloudWorkspaceId &&
		input.cloudWorkspaceId !== existing.cloudWorkspaceId
		? input.cloudWorkspaceId
		: null;
}

/** The target after `input`. The router runs the database checks this returns. */
export function planTarget(
	existing: AutomationTarget,
	input: TargetInput,
	lookups: TargetLookups,
): TargetPlan {
	const nextHost =
		input.targetHostId !== undefined
			? input.targetHostId
			: input.v2WorkspaceId
				? null
				: existing.targetHostId;
	const hostChanged =
		input.targetHostId !== undefined &&
		input.targetHostId !== existing.targetHostId;

	const plan =
		nextHost === CLOUD_HOST_ID
			? planCloud(existing, input, lookups, hostChanged)
			: planHost(existing, input, lookups, hostChanged);

	const pinned = Boolean(
		plan.target.v2WorkspaceId ?? plan.target.cloudWorkspaceId,
	);
	// Asking for it without a pin is a mistake worth reporting; losing the pin
	// some other way just takes the flag with it, since the session it would
	// continue lived in that workspace.
	if (input.continueAgentSession === true && !pinned) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Continuing an agent session requires a pinned workspace",
			i18nKey: "serverError.automation.continueNeedsPinnedWorkspace",
		});
	}
	plan.target.continueAgentSession = pinned
		? (input.continueAgentSession ?? existing.continueAgentSession)
		: false;
	return plan;
}

function planHost(
	existing: AutomationTarget,
	input: TargetInput,
	lookups: TargetLookups,
	hostChanged: boolean,
): TargetPlan {
	refuseFields(
		input,
		["cloudWorkspaceId", "environmentId"],
		(field) => `${field} needs targetHostId "${CLOUD_HOST_ID}"`,
	);

	let targetHostId =
		input.targetHostId === undefined
			? existing.targetHostId
			: input.targetHostId;
	// Explicit null switches to session mode; undefined keeps the project.
	let v2ProjectId =
		input.v2ProjectId === undefined ? existing.v2ProjectId : input.v2ProjectId;
	let v2WorkspaceId =
		input.v2WorkspaceId === undefined
			? existing.v2WorkspaceId
			: input.v2WorkspaceId;
	const projectChanged =
		input.v2ProjectId !== undefined &&
		input.v2ProjectId !== existing.v2ProjectId;
	if (input.v2WorkspaceId === undefined && (hostChanged || projectChanged)) {
		v2WorkspaceId = null;
	}

	const hostsToVerify = input.targetHostId ? [input.targetHostId] : [];
	if (input.v2WorkspaceId && input.targetHostId) {
		// Denormalized pin: the client supplies the host (and the project, when
		// the workspace has one) with the workspace id. A null project is a
		// session pin.
		v2ProjectId = input.v2ProjectId ?? null;
	} else if (input.v2WorkspaceId) {
		const workspace = lookups.legacyWorkspace;
		if (!workspace) throw new Error("legacy workspace was not looked up");
		// Only an explicitly conflicting project is refused: sending just the
		// workspace id is how a legacy client moves across projects.
		if (
			input.v2ProjectId !== undefined &&
			input.v2ProjectId !== workspace.projectId
		) {
			throw userError({
				code: "BAD_REQUEST",
				message: "v2ProjectId does not match the workspace's project",
				i18nKey: "serverError.automation.v2projectidDoesNotMatchTheWorkspace",
			});
		}
		v2ProjectId = workspace.projectId;
		targetHostId = workspace.hostId;
		if (targetHostId !== existing.targetHostId) {
			hostsToVerify.push(targetHostId);
		}
	}

	return {
		target: {
			targetHostId,
			v2ProjectId,
			v2WorkspaceId,
			cloudWorkspaceId: null,
			environmentId: null,
			continueAgentSession: false,
		},
		hostsToVerify,
		cloud: null,
	};
}

/** A pin, an environment, or both. The environment follows a new pin unless one is named. */
function planCloud(
	existing: AutomationTarget,
	input: TargetInput,
	lookups: TargetLookups,
	hostChanged: boolean,
): TargetPlan {
	refuseFields(
		input,
		["v2ProjectId", "v2WorkspaceId"],
		(field) => `${field} does not apply to a cloud automation`,
	);

	const cloudWorkspaceId =
		input.cloudWorkspaceId !== undefined
			? input.cloudWorkspaceId
			: hostChanged
				? null
				: existing.cloudWorkspaceId;
	const existingEnvironmentId = hostChanged ? null : existing.environmentId;
	const environmentId =
		input.environmentId !== undefined
			? input.environmentId
			: (lookups.pinEnvironmentId ?? existingEnvironmentId);
	if (!cloudWorkspaceId && !environmentId) {
		throw userError({
			code: "BAD_REQUEST",
			message: "A cloud automation needs an environment or a cloud workspace",
			i18nKey: "serverError.automation.cloudNeedsEnvironment",
		});
	}

	return {
		target: {
			targetHostId: CLOUD_HOST_ID,
			v2ProjectId: null,
			v2WorkspaceId: null,
			cloudWorkspaceId,
			environmentId,
			continueAgentSession: false,
		},
		hostsToVerify: [],
		// Only a named environment is checked; one taken from a pin is just the fallback.
		cloud: {
			environmentToVerify:
				input.environmentId && input.environmentId !== existingEnvironmentId
					? input.environmentId
					: null,
		},
	};
}

function refuseFields(
	input: TargetInput,
	fields: (keyof TargetInput)[],
	message: (field: string) => string,
): void {
	for (const field of fields) {
		if (input[field]) {
			throw new TRPCError({ code: "BAD_REQUEST", message: message(field) });
		}
	}
}
