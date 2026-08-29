import {
	buildWorkspaceDeepLink,
	isWorkspaceId,
	pickWorkspaceHandoffParams,
} from "@superset/shared/workspace-links";
import type { Metadata } from "next";
import Image from "next/image";

import { env } from "@/env";
import { i18n } from "@/lib/i18n-server";
import { WorkspaceHandoff } from "./components/WorkspaceHandoff";

/**
 * Public, authentication-free handoff from an HTTPS link to the native
 * `superset://` workspace link. External systems (Linear, GitHub, email) only
 * accept HTTP(S), so this page is the supported way to publish a link that
 * opens a workspace.
 *
 * It resolves nothing: no session, no workspace lookup, no substitution. The
 * desktop app stays responsible for finding the workspace on the right host
 * and for its own missing-or-inaccessible state.
 */

export const metadata: Metadata = {
	title: "Open in Superset",
	// The URL names a workspace. Nothing here belongs in a search index.
	robots: { index: false, follow: false },
};

interface OpenWorkspacePageProps {
	params: Promise<{ workspaceId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Validates the public workspace id, narrows the query string to supported
 * handoff parameters, and renders either the native handoff or a clear invalid
 * link state without looking up private workspace data.
 */
export default async function OpenWorkspacePage({
	params,
	searchParams,
}: OpenWorkspacePageProps) {
	const { workspaceId } = await params;
	const query = await searchParams;

	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="container mx-auto px-6 py-6">
				<a href={env.NEXT_PUBLIC_MARKETING_URL}>
					<Image
						src="/title.svg"
						alt="Superset"
						width={140}
						height={24}
						priority
					/>
				</a>
			</header>
			<main className="flex flex-1 items-center justify-center px-6 pb-16">
				{isWorkspaceId(workspaceId) ? (
					<WorkspaceHandoff
						deepLink={buildWorkspaceDeepLink(
							workspaceId,
							pickWorkspaceHandoffParams(query),
						)}
						downloadUrl={`${env.NEXT_PUBLIC_MARKETING_URL}/download`}
					/>
				) : (
					<div className="flex w-full max-w-md flex-col items-center gap-2 text-center">
						<h1 className="text-2xl font-semibold tracking-tight">
							{i18n._({
								id: "web.workspaceHandoff.invalidTitle",
								message: "That isn't a valid workspace link",
							})}
						</h1>
						<p className="text-muted-foreground text-sm">
							{i18n._({
								id: "web.workspaceHandoff.invalidBody",
								message:
									"A workspace link ends with the workspace ID. Check the link you followed, or open the workspace from the Superset app.",
							})}
						</p>
					</div>
				)}
			</main>
		</div>
	);
}
