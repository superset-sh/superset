interface PlaceholderStateProps {
	loading: boolean;
	error: string | null;
	hasWorkspace: boolean;
}

export function PlaceholderState({
	loading,
	error,
	hasWorkspace,
}: PlaceholderStateProps) {
	const baseClasses =
		"flex items-center justify-center h-full bg-neutral-900/50 backdrop-blur-xl rounded-2xl";

	if (loading) {
		return <div className={baseClasses}>Loading workspace...</div>;
	}

	if (error) {
		return <div className={`${baseClasses} text-red-400`}>Error: {error}</div>;
	}

	if (!hasWorkspace) {
		return (
			<div className={`${baseClasses} flex-col text-neutral-400`}>
				<p className="mb-4">No repository open</p>
				<p className="text-sm text-neutral-500">
					Use <span className="font-mono">File → Open Repository...</span> or{" "}
					<span className="font-mono">Cmd+O</span> to get started
				</p>
			</div>
		);
	}

	// No tab group selected
	return (
		<div className={`${baseClasses} flex-col text-neutral-400`}>
			<p className="mb-4">Select a worktree and tab to view terminals</p>
			<p className="text-sm text-neutral-500">
				Create a worktree from the sidebar to get started
			</p>
		</div>
	);
}
