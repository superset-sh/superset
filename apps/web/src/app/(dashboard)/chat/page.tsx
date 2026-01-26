"use client";

import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useTRPC } from "@/trpc/react";
import { ChatSessionList } from "./components/ChatSessionList";

export default function ChatPage() {
	const trpc = useTRPC();
	const router = useRouter();

	const sessionsQuery = useSuspenseQuery(
		trpc.chat.listSessions.queryOptions({}),
	);

	const createSessionMutation = useMutation(
		trpc.chat.createSession.mutationOptions({
			onSuccess: (data) => {
				router.push(`/chat/${data.session.id}`);
			},
		}),
	);

	const handleNewChat = useCallback(() => {
		createSessionMutation.mutate({});
	}, [createSessionMutation]);

	const sessions = sessionsQuery.data.map((row) => ({
		id: row.session.id,
		title: row.session.title,
		updatedAt: new Date(row.session.updatedAt),
		creatorName: row.creator?.name ?? null,
	}));

	return (
		<div className="max-w-2xl">
			<ChatSessionList sessions={sessions} onNewChat={handleNewChat} />
		</div>
	);
}
