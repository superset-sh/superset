/**
 * Lightweight patterns to detect when terminal output suggests a port may have been opened.
 * These are used as hints to trigger an immediate process-based scan, not as the source of truth.
 */

const HINT_PATTERNS = [
	/localhost:\d{2,5}/i,
	/127\.0\.0\.1:\d{2,5}/,
	/0\.0\.0\.0:\d{2,5}/,
	/https?:\/\/[^:/]+:\d{2,5}/i,
	/listening (?:on|at)/i,
	/server (?:running|started|is running)/i,
	/ready (?:on|at|in)/i,
	/started (?:on|at)/i,
	/bound to (?:port)?/i,
	/development server/i,
	/serving (?:on|at)/i,
	/next\.?js/i,
	/vite/i,
	/webpack.*compiled/i,
	/express/i,
	/fastify/i,
];

/**
 * Check if terminal output contains hints that a port may have been opened.
 * This is a lightweight check - false positives are acceptable since we verify
 * with actual process scanning.
 */
export function containsPortHint(data: string): boolean {
	if (data.length < 10) return false;

	return HINT_PATTERNS.some((pattern) => pattern.test(data));
}
