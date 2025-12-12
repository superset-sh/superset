import { auth } from "@clerk/nextjs/server";

export const createContext = async () => {
	return { auth: await auth() };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
