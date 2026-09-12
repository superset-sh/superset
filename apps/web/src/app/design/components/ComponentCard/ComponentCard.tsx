"use client";

import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

interface ComponentCardProps {
	title: string;
	importPath: string;
	/** Set false for source paths / globs that can't be pasted as an import. */
	copyable?: boolean;
	description?: string;
	/** Stretch the card across the full grid width for wide demos. */
	span?: boolean;
	/** Remove padding + centering for demos that manage their own layout. */
	bleed?: boolean;
	children: React.ReactNode;
}

export function ComponentCard({
	title,
	importPath,
	copyable = true,
	description,
	span = false,
	bleed = false,
	children,
}: ComponentCardProps) {
	const [copied, setCopied] = useState(false);

	const copyImport = async () => {
		await navigator.clipboard.writeText(importPath);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div
			className={cn(
				"group/card flex flex-col overflow-hidden rounded-lg border border-border bg-card/40",
				span && "md:col-span-2",
			)}
		>
			<div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
				<div className="min-w-0">
					<h3 className="text-sm font-medium text-foreground">{title}</h3>
					{description && (
						<p className="mt-0.5 text-xs text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				{copyable ? (
					<button
						type="button"
						onClick={copyImport}
						title={i18n._(
							msg({
								message: "Copy import path",
							}),
						)}
						className="flex max-w-[55%] shrink-0 items-center gap-1.5 rounded-md border border-transparent bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
					>
						<span className="truncate">{importPath}</span>
						{copied ? (
							<CheckIcon className="size-3 shrink-0 text-emerald-500" />
						) : (
							<CopyIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100" />
						)}
					</button>
				) : (
					<span
						title={i18n._(
							msg({
								message: "Source path (not an import)",
							}),
						)}
						className="flex max-w-[55%] shrink-0 items-center rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground"
					>
						<span className="truncate">{importPath}</span>
					</span>
				)}
			</div>
			<div
				className={cn(
					"flex-1",
					bleed
						? "p-0"
						: "flex min-h-32 flex-wrap content-center items-center justify-center gap-4 p-6",
				)}
			>
				{children}
			</div>
		</div>
	);
}
