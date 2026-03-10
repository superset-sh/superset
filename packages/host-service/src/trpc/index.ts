import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { HostServiceContext } from "../git/types";

const t = initTRPC
	.context<HostServiceContext>()
	.create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
