import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

const COPIED_RESET_MS = 2000;

interface CopyableCommandProps {
	command: string;
	/** Shows the command's shape before it is ready to run; copying is off. */
	disabled?: boolean;
	/** Why copying is off, on hover. Only used while `disabled`. */
	disabledHint?: string;
}

export function CopyableCommand({
	command,
	disabled = false,
	disabledHint,
}: CopyableCommandProps) {
	const { t } = useLingui();
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, []);

	const copy = async () => {
		await navigator.clipboard.writeText(command);
		setCopied(true);
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(
			() => setCopied(false),
			COPIED_RESET_MS,
		);
	};

	const copyButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="size-6 shrink-0"
			onClick={() => void copy()}
			disabled={disabled}
			aria-label={t({ message: "Copy command" })}
		>
			{copied ? (
				<LuCheck className="size-3.5 text-emerald-500" />
			) : (
				<LuCopy className="size-3.5" />
			)}
		</Button>
	);

	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2.5 pr-1",
				disabled && "opacity-60",
			)}
		>
			<code
				className={cn(
					"min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs",
					disabled
						? "text-muted-foreground"
						: "select-text cursor-text text-foreground",
				)}
			>
				{command}
			</code>
			{disabled && disabledHint ? (
				<Tooltip>
					{/* A disabled button emits no pointer events, so the tooltip
					    hangs off a wrapper that still receives them. */}
					<TooltipTrigger asChild>
						<span className="shrink-0">{copyButton}</span>
					</TooltipTrigger>
					<TooltipContent>{disabledHint}</TooltipContent>
				</Tooltip>
			) : (
				copyButton
			)}
		</div>
	);
}
