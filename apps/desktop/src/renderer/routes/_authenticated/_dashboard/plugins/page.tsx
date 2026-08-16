import { createFileRoute } from "@tanstack/react-router";
import { PluginsPage } from "./components/PluginsPage";

export const Route = createFileRoute("/_authenticated/_dashboard/plugins/")({
	component: PluginsPage,
});
