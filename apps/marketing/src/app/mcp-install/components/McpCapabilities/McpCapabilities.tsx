import { MCP_CAPABILITIES } from "./constants";

export function McpCapabilities() {
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
			{MCP_CAPABILITIES.map((capability) => (
				<div
					key={capability.category}
					className="space-y-2 border-t border-border pt-4"
				>
					<h3 className="text-sm font-mono text-brand">
						{capability.category}
					</h3>
					<p className="text-sm text-muted-foreground leading-relaxed">
						{capability.description}
					</p>
				</div>
			))}
		</div>
	);
}
