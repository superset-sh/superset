"use client";

interface MobileToolbarProps {
	onSend: (bytes: Uint8Array) => void;
}

export function MobileToolbar({ onSend }: MobileToolbarProps) {
	const send = (seq: string) => {
		onSend(new TextEncoder().encode(seq));
	};
	const buttons: Array<{ label: string; seq: string }> = [
		{ label: "Tab", seq: "\t" },
		{ label: "Esc", seq: "\x1b" },
		{ label: "Ctrl-C", seq: "\x03" },
		{ label: "Ctrl-D", seq: "\x04" },
		{ label: "↑", seq: "\x1b[A" },
		{ label: "↓", seq: "\x1b[B" },
		{ label: "←", seq: "\x1b[D" },
		{ label: "→", seq: "\x1b[C" },
	];
	return (
		<div
			className="border-t px-2 py-1 sm:hidden"
			style={{ borderColor: "#2a2827", backgroundColor: "#1a1716" }}
		>
			<div className="flex flex-wrap gap-1">
				{buttons.map((b) => (
					<button
						key={b.label}
						type="button"
						onClick={() => send(b.seq)}
						className="rounded border px-2 py-1 text-xs"
						style={{ borderColor: "#2a2827", color: "#eae8e6" }}
					>
						{b.label}
					</button>
				))}
			</div>
		</div>
	);
}
