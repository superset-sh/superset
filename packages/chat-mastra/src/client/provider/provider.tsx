import type { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import type { ReactNode } from "react";
import type { ChatMastraServiceRouter } from "../../server/trpc";

export const chatMastraServiceTrpc = createTRPCReact<ChatMastraServiceRouter>();

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
