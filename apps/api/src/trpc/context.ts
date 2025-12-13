import { getSession } from "@superset/auth0/server";
import { createTRPCContext } from "@superset/trpc";

export const createContext = async () => {
	const session = await getSession();
	return createTRPCContext({ session });
};
