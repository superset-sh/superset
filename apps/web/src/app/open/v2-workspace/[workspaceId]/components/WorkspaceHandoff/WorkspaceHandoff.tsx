"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useEffect } from "react";

interface WorkspaceHandoffProps {
	/** Canonical `superset://v2-workspace/<id>` link, already validated. */
	deepLink: string;
	/** Where someone without the desktop app can get it. */
	downloadUrl: string;
}

/**
 * Attempts the native handoff on load, and leaves the same link behind as a
 * button so a browser that blocks the automatic attempt — or a person who
 * dismissed the prompt — still has one obvious way through.
 */
export function WorkspaceHandoff({
	deepLink,
	downloadUrl,
}: WorkspaceHandoffProps) {
	useEffect(() => {
		window.location.href = deepLink;
	}, [deepLink]);

	return (
		<div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">
					<Trans id="web.workspaceHandoff.title">Opening Superset</Trans>
				</h1>
				<p className="text-muted-foreground text-sm">
					<Trans id="web.workspaceHandoff.subtitle">
						Handing this workspace to the desktop app.
					</Trans>
				</p>
			</div>

			<Button asChild>
				<a href={deepLink}>
					<Trans id="web.workspaceHandoff.openButton">Open Superset</Trans>
				</a>
			</Button>

			<div className="space-y-3">
				<p className="text-muted-foreground text-sm">
					<Trans id="web.workspaceHandoff.fallback">
						If nothing opens, your browser may be waiting for you to allow it,
						or Superset is not installed on this computer.
					</Trans>
				</p>
				<a
					href={downloadUrl}
					className="text-muted-foreground/70 hover:text-muted-foreground decoration-muted-foreground/40 text-sm underline underline-offset-4 transition-colors"
				>
					<Trans id="web.workspaceHandoff.download">Download Superset</Trans>
				</a>
			</div>

			<code className="text-muted-foreground/70 bg-muted/50 max-w-full overflow-x-auto rounded-md px-3 py-2 font-mono text-xs whitespace-nowrap">
				{deepLink}
			</code>
		</div>
	);
}
