"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={className}
			fill="currentColor"
		>
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

interface AuthorAvatarProps {
	name: string;
	twitterHandle?: string;
	title?: string;
}

export function AuthorAvatar({
	name,
	twitterHandle,
	title,
}: AuthorAvatarProps) {
	const initials = name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const avatar = (
		<div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground/70 cursor-pointer">
			{initials}
		</div>
	);

	if (!twitterHandle) {
		return avatar;
	}

	return (
		<Tooltip delayDuration={100}>
			<TooltipTrigger asChild>{avatar}</TooltipTrigger>
			<TooltipContent
				side="bottom"
				sideOffset={8}
				className="bg-white text-black px-4 py-3 rounded-xl shadow-lg border border-gray-200"
				showArrow={false}
			>
				<div className="flex flex-col gap-1.5">
					<div className="text-sm">
						<span className="font-semibold">{name}</span>
						{title && <span className="text-gray-500"> {title}</span>}
					</div>
					<a
						href={`https://x.com/${twitterHandle}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-black transition-colors"
					>
						<XIcon className="size-3.5" />
						<span>@{twitterHandle}</span>
					</a>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
