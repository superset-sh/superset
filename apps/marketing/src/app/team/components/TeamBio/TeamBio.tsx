import { parseTeamBio } from "../../utils/teamBio";

interface TeamBioProps {
	bio: string;
	className?: string;
}

export function TeamBio({ bio, className }: TeamBioProps) {
	return (
		<p className={className}>
			{parseTeamBio(bio).map((segment, index) => {
				const key = `${segment.type}-${index}-${segment.text}`;

				if (segment.type === "link") {
					return (
						<a
							href={segment.href}
							key={key}
							rel="noopener noreferrer"
							target="_blank"
						>
							{segment.text}
						</a>
					);
				}

				return <span key={key}>{segment.text}</span>;
			})}
		</p>
	);
}
