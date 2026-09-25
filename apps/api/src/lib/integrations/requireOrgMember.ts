import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

export type OrgMember = {
	organizationId: string;
	userId: string;
};

/**
 * The connect-route preamble: who is asking, for which organization, and
 * whether they belong to it. Returns the error response to send when a check
 * fails.
 *
 * It deliberately hands back no state token: a state is only ever minted by
 * `beginOAuthFlow`, which binds it to the asking browser in the same step.
 */
export async function requireOrgMember(
	request: Request,
): Promise<OrgMember | Response> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const organizationId = new URL(request.url).searchParams.get(
		"organizationId",
	);
	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
	}

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	return { organizationId, userId: session.user.id };
}
