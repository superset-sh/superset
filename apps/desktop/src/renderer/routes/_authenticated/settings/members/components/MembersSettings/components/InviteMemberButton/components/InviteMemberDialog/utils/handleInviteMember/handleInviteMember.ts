import {
	canInvite,
	ORGANIZATION_ROLES,
	type OrganizationRole,
} from "@superset/shared/auth";

export interface InviteMemberArgs {
	organizationId: string;
	email: string;
	role: OrganizationRole;
}

export interface InviteMemberResponse {
	data: unknown;
	error: { message?: string; status?: number; statusText?: string } | null;
}

export interface HandleInviteMemberDeps {
	currentUserRole: OrganizationRole;
	inviteMember: (args: InviteMemberArgs) => Promise<InviteMemberResponse>;
	onSuccess: (message: string) => void;
	onError: (message: string) => void;
}

// better-auth's client uses @better-fetch/fetch, which resolves with
// { data, error } instead of throwing on HTTP errors. Awaiting without
// inspecting `error` was treating server-side failures as successes, so the
// "Invitation sent" toast appeared while no invitation row was created.
export async function handleInviteMember(
	args: InviteMemberArgs,
	deps: HandleInviteMemberDeps,
): Promise<boolean> {
	const { currentUserRole, inviteMember, onSuccess, onError } = deps;

	if (!canInvite(currentUserRole, args.role)) {
		onError(`Cannot invite users as ${ORGANIZATION_ROLES[args.role].name}`);
		return false;
	}

	try {
		const result = await inviteMember(args);

		if (result.error) {
			onError(result.error.message || "Failed to send invitation");
			return false;
		}

		onSuccess(`Invitation sent to ${args.email}`);
		return true;
	} catch (error) {
		onError(
			error instanceof Error ? error.message : "Failed to send invitation",
		);
		return false;
	}
}
