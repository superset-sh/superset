/**
 * High-performance scrollback buffer using array-based storage.
 *
 * JavaScript strings are immutable, so `str += data` creates a new string
 * by copying the entire contents. For a 1MB scrollback, each append copies
 * 1MB, making it O(n) per operation and O(n²) over time.
 *
 * This class stores chunks in an array (O(1) amortized append) and only
 * joins them when the string representation is needed (lazy evaluation).
 */
export class ScrollbackBuffer {
	private chunks: string[] = [];
	private cachedString: string | null = null;
	private totalLength = 0;

	/**
	 * Append data to the buffer. O(1) amortized.
	 */
	append(data: string): void {
		if (data.length === 0) return;

		this.chunks.push(data);
		this.totalLength += data.length;
		this.cachedString = null; // Invalidate cache
	}

	/**
	 * Get the full scrollback as a string. O(n) but cached.
	 */
	toString(): string {
		if (this.cachedString === null) {
			this.cachedString = this.chunks.join("");
			// Compact: replace chunks array with single string to reduce memory
			if (this.chunks.length > 1) {
				this.chunks = [this.cachedString];
			}
		}
		return this.cachedString;
	}

	/**
	 * Clear the buffer. O(1).
	 */
	clear(): void {
		this.chunks = [];
		this.cachedString = null;
		this.totalLength = 0;
	}

	/**
	 * Initialize from an existing string. O(1).
	 */
	static fromString(str: string): ScrollbackBuffer {
		const buffer = new ScrollbackBuffer();
		if (str.length > 0) {
			buffer.chunks = [str];
			buffer.cachedString = str;
			buffer.totalLength = str.length;
		}
		return buffer;
	}

	/**
	 * Get the total length without joining. O(1).
	 */
	get length(): number {
		return this.totalLength;
	}
}
