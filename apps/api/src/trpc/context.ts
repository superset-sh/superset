import { auth } from "@clerk/nextjs/server";
import { createTRPCContext } from "@superset/trpc";

export const createContext = async () => {
	const session = await auth();
	return createTRPCContext({ session });
};
