import { useLingui } from "@lingui/react/macro";
import { MCP_CAPABILITIES } from "./constants";

export function McpCapabilities() {
	const { t } = useLingui();

	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
			{MCP_CAPABILITIES.map((capability) => (
				<div
					key={capability.id}
					className="space-y-2 border-t border-border pt-4"
				>
					<h3 className="text-sm font-mono text-brand">
						{t(capability.category)}
					</h3>
					<p className="text-sm text-muted-foreground leading-relaxed">
						{t(capability.description)}
					</p>
				</div>
			))}
		</div>
	);
}
