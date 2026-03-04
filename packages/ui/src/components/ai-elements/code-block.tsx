"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import {
	type ComponentProps,
	createContext,
	type HTMLAttributes,
	useContext,
	useEffect,
	useState,
} from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
	code: string;
	language: BundledLanguage;
	showLineNumbers?: boolean;
};

type CodeBlockContextType = {
	code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
	code: "",
});

const lineNumberTransformer: ShikiTransformer = {
	name: "line-numbers",
	line(node, line) {
		node.children.unshift({
			type: "element",
			tagName: "span",
			properties: {
				className: [
					"inline-block",
					"min-w-10",
					"mr-4",
					"text-right",
					"select-none",
					"text-muted-foreground",
				],
			},
			children: [{ type: "text", value: String(line) }],
		});
	},
};

export async function highlightCode(
	code: string,
	language: BundledLanguage,
	showLineNumbers = false,
) {
	const transformers: ShikiTransformer[] = showLineNumbers
		? [lineNumberTransformer]
		: [];

	return await Promise.all([
		codeToHtml(code, {
			lang: language,
			theme: "one-light",
			transformers,
		}),
		codeToHtml(code, {
			lang: language,
			theme: "one-dark-pro",
			transformers,
		}),
	]);
}

export const CodeBlock = ({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) => {
	const [html, setHtml] = useState<string>("");
	const [darkHtml, setDarkHtml] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
			if (!cancelled) {
				setHtml(light);
				setDarkHtml(dark);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [code, language, showLineNumbers]);

	return (
		<CodeBlockContext.Provider value={{ code }}>
			<div
				className={cn(
					"group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
					className,
				)}
				{...props}
			>
				<div className="relative">
					<div
						className="overflow-auto dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
						dangerouslySetInnerHTML={{ __html: html }}
					/>
					<div
						className="hidden overflow-auto dark:block [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
						dangerouslySetInnerHTML={{ __html: darkHtml }}
					/>
					{children && (
						<div className="absolute top-2 right-2 flex items-center gap-2">
							{children}
						</div>
					)}
				</div>
			</div>
		</CodeBlockContext.Provider>
	);
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const CodeBlockCopyButton = ({
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CodeBlockCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const { code } = useContext(CodeBlockContext);

	const copyToClipboard = async () => {
		if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
			onError?.(new Error("Clipboard API not available"));
			return;
		}

		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			onCopy?.();
			setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	};

	return (
		<Button
			className={cn("shrink-0", className)}
			onClick={copyToClipboard}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? (
				<div className="relative h-3.5 w-3.5">
					<CopyIcon
						className={cn(
							"absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] duration-200 ease-out",
							isCopied ? "scale-50 opacity-0" : "scale-100 opacity-100",
						)}
					/>
					<CheckIcon
						className={cn(
							"absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] duration-200 ease-out",
							isCopied ? "scale-100 opacity-100" : "scale-50 opacity-0",
						)}
					/>
				</div>
			)}
		</Button>
	);
};
