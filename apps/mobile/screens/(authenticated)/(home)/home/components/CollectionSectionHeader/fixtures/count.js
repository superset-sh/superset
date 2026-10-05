import { mock } from "bun:test";
import assert from "node:assert/strict";

mock.module("@lingui/core/macro", () => ({
	plural: (count) => `${count} ${count === 1 ? "project" : "projects"}`,
}));
mock.module("@lingui/react/macro", () => ({
	useLingui: () => ({ t: ({ message }) => message }),
}));
mock.module("@superset/i18n/react", () => ({
	useFormat: () => ({ formatNumber: (count) => String(count) }),
}));
mock.module("react-native", () => ({ Pressable: "Pressable", View: "View" }));
mock.module("lucide-react-native", () => ({
	ChevronDown: "Down",
	ChevronRight: "Right",
}));
mock.module("@/components/ui/text", () => ({ Text: "Text" }));
mock.module("@/hooks/useTheme", () => ({
	useTheme: () => ({ mutedForeground: "gray" }),
}));
const { CollectionSectionHeader } = await import("../CollectionSectionHeader");
const { groupProjectSections } = await import(
	"../../../utils/groupProjectSections"
);
const team = { tag: "team", name: "Team", color: null, tabOrder: 0 };
const groups = groupProjectSections(
	[{ projectId: "active" }],
	new Map([
		["active", team],
		["empty-a", team],
		["empty-b", team],
	]),
);
const group = groups[0];
assert.equal(group?.kind, "collection");
if (group?.kind !== "collection") throw new Error("Missing collection");
function text(node) {
	if (node == null || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(text).join("");
	return text(node.props.children);
}
for (const collapsed of [true, false]) {
	const element = CollectionSectionHeader({
		name: team.name,
		color: team.color,
		projectCount: group.projectCount,
		collapsed,
		onToggle: () => {},
	});
	assert.equal(element.props.accessibilityLabel, "Team, 3 projects");
	assert.equal(element.props.accessibilityState.expanded, !collapsed);
	assert.equal(text(element), collapsed ? "Team3" : "Team");
}
