"use client";

import { Trans } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { CheckIcon, ChevronDownIcon, LinkIcon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { RiLinkedinBoxFill, RiTwitterXFill } from "react-icons/ri";

interface ShareMenuProps {
	url: string;
	text: string;
}

export function ShareMenu({ url, text }: ShareMenuProps) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {}
	};
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
				>
					{copied ? (
						<CheckIcon className="size-3.5" />
					) : (
						<Share2Icon className="size-3.5" />
					)}
					{copied ? <Trans>Copied</Trans> : <Trans>Share</Trans>}
					<ChevronDownIcon className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="min-w-40 rounded-[2px] border-border bg-background"
			>
				<DropdownMenuItem onSelect={copy} className="min-h-11 rounded-[1px]">
					<LinkIcon className="size-3.5" />
					<Trans>Copy link</Trans>
				</DropdownMenuItem>
				<DropdownMenuItem asChild className="min-h-11 rounded-[1px]">
					<a
						href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						<RiTwitterXFill className="size-3.5" />X
					</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild className="min-h-11 rounded-[1px]">
					<a
						href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						<RiLinkedinBoxFill className="size-3.5" />
						LinkedIn
					</a>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
