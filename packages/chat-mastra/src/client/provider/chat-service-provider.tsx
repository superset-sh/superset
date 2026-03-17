import type { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { createContext, type ReactNode } from "react";
import type { ChatServiceRouter } from "../../server/desktop";

const chatServiceTrpcContext = createContext<unknown>(null);

export const chatServiceTrpc = createTRPCReact<ChatServiceRouter>({
	context: chatServiceTrpcContext,
});

export type ChatServiceClient = ReturnType<typeof chatServiceTrpc.createClient>;

interface ChatServiceProviderProps {
	client: ChatServiceClient;
	queryClient: QueryClient;
	children: ReactNode;
}

export function ChatServiceProvider({
	client,
	queryClient,
	children,
}: ChatServiceProviderProps) {
	return (
		<chatServiceTrpc.Provider client={client} queryClient={queryClient}>
			{children}
		</chatServiceTrpc.Provider>
	);
}
