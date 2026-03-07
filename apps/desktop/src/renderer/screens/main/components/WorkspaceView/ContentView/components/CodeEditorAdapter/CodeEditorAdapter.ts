export interface EditorSelectionLines {
	startLine: number;
	endLine: number;
}

export interface CodeEditorAdapter {
	focus(): void;
	getValue(): string;
	setValue(value: string): void;
	revealPosition(line: number, column?: number): void;
	getSelectionLines(): EditorSelectionLines | null;
	selectAll(): void;
	cut(): void;
	copy(): void;
	paste(): void;
	openFind(): void;
	dispose(): void;
}
