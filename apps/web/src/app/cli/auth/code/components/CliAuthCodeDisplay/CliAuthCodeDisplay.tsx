"use client";

import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { LuClipboard, LuClipboardCheck } from "react-icons/lu";

interface CliAuthCodeDisplayProps {
	code: string;
	state: string;
}

async function copyToClipboard(value: string): Promise<boolean> {
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(value);
			return true;
		} catch {
			// fall through
		}
	}
	if (typeof document === "undefined") return false;
	try {
		const textarea = document.createElement("textarea");
		textarea.value = value;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);
		textarea.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(textarea);
		return ok;
	} catch {
		return false;
	}
}

function useCopiedFlag() {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const flash = () => {
		setCopied(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setCopied(false), 2000);
	};
	return [copied, flash] as const;
}

export function CliAuthCodeDisplay({ code, state }: CliAuthCodeDisplayProps) {
	const value = `${code}#${state}`;
	const [boxCopied, flashBox] = useCopiedFlag();
	const [buttonCopied, flashButton] = useCopiedFlag();

	const handleCopy = async (flash: () => void) => {
		const ok = await copyToClipboard(value);
		if (ok) flash();
	};

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col items-center space-y-6 px-6 text-center">
			<h1 className="text-3xl font-semibold tracking-tight">
				Authentication Code
			</h1>
			<p className="text-muted-foreground">Paste this into Superset CLI:</p>

			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => handleCopy(flashBox)}
						className="bg-muted/50 hover:bg-muted/70 focus-visible:ring-ring/50 w-full cursor-pointer overflow-x-auto rounded-lg border px-6 py-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
					>
						<code className="font-mono text-sm break-all select-all">
							{value}
						</code>
					</button>
				</TooltipTrigger>
				<TooltipContent>
					{boxCopied ? "Copied!" : "Click to copy"}
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button onClick={() => handleCopy(flashButton)}>
						{buttonCopied ? (
							<>
								<LuClipboardCheck /> Copied!
							</>
						) : (
							<>
								<LuClipboard /> Copy code
							</>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{buttonCopied ? "Copied!" : "Copy to clipboard"}
				</TooltipContent>
			</Tooltip>

			<p className="text-muted-foreground text-xs">
				You can close this tab once the code is pasted.
			</p>
		</div>
	);
}
