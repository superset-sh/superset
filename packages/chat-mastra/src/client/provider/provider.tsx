import type { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { createContext, type ReactNode } from "react";
import type { ChatMastraServiceRouter } from "../../server/trpc";

const chatMastraTrpcContext = createContext<unknown>(null);

export const chatMastraServiceTrpc = createTRPCReact<ChatMastraServiceRouter>({
	context: chatMastraTrpcContext,
});

export type ChatMastraServiceClient = ReturnType<
	typeof chatMastraServiceTrpc.createClient
>;

interface ChatMastraServiceProviderProps {
	client: ChatMastraServiceClient;
	queryClient: QueryClient;
	children: ReactNode;
}

export function ChatMastraServiceProvider({
	client,
	queryClient,
	children,
}: ChatMastraServiceProviderProps) {
	return (
		<chatMastraServiceTrpc.Provider client={client} queryClient={queryClient}>
			{children}
		</chatMastraServiceTrpc.Provider>
	);
}
