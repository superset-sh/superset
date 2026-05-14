import {
	type ComponentProps,
	type MouseEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { SafeImage } from "renderer/components/MarkdownRenderer/components";
import { CommentCodeBlock } from "./components/CommentCodeBlock";

type ReactMarkdownComponents = ComponentProps<
	typeof ReactMarkdown
>["components"];

function CopyableDetails({
	children,
	open,
}: {
	children?: ReactNode;
	open?: boolean;
}) {
	const ref = useRef<HTMLDetailsElement>(null);
	const [isCopied, setIsCopied] = useState(false);
	useEffect(() => {
		if (!isCopied) return;
		const timer = setTimeout(() => setIsCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [isCopied]);
	const handleCopy = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!ref.current) return;
		const clone = ref.current.cloneNode(true) as HTMLDetailsElement;
		for (const el of clone.querySelectorAll("summary")) el.remove();
		navigator.clipboard
			.writeText((clone.textContent ?? "").trim())
			.then(() => setIsCopied(true))
			.catch((err) => {
				console.error("[CommentMarkdown/copyDetails] Failed to copy:", err);
			});
	};
	return (
		<div className="relative">
			<button
				type="button"
				onClick={handleCopy}
				className="absolute right-1 top-1 z-10 rounded bg-card/80 p-1 text-muted-foreground/70 backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
				aria-label={isCopied ? "Copied" : "Copy contents"}
			>
				{isCopied ? (
					<LuCheck className="size-3 text-green-500" />
				) : (
					<LuCopy className="size-3" />
				)}
			</button>
			<details ref={ref} open={open}>
				{children}
			</details>
		</div>
	);
}

const baseComponents = {
	code: ({
		className,
		children,
	}: {
		className?: string;
		children?: ReactNode;
	}) => <CommentCodeBlock className={className}>{children}</CommentCodeBlock>,
	img: ({ src, alt }: { src?: string; alt?: string }) => (
		<SafeImage src={src} alt={alt} className="comment-md-img" />
	),
	a: ({ href, children }: { href?: string; children?: ReactNode }) => (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="comment-md-link"
		>
			{children}
		</a>
	),
	details: CopyableDetails,
} satisfies ReactMarkdownComponents;

interface CommentMarkdownProps {
	body: string;
	/** Per-surface overrides merged on top of the base map (e.g. CommentPane's CopyableTable). */
	components?: ReactMarkdownComponents;
}

/**
 * Shared markdown renderer for PR comment bodies. Sizing/spacing is owned
 * by the wrapper-class CSS at each call site (`.diff-comment-body`,
 * `.comment-pane-markdown`); this only dictates *what* renders.
 */
export function CommentMarkdown({ body, components }: CommentMarkdownProps) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[rehypeRaw, rehypeSanitize]}
			components={{ ...baseComponents, ...(components ?? {}) }}
		>
			{body}
		</ReactMarkdown>
	);
}
