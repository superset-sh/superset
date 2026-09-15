"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Globe, Link2, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../../../ui/button";
import { toast } from "../../../../../ui/sonner";

interface PagePublicBannerProps {
	url: string;
	onOpenShareSettings: () => void;
}

export function PagePublicBanner({
	url,
	onOpenShareSettings,
}: PagePublicBannerProps) {
	const { t } = useLingui();
	const [copied, setCopied] = useState(false);

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error(t({ message: "Could not copy the link" }));
		}
	};

	return (
		<div className="flex h-9 shrink-0 items-center justify-center gap-3 border-b bg-muted/40 px-3 text-xs">
			<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
				<Globe className="size-3.5 shrink-0" />
				<Trans>
					This page is live at{" "}
					<span className="truncate font-medium text-foreground">
						{url.replace(/^https?:\/\//, "")}
					</span>
				</Trans>
			</span>

			<div className="flex shrink-0 items-center gap-1">
				<Button size="xs" variant="ghost" onClick={() => void copyLink()}>
					{copied ? (
						<Check className="size-3.5 text-primary" />
					) : (
						<Link2 className="size-3.5" />
					)}
					{copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
				</Button>
				<Button size="xs" variant="ghost" onClick={onOpenShareSettings}>
					<Settings2 className="size-3.5" />
					<Trans>Share settings</Trans>
				</Button>
			</div>
		</div>
	);
}
