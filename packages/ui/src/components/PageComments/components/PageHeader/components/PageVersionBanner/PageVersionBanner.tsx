"use client";

import { Trans } from "@lingui/react/macro";
import { History } from "lucide-react";
import { Button } from "../../../../../ui/button";

interface PageVersionBannerProps {
	version: number;
	onExit: () => void;
}

export function PageVersionBanner({ version, onExit }: PageVersionBannerProps) {
	return (
		<div className="flex h-9 shrink-0 items-center justify-center gap-3 border-b bg-muted/40 px-3 text-xs">
			<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
				<History className="size-3.5 shrink-0" />
				<Trans>You are viewing version {version}, read-only</Trans>
			</span>
			<Button size="xs" variant="ghost" onClick={onExit}>
				<Trans>Back to current</Trans>
			</Button>
		</div>
	);
}
