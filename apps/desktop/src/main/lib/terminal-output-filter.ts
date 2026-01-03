/**
 * Terminal output filter - transforms data before display (not storage).
 * Implement this interface to add custom filters.
 */
export interface TerminalOutputFilter {
	readonly id: string;
	readonly description: string;
	filter(data: string): string;
}

export class TerminalOutputFilterChain {
	private filters: TerminalOutputFilter[] = [];

	register(filter: TerminalOutputFilter): void {
		if (this.filters.some((f) => f.id === filter.id)) {
			return;
		}
		this.filters.push(filter);
	}

	unregister(filterId: string): boolean {
		const index = this.filters.findIndex((f) => f.id === filterId);
		if (index === -1) {
			return false;
		}
		this.filters.splice(index, 1);
		return true;
	}

	apply(data: string): string {
		let result = data;
		for (const filter of this.filters) {
			result = filter.filter(result);
			if (result.length === 0) {
				break;
			}
		}
		return result;
	}

	getRegisteredFilters(): string[] {
		return this.filters.map((f) => f.id);
	}

	clear(): void {
		this.filters = [];
	}
}

export const terminalOutputFilterChain = new TerminalOutputFilterChain();
