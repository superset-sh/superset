import { mermaid } from "@streamdown/mermaid";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { FaGithub } from "react-icons/fa";
import {
	LuArrowUpRight,
	LuCheck,
	LuCopy,
	LuMessageSquare,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import type { MosaicBranch } from "react-mosaic-component";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTheme } from "renderer/stores/theme";
import { Streamdown } from "streamdown";
import { BasePaneWindow, PaneTitle, PaneToolbarActions } from "../components";
import "./comment-pane.css";

interface CommentPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function CommentPane({
	paneId,
	path,
	tabId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: CommentPaneProps) {
	const comment = useTabsStore((s) => s.panes[paneId]?.comment);
	const paneName = useTabsStore((s) => s.panes[paneId]?.name);
	const setPaneName = useTabsStore((s) => s.setPaneName);
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
		if (!comment) return;
		void electronTrpcClient.external.copyText
			.mutate(comment.body)
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
	}, [comment]);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between px-3">
					<div className="flex min-w-0 items-center gap-2">
						{comment?.avatarUrl ? (
							<img
								src={comment.avatarUrl}
								alt=""
								className="size-4 shrink-0 rounded-full"
							/>
						) : (
							<LuMessageSquare className="size-4 shrink-0 text-muted-foreground" />
						)}
						<PaneTitle
							name={paneName ?? ""}
							fallback="Comment"
							onRename={(newName) => setPaneName(paneId, newName)}
						/>
						{comment?.url && (
							<a
								href={comment.url}
								target="_blank"
								rel="noopener noreferrer"
								className="flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-foreground"
								aria-label="View on GitHub"
							>
								<FaGithub className="size-3.5" />
								<LuArrowUpRight className="size-3" />
							</a>
						)}
					</div>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
					/>
				</div>
			)}
		>
			{!comment ? (
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					No comment selected
				</div>
			) : (
				<div className="flex h-full w-full flex-col overflow-hidden">
					<div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
						<Avatar className="size-5 shrink-0">
							{comment.avatarUrl ? (
								<AvatarImage
									src={comment.avatarUrl}
									alt={comment.authorLogin}
								/>
							) : null}
							<AvatarFallback className="text-[10px] font-medium">
								{comment.authorLogin.slice(0, 2).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="text-sm font-medium text-foreground">
							{comment.authorLogin}
						</span>
						{comment.path && (
							<span className="truncate text-xs text-muted-foreground">
								{comment.path}
								{comment.line != null ? `:${comment.line}` : ""}
							</span>
						)}
						<button
							type="button"
							onClick={handleCopyAll}
							className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							{copied ? (
								<>
									<LuCheck className="size-3" />
									Copied
								</>
							) : (
								<>
									<LuCopy className="size-3" />
									Copy All
								</>
							)}
						</button>
					</div>
					<div className="comment-pane-markdown min-h-0 flex-1 overflow-y-auto select-text">
						<article className="w-full px-6 py-5">
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								rehypePlugins={[rehypeRaw, rehypeSanitize]}
								components={commentComponents}
							>
								{comment.body}
							</ReactMarkdown>
						</article>
					</div>
				</div>
			)}
		</BasePaneWindow>
	);
}

const mermaidPlugins = { mermaid };

const MERMAID_DARK_VARS = {
	background: "#1e1e2e",
	primaryColor: "#313244",
	primaryTextColor: "#cdd6f4",
	primaryBorderColor: "#45475a",
	secondaryColor: "#313244",
	secondaryTextColor: "#cdd6f4",
	secondaryBorderColor: "#45475a",
	tertiaryColor: "#313244",
	tertiaryTextColor: "#cdd6f4",
	tertiaryBorderColor: "#45475a",
	nodeBorder: "#45475a",
	nodeTextColor: "#cdd6f4",
	mainBkg: "#313244",
	clusterBkg: "#1e1e2e",
	titleColor: "#cdd6f4",
	edgeLabelBackground: "transparent",
	lineColor: "#6c7086",
	textColor: "#cdd6f4",
};

const MERMAID_LIGHT_VARS = {
	background: "#ffffff",
	primaryColor: "#f0f0f4",
	primaryTextColor: "#1e1e2e",
	primaryBorderColor: "#d0d0d8",
	lineColor: "#888",
	textColor: "#1e1e2e",
};

function CommentCodeBlock({
	className,
	children,
}: {
	className?: string;
	children?: ReactNode;
}) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";

	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	if (language === "mermaid") {
		return (
			<Streamdown
				mode="static"
				plugins={mermaidPlugins}
				mermaid={{
					config: {
						theme: "base",
						themeVariables: isDark ? MERMAID_DARK_VARS : MERMAID_LIGHT_VARS,
					},
				}}
			>
				{`\`\`\`mermaid\n${codeString}\n\`\`\``}
			</Streamdown>
		);
	}

	if (!language) {
		return (
			<code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
				{children}
			</code>
		);
	}

	return (
		<SyntaxHighlighter
			style={
				(isDark ? oneDark : oneLight) as Record<string, React.CSSProperties>
			}
			language={language}
			PreTag="div"
			className="rounded-md text-sm"
		>
			{codeString}
		</SyntaxHighlighter>
	);
}

const commentComponents = {
	code: CommentCodeBlock,
	table: ({ children }: { children?: ReactNode }) => (
		<CopyableTable>{children}</CopyableTable>
	),
};

function CopyableTable({ children }: { children?: ReactNode }) {
	const tableRef = useRef<HTMLTableElement>(null);
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const handleCopy = useCallback(() => {
		const el = tableRef.current;
		if (!el) return;

		const rows = el.querySelectorAll("tr");
		const lines: string[] = [];
		for (const row of rows) {
			const cells = row.querySelectorAll("th, td");
			const values: string[] = [];
			for (const cell of cells) {
				values.push((cell.textContent ?? "").trim());
			}
			lines.push(values.join("\t"));
		}
		const text = lines.join("\n");
		void electronTrpcClient.external.copyText
			.mutate(text)
			.then(() => {
				if (!isMountedRef.current) return;
				if (timerRef.current) clearTimeout(timerRef.current);
				setCopied(true);
				timerRef.current = setTimeout(() => {
					if (!isMountedRef.current) return;
					setCopied(false);
					timerRef.current = null;
				}, 1500);
			})
			.catch((err) => {
				console.warn("Failed to copy table text", err);
			});
	}, []);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={handleCopy}
				className="absolute right-0 -top-6 z-10 rounded-sm px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
			>
				{copied ? (
					<span className="flex items-center gap-1">
						<LuCheck className="size-3" />
						Copied
					</span>
				) : (
					"Copy"
				)}
			</button>
			<div className="overflow-x-auto">
				<table ref={tableRef} className="table-auto w-full">
					{children}
				</table>
			</div>
		</div>
	);
}
