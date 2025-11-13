interface AppFrameProps {
	children: React.ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
	return (
		<div className="absolute inset-0 bg-stone-950 flex">
			{children}
		</div>
	);
}
