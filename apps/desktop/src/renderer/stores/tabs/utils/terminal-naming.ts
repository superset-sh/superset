/**
 * Terminal naming utility
 * Generates unique terminal names with incremental numbering only on collision
 */

export interface TerminalNamingStrategy {
	generateName(existingNames: string[]): string;
}

export class DefaultTerminalNamingStrategy implements TerminalNamingStrategy {
	private readonly baseName: string;

	constructor(baseName = "Terminal") {
		this.baseName = baseName;
	}

	/**
	 * Generate a unique terminal name
	 * - Returns "Terminal" if no collision
	 * - Returns "Terminal (1)", "Terminal (2)", etc. on collision
	 */
	generateName(existingNames: string[]): string {
		// If no collision with base name, use it
		if (!existingNames.includes(this.baseName)) {
			return this.baseName;
		}

		// Find the next available number
		let counter = 1;
		while (existingNames.includes(`${this.baseName} (${counter})`)) {
			counter++;
		}

		return `${this.baseName} (${counter})`;
	}
}

/**
 * Helper function to generate a unique terminal name
 */
export const generateTerminalName = (
	existingNames: string[],
	strategy: TerminalNamingStrategy = new DefaultTerminalNamingStrategy(),
): string => {
	return strategy.generateName(existingNames);
};
