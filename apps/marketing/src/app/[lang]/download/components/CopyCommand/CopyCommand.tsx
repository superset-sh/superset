"use client";

import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { HiMiniCheck, HiMiniClipboard } from "react-icons/hi2";
import { track } from "@/lib/analytics";

const COPIED_RESET_MS = 2000;

interface CopyCommandProps {
	command: string;
	/** Analytics label for which install command was copied */
	source: string;
}

export function CopyCommand({ command, source }: CopyCommandProps) {
	const { t } = useLingui();
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, []);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(command);
		} catch {
			// Clipboard is unavailable (insecure context, denied permission). The
			// command stays selectable, so there is nothing to recover from.
			return;
		}
		track("download_command_copied", { source });
		setCopied(true);
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(
			() => setCopied(false),
			COPIED_RESET_MS,
		);
	}

	return (
		<div className="flex w-full min-w-0 items-center gap-2 border border-border bg-muted/30 py-2 pr-2 pl-3">
			<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground scrollbar-hide">
				{command}
			</code>
			<button
				type="button"
				onClick={handleCopy}
				className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground"
				aria-label={
					copied
						? t({ id: "marketing.download.copied", message: "Copied" })
						: t({ id: "marketing.download.copy", message: "Copy command" })
				}
			>
				{copied ? (
					<HiMiniCheck className="size-4 text-brand" />
				) : (
					<HiMiniClipboard className="size-4" />
				)}
			</button>
		</div>
	);
}
