import { createFileRoute } from "@tanstack/react-router";
import { PageDetailView } from "./components/PageDetailView";

export const Route = createFileRoute("/_authenticated/_dashboard/pages/$slug/")(
	{ component: PageDetailPage },
);

function PageDetailPage() {
	const { slug } = Route.useParams();
	return <PageDetailView key={slug} slug={slug} />;
}
