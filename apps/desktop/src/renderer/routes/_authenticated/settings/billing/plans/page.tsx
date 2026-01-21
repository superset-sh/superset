import { createFileRoute } from "@tanstack/react-router";
import { PlansComparison } from "../components/PlansComparison";

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

function PlansPage() {
	return <PlansComparison />;
}
