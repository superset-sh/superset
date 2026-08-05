import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * User-saved automation templates. Structurally compatible with
 * AutomationTemplate from the automations route so custom entries render in
 * the same galleries and pre-fill the create form the same way.
 */
export interface CustomAutomationTemplate {
	id: string;
	emoji: string;
	description: string;
	name: string;
	prompt: string;
	agentType?: string;
	rrule?: string;
	savedAt: number;
}

export interface SaveCustomTemplateInput {
	name: string;
	prompt: string;
	agentType?: string;
	rrule?: string;
}

const MAX_TEMPLATES = 50;
const MAX_NAME_CHARS = 120;
// Prompts can be many KB of markdown; cap per-entry size so the persisted
// store stays far below the synchronous-localStorage-load failure mode
// documented in renderer/lib/terminal/terminal-buffer-gc.ts.
const MAX_PROMPT_CHARS = 10_000;

export const CUSTOM_TEMPLATE_EMOJI = "📌";

export function upsertCustomTemplate(
	templates: CustomAutomationTemplate[],
	input: SaveCustomTemplateInput,
	id: string,
	savedAt: number,
): CustomAutomationTemplate[] {
	const name = input.name.trim().slice(0, MAX_NAME_CHARS);
	const prompt = input.prompt.trim().slice(0, MAX_PROMPT_CHARS);
	if (!name || !prompt) return templates;
	const entry: CustomAutomationTemplate = {
		id,
		emoji: CUSTOM_TEMPLATE_EMOJI,
		description: prompt,
		name,
		prompt,
		agentType: input.agentType,
		rrule: input.rrule,
		savedAt,
	};
	return [
		entry,
		// Re-saving an identical name+prompt replaces it instead of duplicating.
		...templates.filter(
			(template) => template.name !== name || template.prompt !== prompt,
		),
	].slice(0, MAX_TEMPLATES);
}

interface CustomAutomationTemplatesState {
	templates: CustomAutomationTemplate[];
	saveTemplate: (input: SaveCustomTemplateInput) => void;
	removeTemplate: (id: string) => void;
}

export const useCustomAutomationTemplatesStore =
	create<CustomAutomationTemplatesState>()(
		devtools(
			persist(
				(set) => ({
					templates: [],

					saveTemplate: (input) => {
						// The persist write is synchronous; a quota failure must never
						// propagate into the row-menu caller.
						try {
							set((state) => ({
								templates: upsertCustomTemplate(
									state.templates,
									input,
									crypto.randomUUID(),
									Date.now(),
								),
							}));
						} catch {
							// saving is best-effort
						}
					},

					removeTemplate: (id) => {
						try {
							set((state) => ({
								templates: state.templates.filter(
									(template) => template.id !== id,
								),
							}));
						} catch {
							// removal is best-effort
						}
					},
				}),
				{ name: "custom-automation-templates" },
			),
			{ name: "CustomAutomationTemplatesStore" },
		),
	);
