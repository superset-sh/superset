import { auth } from "@superset/auth/server";
import { createTRPCContext } from "@superset/trpc";

export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	const session = await auth.api.getSession({
		headers: req.headers,
	});
	return createTRPCContext({
		session,
		auth,
		headers: req.headers,
	});
};
