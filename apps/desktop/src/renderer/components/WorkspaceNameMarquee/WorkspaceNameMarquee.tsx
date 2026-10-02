import { MarqueeText } from "renderer/components/MarqueeText";

interface WorkspaceNameMarqueeProps {
	name: string;
	prefix?: string;
	className?: string;
	forceActive?: boolean;
}

export function WorkspaceNameMarquee({
	name,
	prefix,
	className,
	forceActive,
}: WorkspaceNameMarqueeProps) {
	return (
		<MarqueeText
			title={prefix ? `${prefix}/${name}` : name}
			className={className}
			forceActive={forceActive}
		>
			{prefix && <span className="text-muted-foreground">{`${prefix}/`}</span>}
			{name}
		</MarqueeText>
	);
}
