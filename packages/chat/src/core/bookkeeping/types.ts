/**
 * Harnesses put their own bookkeeping into the conversation as user-role
 * turns: a backgrounded agent reporting back, the environment block an agent
 * is briefed with, a slash command's echo. None of it was typed by a person,
 * and none of it belongs in a message bubble.
 *
 * Each harness spells its own, so each gets its own reader rather than one
 * shared list that every new agent has to be bolted onto.
 */
export type BookkeepingNote = {
	/** One line standing in for the block, in the reader's terms. */
	label: string;
};

export type BookkeepingReader = {
	/** Harness ids this reader speaks for, as `SessionState.harness` reports them. */
	harnesses: readonly string[];
	/** A note when the text is this harness's bookkeeping, null when it is a message. */
	read(text: string): BookkeepingNote | null;
};
