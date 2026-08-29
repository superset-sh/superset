"use client";

import { Trans } from "@lingui/react/macro";
import { CheckIcon, LinkIcon } from "lucide-react";
import { useState } from "react";
import { RiLinkedinBoxFill, RiTwitterXFill } from "react-icons/ri";

interface ShareButtonsProps {
	url: string;
	text: string;
}

const BUTTON =
	"inline-flex items-center gap-2 px-3 py-1.5 text-[0.68rem] font-mono uppercase tracking-[0.12em] border border-border rounded-[2px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors";

export function ShareButtons({ url, text }: ShareButtonsProps) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);

			setTimeout(() => setCopied(false), 2000);
		} catch {}
	};

	return (
		<div className="flex flex-wrap items-center justify-center gap-2">
			<a
				className={BUTTON}
				href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
				target="_blank"
				rel="noopener noreferrer"
			>
				<RiTwitterXFill className="size-3.5" />
				<Trans id="marketing.profile.share.post">Post</Trans>
			</a>
			<a
				className={BUTTON}
				href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
				target="_blank"
				rel="noopener noreferrer"
			>
				<RiLinkedinBoxFill className="size-3.5" />
				<Trans id="marketing.profile.share.share">Share</Trans>
			</a>
			<button type="button" className={BUTTON} onClick={copy}>
				{copied ? (
					<CheckIcon className="size-3" />
				) : (
					<LinkIcon className="size-3" />
				)}
				{copied ? (
					<Trans id="marketing.profile.share.copied">Copied</Trans>
				) : (
					<Trans id="marketing.profile.share.copyLink">Copy link</Trans>
				)}
			</button>
		</div>
	);
}
