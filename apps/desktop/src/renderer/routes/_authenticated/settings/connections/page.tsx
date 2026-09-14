import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsSettings } from "./components/ConnectionsSettings";

export const Route = createFileRoute("/_authenticated/settings/connections/")({
	component: ConnectionsSettings,
});
