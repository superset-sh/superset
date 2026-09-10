import { createFileRoute } from "@tanstack/react-router";
import { AddHostGuide } from "../components/AddHostGuide";

export const Route = createFileRoute("/_authenticated/settings/hosts/new/")({
	component: AddHostGuide,
});
