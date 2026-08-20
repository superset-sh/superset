import { createFileRoute } from "@tanstack/react-router";
import { Board } from "./components/Board";

export const Route = createFileRoute("/_authenticated/_dashboard/free-solo/")({
	component: FreeSoloPage,
});

function FreeSoloPage() {
	return <Board />;
}
