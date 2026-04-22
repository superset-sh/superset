import { auth } from "@superset/auth/server";
import { createTRPCContext } from "@superset/trpc";
import { resolveApiKey } from "@/lib/api-key-org";

export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	const session = await auth.api.getSession({
		headers: req.headers,
	});

	let effectiveSession = session;
	if (session) {
		const resolution = await resolveApiKey(req, auth, session.user.id);
		if (resolution.kind === "ok") {
			session.session.activeOrganizationId = resolution.organizationId;
		} else if (resolution.kind === "invalid") {
			effectiveSession = null;
		}
	}

	return createTRPCContext({
		session: effectiveSession,
		auth,
		headers: req.headers,
	});
};
