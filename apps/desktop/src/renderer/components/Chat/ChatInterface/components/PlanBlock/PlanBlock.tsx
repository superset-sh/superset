import {
	Plan,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
} from "@superset/ui/ai-elements/plan";

interface PlanData {
	title: string;
	description: string;
	steps: Array<{ label: string; done: boolean }>;
}

export function PlanBlock({ plan }: { plan: PlanData }) {
	return (
		<Plan defaultOpen>
			<PlanHeader>
				<div>
					<PlanTitle>{plan.title}</PlanTitle>
					<PlanDescription>{plan.description}</PlanDescription>
				</div>
			</PlanHeader>
			<PlanContent>
				<ul className="space-y-1.5 text-sm">
					{plan.steps.map((step) => (
						<li key={step.label} className="flex items-center gap-2">
							<span
								className={
									step.done ? "text-green-500" : "text-muted-foreground"
								}
							>
								{step.done ? "\u2713" : "\u25CB"}
							</span>
							<span
								className={
									step.done ? "text-muted-foreground line-through" : ""
								}
							>
								{step.label}
							</span>
						</li>
					))}
				</ul>
			</PlanContent>
		</Plan>
	);
}
