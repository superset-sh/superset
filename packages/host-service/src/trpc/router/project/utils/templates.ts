/**
 * Authoritative list of project templates supported by the host service.
 * The renderer keeps display metadata (name, description, icon) but uses
 * these ids to ask the host service to provision a project from a template;
 * the renderer never sees the template URL directly.
 */
export const TEMPLATES: Record<string, { url: string }> = {
	"nextjs-chatbot": { url: "https://github.com/vercel/chatbot" },
};

export function templateUrlFor(templateId: string): string | null {
	return TEMPLATES[templateId]?.url ?? null;
}
