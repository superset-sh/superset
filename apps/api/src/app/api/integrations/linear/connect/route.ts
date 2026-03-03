import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";
import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";
import { getLinearPublicApiUrl } from "../lib/public-api-url";

export async function GET(request: Request) {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");

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

	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const linearAuthUrl = new URL("https://linear.app/oauth/authorize");
	linearAuthUrl.searchParams.set("client_id", env.LINEAR_CLIENT_ID);
	linearAuthUrl.searchParams.set(
		"redirect_uri",
		`${getLinearPublicApiUrl()}/api/integrations/linear/callback`,
	);
	linearAuthUrl.searchParams.set("response_type", "code");
	linearAuthUrl.searchParams.set("scope", "read,write,issues:create");
	linearAuthUrl.searchParams.set("state", state);

	return Response.redirect(linearAuthUrl.toString());
}
