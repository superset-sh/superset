import { useLingui } from "@lingui/react/macro";
import { MCP_EXAMPLE_PROMPTS } from "./constants";

export function McpExamples() {
	const { t } = useLingui();

	return (
		<ul className="grid sm:grid-cols-2 gap-3">
			{MCP_EXAMPLE_PROMPTS.map((example) => (
				<li
					key={example.id}
					className="border border-border rounded-[2px] bg-foreground/[0.03] px-4 py-3 font-mono text-sm text-foreground"
				>
					&ldquo;{t(example.prompt)}&rdquo;
				</li>
			))}
		</ul>
	);
}
