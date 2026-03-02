import type { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import type { ReactNode } from "react";
import type { ChatServiceRouter } from "../../host/router/router";

export const chatServiceTrpc = createTRPCReact<ChatServiceRouter>();

type ChatServiceClient = ReturnType<typeof chatServiceTrpc.createClient>;

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
