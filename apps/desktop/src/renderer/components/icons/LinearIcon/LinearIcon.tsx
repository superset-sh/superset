import linearIconUrl from "renderer/assets/icons/linear-icon.svg";

interface LinearIconProps {
	className?: string;
}

export function LinearIcon({ className }: LinearIconProps) {
	return (
		<img
			src={linearIconUrl}
			alt="Linear"
			className={className}
			draggable={false}
		/>
	);
}
