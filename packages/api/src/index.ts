export type { AppRouter } from "./root";
export { appRouter } from "./root";
export { createTRPCContext, createTRPCRouter } from "./trpc";

import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "./root";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
