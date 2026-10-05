import type { TerminalColors } from "@superset/shared/terminal-colors";

type ViewerColors = { colors: TerminalColors; resetOverrides: boolean };

export class TerminalColorAuthority<Viewer> {
	private readonly viewers = new Map<Viewer, ViewerColors>();
	private readonly apply: (
		colors: TerminalColors,
		resetOverrides: boolean,
	) => void;

	constructor(
		apply: (colors: TerminalColors, resetOverrides: boolean) => void,
	) {
		this.apply = apply;
	}

	update(viewer: Viewer, colors: TerminalColors, resetOverrides = false): void {
		const pendingReset = this.viewers.get(viewer)?.resetOverrides ?? false;
		this.viewers.set(viewer, {
			colors,
			resetOverrides: pendingReset || resetOverrides,
		});
		if (this.viewers.keys().next().value === viewer) this.applyOwner();
	}

	remove(viewer: Viewer): void {
		const wasOwner = this.viewers.keys().next().value === viewer;
		this.viewers.delete(viewer);
		if (wasOwner) this.applyOwner();
	}

	private applyOwner(): void {
		const owner = this.viewers.values().next().value;
		if (!owner) return;
		this.apply(owner.colors, owner.resetOverrides);
		owner.resetOverrides = false;
	}
}
