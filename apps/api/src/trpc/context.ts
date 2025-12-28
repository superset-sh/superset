import { createTRPCContext } from "@superset/trpc";
import { authenticateRequest } from "@/lib/auth";

export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	const userId = await authenticateRequest(req);
	return createTRPCContext({ userId });
};
