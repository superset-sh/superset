import type { AppRouter } from "@superset/host-service/trpc";
import { createTRPCReact } from "@trpc/react-query";
import { createContext } from "react";

// Dedicated context — the library default is shared across all createTRPCReact
// clients, letting this Provider shadow the desktop's electronTrpc hooks.
const workspaceTrpcContext = createContext(null);

export const workspaceTrpc = createTRPCReact<AppRouter>({
	abortOnUnmount: true,
	context: workspaceTrpcContext,
});
