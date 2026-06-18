import { createFileRoute } from "@tanstack/react-router";
import { ToolsAndSkillsSettings } from "./components/ToolsAndSkillsSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/tools-and-skills/",
)({
	component: ToolsAndSkillsPage,
});

function ToolsAndSkillsPage() {
	return <ToolsAndSkillsSettings />;
}
