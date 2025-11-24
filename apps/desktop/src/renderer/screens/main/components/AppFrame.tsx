interface AppFrameProps {
	children: React.ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
	return <div className="absolute inset-0 bg-background flex">{children}</div>;
}
