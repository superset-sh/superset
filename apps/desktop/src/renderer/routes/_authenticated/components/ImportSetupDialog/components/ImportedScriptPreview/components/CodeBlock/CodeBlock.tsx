export function CodeBlock({ children }: { children: string }) {
	return (
		<pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
			{children}
		</pre>
	);
}
