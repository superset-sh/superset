export function TextContent({ text }: { text: string }) {
	return (
		<pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs">
			{text}
		</pre>
	);
}
