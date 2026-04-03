"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MS_PER_DAY } from "../../constants";
import type { MockSession } from "../../mock-data";
import { SessionCard } from "./components/SessionCard";

function groupSessionsByRecency(sessions: MockSession[]) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - MS_PER_DAY);

	const groups: { label: string; sessions: MockSession[] }[] = [
		{ label: "Today", sessions: [] },
		{ label: "Yesterday", sessions: [] },
		{ label: "Older", sessions: [] },
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
					placeholder="Search sessions..."
					aria-label="Search sessions"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>

			{/* Grouped sessions */}
			{groups.length === 0 ? (
				<p className="py-8 text-center text-sm text-muted-foreground">
					No sessions found
				</p>
			) : (
				groups.map((group) => (
					<div key={group.label}>
						<h3 className="px-1 py-2 text-xs font-medium text-muted-foreground">
							{group.label}
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
