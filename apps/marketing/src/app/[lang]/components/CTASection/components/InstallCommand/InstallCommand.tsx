"use client";

import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { DEFAULT_INSTALL_TAB, INSTALL_TABS } from "./constants";

export function InstallCommand() {
	const { t } = useLingui();
	const [activeTabId, setActiveTabId] = useState(DEFAULT_INSTALL_TAB.id);
	const [copied, setCopied] = useState(false);

	const activeTab =
		INSTALL_TABS.find((tab) => tab.id === activeTabId) ?? DEFAULT_INSTALL_TAB;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(activeTab.command);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard unavailable (e.g. insecure context); ignore
		}
	};

	return (
		<div className="w-full max-w-xl border border-border rounded-[2px] bg-foreground/[0.03] text-left">
			<div className="flex items-center justify-between border-b border-border px-2">
				<div className="flex items-center">
					{INSTALL_TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => {
								setActiveTabId(tab.id);
								setCopied(false);
							}}
							className={`px-3 py-2 text-xs font-mono transition-colors ${
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
					className="p-2 text-muted-foreground hover:text-foreground transition-colors"
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
			<div className="flex items-start gap-2 px-4 py-3.5 font-mono text-sm overflow-x-auto">
				{activeTab.shell && (
					<span className="text-muted-foreground select-none">$</span>
				)}
				<code className="text-foreground whitespace-nowrap">
					{activeTab.command}
				</code>
			</div>
		</div>
	);
}
