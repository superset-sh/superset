import { QueryClient } from "@tanstack/react-query";

// Shared QueryClient instance for both TRPCProvider and router loaders
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			networkMode: "always",
			retry: false,
		},
		mutations: {
			networkMode: "always",
			retry: false,
		},
	},
});
