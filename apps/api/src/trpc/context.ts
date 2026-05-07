import { auth } from "@superset/auth/server";
import { createTRPCContext } from "@superset/trpc";

export const createContext = ({ req }: { req: Request; resHeaders: Headers }) =>
	createTRPCContext({ auth, headers: req.headers });
