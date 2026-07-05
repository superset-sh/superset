import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "renderer/routes/not-found";
import { HostSettings } from "./components/HostSettings";

export const Route = createFileRoute("/_authenticated/settings/hosts/$hostId/")(
	{
		component: HostDetailPage,
		notFoundComponent: NotFound,
	},
);

function HostDetailPage() {
	const { hostId } = Route.useParams();
	return <HostSettings hostId={hostId} />;
}
