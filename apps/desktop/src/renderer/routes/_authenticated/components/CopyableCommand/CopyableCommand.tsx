import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

interface CopyableCommandProps {
	command: string;
	/** `sm` is a chip that sits inside a line of text. */
	size?: "md" | "sm";
	/** Shows the command's shape before it is ready to run; copying is off. */
	disabled?: boolean;
	/** Why copying is off, on hover. Only used while `disabled`. */
	disabledHint?: string;
}

export function CopyableCommand({
	command,
	size = "md",
	disabled = false,
	disabledHint,
}: CopyableCommandProps) {
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
		timerRef.current = window.setTimeout(() => setCopied(false), 2000);
	};

	const small = size === "sm";

	const copyButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className={cn("shrink-0", small ? "size-5" : "size-6")}
			onClick={() => void copy()}
			disabled={disabled}
			aria-label="Copy command"
		>
			{copied ? (
				<LuCheck
					className={cn(small ? "size-3" : "size-3.5", "text-emerald-500")}
				/>
			) : (
				<LuCopy className={small ? "size-3" : "size-3.5"} />
			)}
		</Button>
	);

	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-1 rounded-md border bg-muted/40",
				small ? "py-0 pl-1.5 pr-0.5" : "gap-1.5 py-1 pl-2.5 pr-1",
				disabled && "opacity-60",
			)}
		>
			<code
				className={cn(
					"min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono",
					disabled
						? "text-muted-foreground"
						: "select-text cursor-text text-foreground",
					small ? "text-[11px]" : "text-xs",
				)}
			>
				{command}
			</code>
			{disabled && disabledHint ? (
				<Tooltip>
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
