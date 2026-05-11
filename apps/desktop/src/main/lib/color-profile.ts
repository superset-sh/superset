export const FORCE_COLOR_PROFILE_SWITCH = "force-color-profile";
export const DISPLAY_P3_VALUE = "display-p3";

interface CommandLineLike {
	appendSwitch(switchName: string, value?: string): void;
}

export function applyDisplayP3ColorProfile(commandLine: CommandLineLike): void {
	commandLine.appendSwitch(FORCE_COLOR_PROFILE_SWITCH, DISPLAY_P3_VALUE);
}
