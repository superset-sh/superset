import type { CustomerHealth } from "@superset/shared/customer-health";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { LuCircleDollarSign } from "react-icons/lu";

const HEALTH_STYLES: Record<CustomerHealth, string> = {
	active: "border-transparent bg-emerald-500/15 text-emerald-500",
	cooling: "border-transparent bg-amber-500/15 text-amber-500",
	dormant: "border-transparent bg-red-500/15 text-red-400",
};

const HEALTH_LABELS: Record<CustomerHealth, string> = {
	active: "Active",
	cooling: "Cooling",
	dormant: "Dormant",
};

export interface HealthBadgeProps {
	health: CustomerHealth;
	churnRisk?: boolean;
}

export function HealthBadge({ health, churnRisk }: HealthBadgeProps) {
	return (
		<Badge className={cn(HEALTH_STYLES[health])}>
			{churnRisk && <LuCircleDollarSign aria-label="Paying customer" />}
			{churnRisk ? "Churn risk" : HEALTH_LABELS[health]}
		</Badge>
	);
}
