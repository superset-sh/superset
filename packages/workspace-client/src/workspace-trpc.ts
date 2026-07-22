import type { AppRouter } from "@superset/host-service/trpc";
import { createTRPCReact } from "@trpc/react-query";
import { createContext } from "react";

// Every createTRPCReact client shares @trpc/react-query's default React
// context, so without this override workspaceTrpc.Provider would shadow the
// desktop's electronTrpc provider and hooks under it would silently call the
// host-service router.
const workspaceTrpcContext = createContext(null);

export const workspaceTrpc = createTRPCReact<AppRouter>({
	abortOnUnmount: true,
	context: workspaceTrpcContext,
});
