/**
 * What a tool result asks the phone to show. Applied by the device after the
 * tool's output is handed back to the model.
 */
export type VoiceNavigateTarget =
	| { screen: "home" }
	| { screen: "workspace"; workspaceId: string; terminalId?: string }
	| { screen: "sessions"; workspaceId: string }
	| { screen: "pull_requests"; workspaceId: string }
	| { screen: "page"; slug: string };

export interface VoiceUiDirective {
	navigate?: VoiceNavigateTarget;
	/** Rows the model is talking about; the screen may highlight them briefly. */
	highlightWorkspaceIds?: string[];
}
