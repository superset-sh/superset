/**
 * Value constraints for user settings, shared between the desktop app's
 * settings routers (zod validation) and the CLI's settings registry so the
 * two surfaces can't drift. Add new constraints here when a setting is
 * validated in more than one place.
 */

export interface NumberLimits {
	min: number;
	max: number;
	/** Value must be a multiple of this step (when present). */
	step?: number;
}

export const FONT_SIZE_LIMITS: NumberLimits = { min: 10, max: 24, step: 0.5 };
export const LINE_HEIGHT_LIMITS: NumberLimits = { min: 1, max: 2.5, step: 0.1 };
export const LETTER_SPACING_LIMITS: NumberLimits = {
	min: -2,
	max: 4,
	step: 0.1,
};
export const FONT_WEIGHT_LIMITS: NumberLimits = {
	min: 100,
	max: 900,
	step: 100,
};
export const FONT_FAMILY_MAX_LENGTH = 500;

export const TERMINAL_MINIMUM_CONTRAST_CHOICES = [1, 3, 4.5, 7] as const;
export const TERMINAL_CURSOR_STYLES = ["block", "bar", "underline"] as const;
export type TerminalCursorStyle = (typeof TERMINAL_CURSOR_STYLES)[number];

export const NOTIFICATION_VOLUME_LIMITS: NumberLimits = { min: 0, max: 100 };

export const TERMINAL_PARKED_RUNTIME_CAP_LIMITS: NumberLimits = {
	min: 2,
	max: 64,
};
export const DEFAULT_TERMINAL_PARKED_RUNTIME_CAP = 12;
