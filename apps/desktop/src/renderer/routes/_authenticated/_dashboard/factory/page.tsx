import { createFileRoute } from "@tanstack/react-router";
import { FactoryView } from "./components/FactoryView";

interface FactorySearch {
	demo?: boolean;
}

export const Route = createFileRoute("/_authenticated/_dashboard/factory/")({
	component: FactoryPage,
	validateSearch: (search: Record<string, unknown>): FactorySearch => ({
		demo:
			search.demo === true ||
			search.demo === "true" ||
			search.demo === "1" ||
			undefined,
	}),
});

function FactoryPage() {
	const { demo = false } = Route.useSearch();
	return <FactoryView demo={demo} />;
}
