"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MS_PER_DAY } from "../../constants";
import type { MockSession } from "../../mock-data";
import { SessionCard } from "./components/SessionCard";

function groupSessionsByRecency(sessions: MockSession[]) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - MS_PER_DAY);

	const groups: {
		id: string;
		label: MessageDescriptor;
		sessions: MockSession[];
	}[] = [
		{
			id: "today",
			label: msg({ message: "Today" }),
			sessions: [],
		},
		{
			id: "yesterday",
			label: msg({
				message: "Yesterday",
			}),
			sessions: [],
		},
		{
			id: "older",
			label: msg({ message: "Older" }),
			sessions: [],
		},
	];

	for (const session of sessions) {
		if (session.createdAt >= today) {
			groups[0]?.sessions.push(session);
		} else if (session.createdAt >= yesterday) {
			groups[1]?.sessions.push(session);
		} else {
			groups[2]?.sessions.push(session);
		}
	}

	return groups.filter((g) => g.sessions.length > 0);
}

type SessionListProps = {
	sessions: MockSession[];
	workspaceId: string;
};

export function SessionList({ sessions, workspaceId }: SessionListProps) {
	const { t } = useLingui();
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		if (!search.trim()) return sessions;
		const q = search.toLowerCase();
		return sessions.filter((session) =>
			session.title.toLowerCase().includes(q),
		);
	}, [search, sessions]);

	const groups = useMemo(() => groupSessionsByRecency(filtered), [filtered]);

	return (
		<div className="flex flex-col gap-2">
			{/* Search bar */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder={t({
						message: "Search sessions...",
					})}
					aria-label={t({
						message: "Search sessions",
					})}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>

			{/* Grouped sessions */}
			{groups.length === 0 ? (
				<p className="py-8 text-center text-sm text-muted-foreground">
					<Trans>No sessions found</Trans>
				</p>
			) : (
				groups.map((group) => (
					<div key={group.id}>
						<h3 className="px-1 py-2 text-xs font-medium text-muted-foreground">
							{i18n._(group.label)}
						</h3>
						<div className="flex flex-col gap-1">
							{group.sessions.map((session) => (
								<SessionCard
									key={session.id}
									session={session}
									workspaceId={workspaceId}
								/>
							))}
						</div>
					</div>
				))
			)}
		</div>
	);
}
