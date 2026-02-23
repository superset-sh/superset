import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";

interface MarkdownOverlayProps {
	xterm: XTerm | null;
	onClose: () => void;
}

/**
 * Extract all text from an xterm buffer, stripping ANSI escape codes.
 * xterm.js already processes ANSI into styled cells, so translateToString()
 * gives us clean text.
 */
function extractTextFromTerminal(xterm: XTerm): string {
	const buffer = xterm.buffer.active;
	const lines: string[] = [];

	for (let i = 0; i < buffer.length; i++) {
		const line = buffer.getLine(i);
		if (line) {
			lines.push(line.translateToString(true));
		}
	}

	// Trim trailing empty lines
	while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
		lines.pop();
	}

	return lines.join("\n");
}

export function MarkdownOverlay({ xterm, onClose }: MarkdownOverlayProps) {
	const [content, setContent] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | null>(null);

	const updateContent = useCallback(() => {
		if (!xterm) return;
		setContent(extractTextFromTerminal(xterm));
	}, [xterm]);

	// Initial content extraction
	useEffect(() => {
		updateContent();
	}, [updateContent]);

	// Poll for updates when terminal content changes (xterm doesn't expose
	// a reliable content-change event, so we poll on a reasonable interval)
	useEffect(() => {
		if (!xterm) return;

		const interval = setInterval(updateContent, 500);
		return () => clearInterval(interval);
	}, [xterm, updateContent]);

	// Auto-scroll to bottom on content change
	useEffect(() => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
		}
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = null;
			const el = scrollRef.current;
			if (el) {
				el.scrollTop = el.scrollHeight;
			}
		});

		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [content]);

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown, { capture: true });
		return () =>
			document.removeEventListener("keydown", handleKeyDown, {
				capture: true,
			});
	}, [onClose]);

	return (
		<div className="absolute inset-0 z-10 flex flex-col bg-background">
			<div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
				<span className="text-sm font-medium text-muted-foreground">
					Markdown View
				</span>
				<div className="flex items-center gap-3">
					<span className="text-xs text-muted-foreground/60">
						Press Esc or ⌘⇧M to close
					</span>
					<button
						type="button"
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground transition-colors text-sm px-2 py-0.5 rounded hover:bg-muted"
					>
						✕
					</button>
				</div>
			</div>
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				<MarkdownRenderer content={content} />
			</div>
		</div>
	);
}
