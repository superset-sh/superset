"use client";

import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuClipboard } from "react-icons/lu";

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

export function CliAuthCodeDisplay({ code, state }: CliAuthCodeDisplayProps) {
	const value = `${code}#${state}`;
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const codeRef = useRef<HTMLElement>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const selectCode = () => {
		const node = codeRef.current;
		if (!node || typeof window === "undefined") return;
		const selection = window.getSelection();
		if (!selection) return;
		const range = document.createRange();
		range.selectNodeContents(node);
		selection.removeAllRanges();
		selection.addRange(range);
	};

	const handleCopy = async () => {
		const ok = await copyToClipboard(value);
		selectCode();
		if (!ok) return;
		setCopied(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="flex w-full flex-col items-center space-y-6 px-6 text-center">
			<h1 className="text-3xl font-semibold tracking-tight">
				Authentication Code
			</h1>
			<p className="text-muted-foreground">Paste this into Superset CLI:</p>

			{/* biome-ignore lint/a11y/useSemanticElements: keep as div so the inner <code> stays selectable as a ctrl+c fallback if clipboard write fails — wrapping in a button disrupts selection focus */}
			<div
				role="button"
				tabIndex={0}
				onClick={handleCopy}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						void handleCopy();
					}
				}}
				className="bg-muted/50 hover:bg-muted/70 focus-visible:ring-ring/50 w-fit max-w-full cursor-pointer overflow-x-auto rounded-lg border px-6 py-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
			>
				<code ref={codeRef} className="font-mono text-sm whitespace-nowrap">
					{value}
				</code>
			</div>

			<Button variant="ghost" onClick={handleCopy}>
				{copied ? (
					<>
						<LuCheck /> Copied!
					</>
				) : (
					<>
						<LuClipboard /> Copy Code
					</>
				)}
			</Button>
		</div>
	);
}
