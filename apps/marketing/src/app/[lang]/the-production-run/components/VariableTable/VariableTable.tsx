import { MEASURED_VARIABLES } from "../../constants";

export function VariableTable() {
	return (
		<div className="overflow-x-auto border border-border">
			<table className="w-full min-w-[560px] text-sm border-collapse">
				<thead>
					<tr className="bg-foreground/[0.015]">
						<th className="text-left font-normal font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border">
							Variable
						</th>
						<th className="text-left font-normal font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border">
							Grain
						</th>
						<th className="text-left font-normal font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border">
							What it is
						</th>
						<th className="text-left font-normal font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border">
							Feeds
						</th>
					</tr>
				</thead>
				<tbody>
					{MEASURED_VARIABLES.map((variable, index) => (
						<tr
							key={variable.name}
							className={
								index === MEASURED_VARIABLES.length - 1
									? ""
									: "border-b border-border"
							}
						>
							<td className="px-4 py-3 align-top font-mono text-[12.5px] text-foreground whitespace-nowrap">
								{variable.name}
							</td>
							<td className="px-4 py-3 align-top font-mono text-[12px] text-muted-foreground whitespace-nowrap">
								{variable.grain}
							</td>
							<td className="px-4 py-3 align-top text-muted-foreground leading-relaxed">
								{variable.definition}
							</td>
							<td className="px-4 py-3 align-top font-mono text-[12px] text-muted-foreground whitespace-nowrap">
								{variable.feeds}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
