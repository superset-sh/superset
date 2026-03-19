import type { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { createContext, type ReactNode } from "react";
import type { ChatRuntimeServiceRouter } from "../../server/trpc";

const chatTrpcContext = createContext<unknown>(null);

export const chatRuntimeServiceTrpc = createTRPCReact<ChatRuntimeServiceRouter>(
	{
		context: chatTrpcContext,
	},
);

export type ChatRuntimeServiceClient = ReturnType<
	typeof chatRuntimeServiceTrpc.createClient
>;

interface ChatRuntimeServiceProviderProps {
	client: ChatRuntimeServiceClient;
	queryClient: QueryClient;
	children: ReactNode;
}

export function ChatRuntimeServiceProvider({
	client,
	queryClient,
	children,
}: ChatRuntimeServiceProviderProps) {
	return (
		<chatRuntimeServiceTrpc.Provider client={client} queryClient={queryClient}>
			{children}
		</chatRuntimeServiceTrpc.Provider>
	);
}
