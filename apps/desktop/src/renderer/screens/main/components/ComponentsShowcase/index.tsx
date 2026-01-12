import { ScrollArea } from "@superset/ui/scroll-area";
import {
	StatusIcon,
	type StatusType,
} from "../TasksView/components/StatusIcon";

const STATUS_VARIANTS: Array<{
	type: StatusType;
	color: string;
	label: string;
}> = [
	{ type: "backlog", color: "#6B7280", label: "Backlog (Gray)" },
	{ type: "unstarted", color: "#3B82F6", label: "Todo (Blue)" },
	{ type: "unstarted", color: "#EF4444", label: "Blocked (Red)" },
	{ type: "started", color: "#F59E0B", label: "In Progress (Orange)" },
	{ type: "started", color: "#10B981", label: "In Review (Green)" },
	{ type: "completed", color: "#8B5CF6", label: "Done (Purple)" },
	{ type: "cancelled", color: "#6B7280", label: "Canceled (Gray)" },
	{ type: "cancelled", color: "#EF4444", label: "Duplicate (Red)" },
];

export function ComponentsShowcase() {
	return (
		<div className="flex-1 flex flex-col min-h-0 bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-6 py-4">
				<div>
					<h1 className="text-xl font-semibold">Components Showcase</h1>
					<p className="text-sm text-muted-foreground mt-1">
						View all component variants and states
					</p>
				</div>
			</div>

			{/* Content */}
			<ScrollArea className="flex-1 min-h-0">
				<div className="p-6 space-y-8">
					{/* Status Icon Display */}
					<section>
						<h2 className="text-lg font-semibold mb-4">Status Icon Display</h2>
						<p className="text-sm text-muted-foreground mb-6">
							Linear-style status icons with support for different types and
							colors
						</p>

						<div className="space-y-8">
							{/* All Variants Grid */}
							<div>
								<h3 className="text-sm font-medium mb-3">All Variants</h3>
								<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
									{STATUS_VARIANTS.map((variant, index) => (
										<div
											key={index}
											className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card"
										>
											<StatusIcon type={variant.type} color={variant.color} />
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium">{variant.label}</p>
												<p className="text-xs text-muted-foreground">
													{variant.type}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>

							{/* Type Breakdown */}
							<div>
								<h3 className="text-sm font-medium mb-3">Type Breakdown</h3>
								<div className="space-y-4">
									{/* Backlog */}
									<div className="p-4 rounded-lg border border-border bg-card">
										<div className="flex items-center gap-3 mb-2">
											<StatusIcon type="backlog" color="#6B7280" />
											<span className="font-medium">Backlog Type</span>
										</div>
										<p className="text-sm text-muted-foreground ml-9">
											Dashed circle outline
										</p>
									</div>

									{/* Unstarted */}
									<div className="p-4 rounded-lg border border-border bg-card">
										<div className="flex items-center gap-3 mb-2">
											<StatusIcon type="unstarted" color="#3B82F6" />
											<span className="font-medium">Unstarted Type</span>
										</div>
										<p className="text-sm text-muted-foreground ml-9">
											Solid circle outline
										</p>
									</div>

									{/* Started */}
									<div className="p-4 rounded-lg border border-border bg-card">
										<div className="flex items-center gap-3 mb-2">
											<StatusIcon type="started" color="#F59E0B" />
											<span className="font-medium">Started Type</span>
										</div>
										<p className="text-sm text-muted-foreground ml-9">
											Filled circle with thin gap between fill and border
										</p>
									</div>

									{/* Completed */}
									<div className="p-4 rounded-lg border border-border bg-card">
										<div className="flex items-center gap-3 mb-2">
											<StatusIcon type="completed" color="#8B5CF6" />
											<span className="font-medium">Completed Type</span>
										</div>
										<p className="text-sm text-muted-foreground ml-9">
											Filled circle with hollow check icon
										</p>
									</div>

									{/* Cancelled */}
									<div className="p-4 rounded-lg border border-border bg-card">
										<div className="flex items-center gap-3 mb-2">
											<StatusIcon type="cancelled" color="#6B7280" />
											<span className="font-medium">Cancelled Type</span>
										</div>
										<p className="text-sm text-muted-foreground ml-9">
											Filled circle with hollow X icon
										</p>
									</div>
								</div>
							</div>

							{/* Hover States */}
							<div>
								<h3 className="text-sm font-medium mb-3">Hover States</h3>
								<div className="grid grid-cols-5 gap-4 p-4 rounded-lg border border-border bg-card">
									<div className="flex flex-col items-center gap-2">
										<StatusIcon
											type="backlog"
											color="#6B7280"
											showHover={true}
										/>
										<span className="text-xs text-muted-foreground">
											Backlog
										</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon
											type="unstarted"
											color="#3B82F6"
											showHover={true}
										/>
										<span className="text-xs text-muted-foreground">
											Unstarted
										</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon
											type="started"
											color="#F59E0B"
											showHover={true}
										/>
										<span className="text-xs text-muted-foreground">
											Started
										</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon
											type="completed"
											color="#8B5CF6"
											showHover={true}
										/>
										<span className="text-xs text-muted-foreground">
											Completed
										</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon
											type="cancelled"
											color="#6B7280"
											showHover={true}
										/>
										<span className="text-xs text-muted-foreground">
											Cancelled
										</span>
									</div>
								</div>
								<p className="text-xs text-muted-foreground mt-2 ml-2">
									Hover over any icon to see the brightness effect
								</p>
							</div>

							{/* Progress Variants for Started Type */}
							<div>
								<h3 className="text-sm font-medium mb-3">
									Started Progress Variants
								</h3>
								<p className="text-xs text-muted-foreground mb-3">
									Visual progress indication for "started" type statuses
								</p>
								<div className="grid grid-cols-5 gap-4 p-4 rounded-lg border border-border bg-card">
									<div className="flex flex-col items-center gap-2">
										<StatusIcon type="started" color="#F59E0B" progress={25} />
										<span className="text-xs text-muted-foreground">25%</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon type="started" color="#F59E0B" progress={50} />
										<span className="text-xs text-muted-foreground">50%</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon type="started" color="#10B981" progress={75} />
										<span className="text-xs text-muted-foreground">75%</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon type="started" color="#8B5CF6" progress={83} />
										<span className="text-xs text-muted-foreground">83%</span>
									</div>
									<div className="flex flex-col items-center gap-2">
										<StatusIcon type="started" color="#8B5CF6" progress={100} />
										<span className="text-xs text-muted-foreground">100%</span>
									</div>
								</div>
								<p className="text-xs text-muted-foreground mt-2 ml-2">
									Progress is calculated from Linear workflow state positions
									during sync
								</p>
							</div>
						</div>
					</section>
				</div>
			</ScrollArea>
		</div>
	);
}
