import { auth } from "@superset/auth/server";
import { headers } from "next/headers";

import { api } from "@/trpc/server";
import { WorkspaceList } from "./components/WorkspaceList";

export default async function MobileHomePage() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	const trpc = await api();
	const pairingSessions = await trpc.mobile.getActiveSessions.query();

	return (
		<div className="flex flex-col gap-6">
			<section>
				<h1 className="mb-4 text-2xl font-medium text-white">Workspaces</h1>

				{pairingSessions.length === 0 ? (
					<EmptyState />
				) : (
					<WorkspaceList sessions={pairingSessions} />
				)}
			</section>

			<section className="rounded-xl border border-white/10 bg-white/5 p-4">
				<h2 className="mb-2 text-sm font-medium text-white/70">
					Connect a Workspace
				</h2>
				<p className="mb-4 text-sm text-white/50">
					Scan a QR code from your desktop to connect a workspace and start
					using voice commands.
				</p>
				<a
					href="/mobile/scan"
					className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
				>
					<ScanIcon className="h-4 w-4" />
					Scan QR Code
				</a>
			</section>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 py-12 text-center">
			<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
				<WorkspacesIcon className="h-6 w-6 text-white/50" />
			</div>
			<h3 className="mb-2 text-lg font-medium text-white">No Workspaces</h3>
			<p className="max-w-xs text-sm text-white/50">
				Connect to a workspace by scanning a QR code from your desktop app.
			</p>
		</div>
	);
}

function WorkspacesIcon({ className }: { className?: string }) {
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
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</svg>
	);
}

function ScanIcon({ className }: { className?: string }) {
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
			<path d="M3 7V5a2 2 0 0 1 2-2h2" />
			<path d="M17 3h2a2 2 0 0 1 2 2v2" />
			<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
			<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
			<rect x="7" y="7" width="10" height="10" rx="1" />
		</svg>
	);
}
