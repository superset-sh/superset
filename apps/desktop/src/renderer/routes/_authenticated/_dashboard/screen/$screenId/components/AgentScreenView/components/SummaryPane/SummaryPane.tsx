import { Button } from "@superset/ui/button";
import { useCallback, useMemo } from "react";
import { HiDocumentText, HiXMark } from "react-icons/hi2";
import ReactMarkdown from "react-markdown";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import {
	agentScreenOperations,
	type SummaryPane as SummaryPaneType,
} from "renderer/stores/agent-screens";

interface SummaryPaneProps {
	pane: SummaryPaneType;
	screenId: string;
	paneId: string;
}

export function SummaryPane({ pane, screenId, paneId }: SummaryPaneProps) {
	const collections = useCollections();

	const handleClose = useCallback(() => {
		agentScreenOperations.removePane(
			collections.agentScreens,
			screenId,
			paneId,
		);
	}, [screenId, paneId, collections.agentScreens]);

	// Memoize markdown content to avoid re-parsing
	const markdownContent = useMemo(() => pane.content, [pane.content]);

	return (
		<div className="w-full h-full flex flex-col bg-background">
			{/* Summary toolbar */}
			<div className="shrink-0 h-8 px-2 flex items-center justify-between border-b border-border bg-muted/30">
				<div className="flex items-center gap-2">
					<HiDocumentText className="w-3.5 h-3.5 text-muted-foreground" />
					<span className="text-xs text-muted-foreground">
						{pane.title ?? "Summary"}
					</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6"
					onClick={handleClose}
					title="Close pane"
				>
					<HiXMark className="w-3 h-3" />
				</Button>
			</div>

			{/* Markdown content */}
			<div className="flex-1 overflow-auto p-4">
				<article className="prose prose-sm prose-invert max-w-none">
					<ReactMarkdown
						components={{
							// Custom rendering for code blocks
							code({ className, children, ...props }) {
								const match = /language-(\w+)/.exec(className || "");
								const isInline = !match;

								if (isInline) {
									return (
										<code
											className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
											{...props}
										>
											{children}
										</code>
									);
								}

								return (
									<pre className="bg-muted p-3 rounded-md overflow-x-auto">
										<code
											className={`${className} text-sm font-mono`}
											{...props}
										>
											{children}
										</code>
									</pre>
								);
							},
							// Style headings
							h1: ({ children }) => (
								<h1 className="text-xl font-bold text-foreground mb-4">
									{children}
								</h1>
							),
							h2: ({ children }) => (
								<h2 className="text-lg font-semibold text-foreground mt-6 mb-3">
									{children}
								</h2>
							),
							h3: ({ children }) => (
								<h3 className="text-base font-medium text-foreground mt-4 mb-2">
									{children}
								</h3>
							),
							// Style paragraphs
							p: ({ children }) => (
								<p className="text-sm text-foreground/90 mb-3 leading-relaxed">
									{children}
								</p>
							),
							// Style lists
							ul: ({ children }) => (
								<ul className="list-disc list-inside mb-3 text-sm text-foreground/90">
									{children}
								</ul>
							),
							ol: ({ children }) => (
								<ol className="list-decimal list-inside mb-3 text-sm text-foreground/90">
									{children}
								</ol>
							),
							li: ({ children }) => <li className="mb-1">{children}</li>,
							// Style links
							a: ({ href, children }) => (
								<a
									href={href}
									className="text-primary hover:underline"
									target="_blank"
									rel="noopener noreferrer"
								>
									{children}
								</a>
							),
						}}
					>
						{markdownContent}
					</ReactMarkdown>
				</article>
			</div>
		</div>
	);
}
