import type { RendererContext } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { LuCheck, LuCopy } from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { CommentPaneData, PaneViewerData } from "../../../../../../types";

interface CommentPaneHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
}

export function CommentPaneHeaderExtras({
	context,
}: CommentPaneHeaderExtrasProps) {
	const data = context.pane.data as CommentPaneData;
	const [copied, setCopied] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		};
	}, []);

	const handleCopyAll = useCallback(() => {
		void electronTrpcClient.external.copyText
			.mutate(data.body)
			.then(() => {
				if (!isMountedRef.current) return;
				if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
				setCopied(true);
				copyTimerRef.current = setTimeout(() => {
					if (!isMountedRef.current) return;
					setCopied(false);
					copyTimerRef.current = null;
				}, 1500);
			})
			.catch((err) => {
				console.warn("Failed to copy comment text", err);
			});
	}, [data.body]);

	return (
		<>
			{data.url && (
				<Tooltip>
					<TooltipTrigger asChild>
						<a
							href={data.url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Open on GitHub"
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							<FaGithub className="size-3.5" />
						</a>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Open on GitHub
					</TooltipContent>
				</Tooltip>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Copy comment"
						onClick={handleCopyAll}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						{copied ? (
							<LuCheck className="size-3.5" />
						) : (
							<LuCopy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{copied ? "Copied" : "Copy comment"}
				</TooltipContent>
			</Tooltip>
		</>
	);
}
