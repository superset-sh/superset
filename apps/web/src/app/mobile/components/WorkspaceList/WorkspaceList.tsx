"use client";

import { cn } from "@superset/ui/utils";
import Link from "next/link";

interface PairingSession {
	id: string;
	workspaceId: string | null;
	workspaceName: string | null;
	projectPath: string | null;
	desktopInstanceId: string;
	pairedAt: Date | null;
}

interface WorkspaceListProps {
	sessions: PairingSession[];
}

export function WorkspaceList({ sessions }: WorkspaceListProps) {
	return (
		<div className="flex flex-col gap-3">
			{sessions.map((session) => (
				<WorkspaceCard key={session.id} session={session} />
			))}
		</div>
	);
}

function WorkspaceCard({ session }: { session: PairingSession }) {
	const workspaceName = session.workspaceName ?? "Unnamed Workspace";
	const projectPath = session.projectPath ?? "Unknown project";
	const projectName = projectPath.split("/").pop() ?? projectPath;

	return (
		<Link
			href={`/mobile/workspaces/${session.id}`}
			className={cn(
				"flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors",
				"hover:border-white/20 hover:bg-white/10 active:bg-white/15",
			)}
		>
			<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
				<FolderIcon className="h-6 w-6 text-white" />
			</div>

			<div className="flex-1 overflow-hidden">
				<h3 className="truncate text-base font-medium text-white">
					{workspaceName}
				</h3>
				<p className="truncate text-sm text-white/50">{projectName}</p>
			</div>

			<div className="flex items-center gap-2">
				<span className="flex h-2 w-2 rounded-full bg-green-500" />
				<ChevronRightIcon className="h-5 w-5 text-white/30" />
			</div>
		</Link>
	);
}

function FolderIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
		</svg>
	);
}

function ChevronRightIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="m9 18 6-6-6-6" />
		</svg>
	);
}
