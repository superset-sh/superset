export interface RefreshableTerminal {
	rows: number;
	refresh: (start: number, end: number) => void;
}

export interface TextureAtlasResettable {
	clearTextureAtlas: () => void;
}

export function refreshTerminalRenderer(
	terminal: RefreshableTerminal,
	webglAddon: TextureAtlasResettable | null,
): void {
	try {
		webglAddon?.clearTextureAtlas();
	} catch {}
	terminal.refresh(0, Math.max(0, terminal.rows - 1));
}
