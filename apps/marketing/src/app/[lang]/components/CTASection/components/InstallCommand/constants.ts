import { CANONICAL_URLS } from "@superset/shared/constants";
export interface InstallTab {
	id: string;
	label: string;
	command: string;
	/** Shell commands get a `$` prompt prefix; agent prompts do not. */
	shell: boolean;
}

export const DEFAULT_INSTALL_TAB: InstallTab = {
	id: "brew",
	label: "brew",
	command: "brew install superset-sh/tap/superset",
	shell: true,
};

export const INSTALL_TABS: InstallTab[] = [
	DEFAULT_INSTALL_TAB,
	{
		id: "curl",
		label: "curl",
		command: `curl -fsSL ${CANONICAL_URLS.MARKETING}/cli/install.sh | sh`,
		shell: true,
	},
	{
		id: "agent",
		label: "agent",
		command: `Install the Superset CLI: ${CANONICAL_URLS.MARKETING}/llms.txt`,
		shell: false,
	},
];
