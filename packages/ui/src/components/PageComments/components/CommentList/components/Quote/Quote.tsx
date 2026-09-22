"use client";

const CLASS_NAME =
	"line-clamp-2 border-l-2 border-primary pl-2 text-left text-muted-foreground text-sm italic";

export function Quote({
	children,
	onClick,
}: {
	children: string;
	onClick?: () => void;
}) {
	if (!onClick) return <p className={CLASS_NAME}>{children}</p>;
	return (
		<button type="button" onClick={onClick} className={CLASS_NAME}>
			{children}
		</button>
	);
}
