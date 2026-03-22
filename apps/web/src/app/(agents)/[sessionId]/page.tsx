"use client";

import { use, useState } from "react";
import { mockSessions } from "../mock-data";
import { FollowUpInput } from "./components/FollowUpInput";
import { SessionChat } from "./components/SessionChat";
import { SessionDiff } from "./components/SessionDiff";
import { SessionHeader } from "./components/SessionHeader";
import { SessionTabs } from "./components/SessionTabs";

type ActiveTab = "chat" | "diff";

export default function SessionPage({
	params,
}: {
	params: Promise<{ sessionId: string }>;
}) {
	const { sessionId } = use(params);
	const session = mockSessions.find((s) => s.id === sessionId);
	const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

	if (!session) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<p className="text-muted-foreground">Session not found</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<SessionHeader session={session} />
			<SessionTabs activeTab={activeTab} onTabChange={setActiveTab} />
			<div className="flex-1 overflow-hidden">
				{activeTab === "chat" ? <SessionChat /> : <SessionDiff />}
			</div>
			{activeTab === "chat" && <FollowUpInput />}
		</div>
	);
}
