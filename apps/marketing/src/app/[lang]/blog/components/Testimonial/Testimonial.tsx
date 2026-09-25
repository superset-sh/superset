import Image from "next/image";
import type { ReactNode } from "react";

function getInitials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function Avatar({ src, name }: { src?: string; name: string }) {
	if (src) {
		return (
			<Image
				src={src}
				alt={name}
				width={40}
				height={40}
				className="size-10 shrink-0 rounded-full object-cover"
			/>
		);
	}

	return (
		<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
			{getInitials(name)}
		</span>
	);
}

interface TestimonialProps {
	name: string;
	role?: string;
	avatar?: string;
	href?: string;
	featured?: boolean;
	children: ReactNode;
}

export function Testimonial({
	name,
	role,
	avatar,
	href,
	featured = false,
	children,
}: TestimonialProps) {
	const body = (
		<>
			<span className={`flex gap-3 ${role ? "items-start" : "items-center"}`}>
				<Avatar src={avatar} name={name} />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="text-sm font-semibold text-foreground">{name}</span>
					{role && (
						<span className="text-sm text-muted-foreground">{role}</span>
					)}
				</span>
			</span>
			<span
				className={`mt-3 block leading-relaxed text-foreground/90 [&>p]:m-0 [&>p+p]:mt-3 ${
					featured ? "text-lg sm:text-xl" : "text-[15px]"
				}`}
			>
				{children}
			</span>
		</>
	);

	const className = `not-prose block border border-border bg-card transition-colors ${
		featured ? "p-6 sm:col-span-2" : "p-4"
	}`;

	if (href) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={`${className} hover:border-muted-foreground/50`}
			>
				{body}
			</a>
		);
	}

	return <div className={className}>{body}</div>;
}
