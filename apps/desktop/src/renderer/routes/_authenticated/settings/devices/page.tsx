import { createFileRoute } from "@tanstack/react-router";
import { DevicesSettings } from "./components/DevicesSettings";

export const Route = createFileRoute("/_authenticated/settings/devices/")({
	component: DevicesSettings,
});
