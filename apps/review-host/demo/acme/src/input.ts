export interface InputOptions {
  maxLength: number;
  placeholder?: string;
}

/** Normalises user input before it reaches the command bar. */
export function normaliseInput(raw: string, options: InputOptions): string {
  const trimmed = raw.trim();
  return trimmed.slice(0, options.maxLength);
}

export function isOverflowing(raw: string, options: InputOptions): boolean {
  return raw.trim().length > options.maxLength;
}
