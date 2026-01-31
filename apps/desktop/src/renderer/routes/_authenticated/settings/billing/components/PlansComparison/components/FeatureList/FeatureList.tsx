import { HiCheck } from "react-icons/hi2";
import type { PlanFeature } from "../../../../constants";

interface FeatureListProps {
	features: PlanFeature[];
}

export function FeatureList({ features }: FeatureListProps) {
	return (
		<ul className="space-y-3">
			{features.map((feature) => (
				<li key={feature.id} className="flex items-start gap-2">
					<HiCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
					<div className="flex-1">
						<span className="text-sm">{feature.name}</span>
						{feature.limit && (
							<span className="text-xs text-muted-foreground ml-1">
								({feature.limit})
							</span>
						)}
					</div>
				</li>
			))}
		</ul>
	);
}
