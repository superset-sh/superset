/**
 * A comment body the mobile markdown renderer can show.
 *
 * GitHub renders raw HTML, the renderer doesn't — a review bot's `<details>`
 * wrapper would print its own tags as text, and its contents (a page of
 * "here's how I investigated") would bury the finding underneath. GitHub keeps
 * that disclosure collapsed by default, so drop it and keep the prose around
 * it, which is the part being reviewed.
 */
export function readableBody(body: string): string {
	return body
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<details>[\s\S]*?(?:<\/details>|$)/g, "")
		.replace(/<\/?(?:p|div|br\s*\/?|blockquote|summary|details)>/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
