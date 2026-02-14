interface WorkspaceAheadBehindProps {
	ahead: number;
	behind: number;
}

export function WorkspaceAheadBehind({
	ahead,
	behind,
}: WorkspaceAheadBehindProps) {
	if (ahead === 0 && behind === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums shrink-0">
			{behind > 0 && <span className="text-amber-500">↓{behind}</span>}
			{ahead > 0 && <span className="text-emerald-500">↑{ahead}</span>}
		</div>
	);
}
