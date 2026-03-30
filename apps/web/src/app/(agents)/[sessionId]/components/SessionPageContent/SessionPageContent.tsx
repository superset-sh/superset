"use client";

import { useState } from "react";
import type { MockSession } from "../../../mock-data";
import { FollowUpInput } from "../FollowUpInput";
import { SessionChat } from "../SessionChat";
import { SessionDiff } from "../SessionDiff";
import { SessionHeader } from "../SessionHeader";
import { SessionTabs } from "../SessionTabs";

type ActiveTab = "chat" | "diff";

type SessionPageContentProps = {
	session: MockSession;
};

const panelIds = {
	chat: "session-panel-chat",
	diff: "session-panel-diff",
} as const;

const tabIds = {
	chat: "session-tab-chat",
	diff: "session-tab-diff",
} as const;

export function SessionPageContent({ session }: SessionPageContentProps) {
	const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<SessionHeader session={session} />
			<SessionTabs activeTab={activeTab} onTabChange={setActiveTab} />
			<div
				role="tabpanel"
				id={panelIds[activeTab]}
				aria-labelledby={tabIds[activeTab]}
				className="flex-1 overflow-hidden"
			>
				{activeTab === "chat" ? <SessionChat /> : <SessionDiff />}
			</div>
			{activeTab === "chat" && <FollowUpInput />}
		</div>
	);
}
