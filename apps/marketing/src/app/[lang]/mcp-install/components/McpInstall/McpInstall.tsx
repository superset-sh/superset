"use client";

import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { DEFAULT_MCP_INSTALL_TAB, MCP_INSTALL_TABS } from "./constants";

export function McpInstall() {
	const { t } = useLingui();
	const [activeTabId, setActiveTabId] = useState(DEFAULT_MCP_INSTALL_TAB.id);
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);

	const activeTab =
		MCP_INSTALL_TABS.find((tab) => tab.id === activeTabId) ??
		DEFAULT_MCP_INSTALL_TAB;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(activeTab.content);
			setCopyError(null);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopyError(
				t({
					message: "Copy failed. Select the text and copy it manually.",
				}),
			);
		}
	};

	return (
		<div className="w-full border border-border rounded-[2px] bg-foreground/[0.03] text-left">
			<div className="flex items-center justify-between border-b border-border pl-2 pr-1">
				<div className="flex items-center overflow-x-auto">
					{MCP_INSTALL_TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => {
								setActiveTabId(tab.id);
								setCopied(false);
								setCopyError(null);
							}}
							className={`px-3 py-2 text-xs font-mono whitespace-nowrap transition-colors ${
								tab.id === activeTabId
									? "text-foreground border-b border-brand -mb-px"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
					aria-label={t({
						message: "Copy to clipboard",
					})}
				>
					{copied ? (
						<Check className="size-3.5 text-brand" />
					) : (
						<Copy className="size-3.5" />
					)}
				</button>
			</div>
			{copyError && (
				<output className="block px-4 py-2 text-xs text-destructive border-b border-border">
					{copyError}
				</output>
			)}
			<div className="px-4 py-3.5 font-mono text-sm overflow-x-auto">
				{activeTab.kind === "cli" ? (
					<div className="flex items-start gap-2">
						<span className="text-muted-foreground select-none">$</span>
						<code className="text-foreground whitespace-nowrap">
							{activeTab.content}
						</code>
					</div>
				) : (
					<>
						{activeTab.filename && (
							<div className="text-xs text-muted-foreground mb-2">
								{activeTab.filename}
							</div>
						)}
						<pre className="text-foreground whitespace-pre">
							<code>{activeTab.content}</code>
						</pre>
					</>
				)}
			</div>
		</div>
	);
}
