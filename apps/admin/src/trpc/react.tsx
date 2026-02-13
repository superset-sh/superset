"use client";

export { type UseTRPC, useTRPC } from "@superset/trpc/client/react";

import { createTRPCReactProvider } from "@superset/trpc/client/react";
import { env } from "../env";

export const TRPCReactProvider = createTRPCReactProvider({
	apiUrl: env.NEXT_PUBLIC_API_URL,
	isDev: env.NODE_ENV === "development",
});
