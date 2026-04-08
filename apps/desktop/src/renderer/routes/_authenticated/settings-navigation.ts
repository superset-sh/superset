export type OpenSettingsSection =
	| "account"
	| "appearance"
	| "behavior"
	| "git"
	| "integrations"
	| "keyboard"
	| "models"
	| "project"
	| "terminal"
	| "workspace";

type SupportedOpenSettingsSection = Exclude<
	OpenSettingsSection,
	"project" | "workspace"
>;
type SettingsPath = `/settings/${SupportedOpenSettingsSection}`;

function normalizeSection(
	section?: OpenSettingsSection,
): SupportedOpenSettingsSection {
	switch (section) {
		case "appearance":
		case "behavior":
		case "git":
		case "integrations":
		case "keyboard":
		case "models":
		case "terminal":
			return section;
		default:
			return "account";
	}
}

function getSettingsPath(section?: OpenSettingsSection): SettingsPath {
	const targetSection = normalizeSection(section);
	return `/settings/${targetSection}` as SettingsPath;
}

export function resolveOpenSettingsTarget(section?: OpenSettingsSection) {
	return getSettingsPath(section);
}

export function resolveToggleSettingsTarget(
	pathname: string,
	originRoute: string,
) {
	if (pathname.startsWith("/settings")) {
		return originRoute;
	}

	return getSettingsPath();
}
