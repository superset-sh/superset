import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CommandOption {
	flag: string;
	required?: boolean;
	description?: ReactNode;
}

export interface CommandArg {
	name: string;
	variadic?: boolean;
	required?: boolean;
	description?: ReactNode;
}

export interface CommandProps {
	name: string;
	alias?: string;
	args?: CommandArg[];
	options?: CommandOption[];
	humanColumns?: string[];
	quiet?: string;
	className?: string;
	children?: ReactNode;
}

function slugify(name: string): string {
	return name
		.replace(/<[^>]+>/g, "")
		.replace(/\.\.\./g, "")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

export function Command({
	name,
	alias,
	args,
	options,
	humanColumns,
	quiet,
	className,
	children,
}: CommandProps) {
	const id = slugify(name);

	return (
		<section
			className={cn(
				"my-10 first:mt-0 border-t border-border pt-8 scroll-mt-20",
				className,
			)}
			id={id}
		>
			<h3 className="not-prose flex flex-wrap items-center gap-3 text-xl font-semibold">
				<a
					href={`#${id}`}
					className="font-mono text-foreground no-underline hover:underline"
				>
					{name}
				</a>
				{alias ? (
					<span className="rounded-md border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
						alias: <span className="font-mono">{alias}</span>
					</span>
				) : null}
			</h3>

			{children ? <div className="mt-4">{children}</div> : null}

			{args && args.length > 0 ? (
				<div className="mt-6 not-prose">
					<h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
						Arguments
					</h4>
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="border-b border-border">
								<th className="text-left py-2 pr-4 font-medium w-1/3">Name</th>
								<th className="text-left py-2 font-medium">Description</th>
							</tr>
						</thead>
						<tbody>
							{args.map((arg) => {
								const display = arg.variadic ? `${arg.name}...` : arg.name;
								return (
									<tr
										key={arg.name}
										className="border-b border-border/50 align-top"
									>
										<td className="py-2 pr-4">
											<code className="font-mono text-sm">
												{arg.required ? `<${display}>` : `[${display}]`}
											</code>
											{arg.required ? (
												<span className="ml-2 text-xs text-muted-foreground">
													required
												</span>
											) : null}
										</td>
										<td className="py-2 text-muted-foreground">
											{arg.description ?? ""}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : null}

			{options && options.length > 0 ? (
				<div className="mt-6 not-prose">
					<h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
						Options
					</h4>
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="border-b border-border">
								<th className="text-left py-2 pr-4 font-medium w-1/3">Flag</th>
								<th className="text-left py-2 font-medium">Description</th>
							</tr>
						</thead>
						<tbody>
							{options.map((opt) => (
								<tr
									key={opt.flag}
									className="border-b border-border/50 align-top"
								>
									<td className="py-2 pr-4">
										<code className="font-mono text-sm">{opt.flag}</code>
										{opt.required ? (
											<span className="ml-2 text-xs text-muted-foreground">
												required
											</span>
										) : null}
									</td>
									<td className="py-2 text-muted-foreground">
										{opt.description ?? ""}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}

			{humanColumns && humanColumns.length > 0 ? (
				<p className="mt-4 text-sm text-muted-foreground">
					<span className="font-semibold">Human mode:</span> table with{" "}
					{humanColumns.map((col, i) => (
						<span key={col}>
							<code className="font-mono text-xs">{col}</code>
							{i < humanColumns.length - 1 ? ", " : ""}
						</span>
					))}
					.
				</p>
			) : null}

			{quiet ? (
				<p className="mt-2 text-sm text-muted-foreground">
					<code className="font-mono text-xs">--quiet</code>: {quiet}.
				</p>
			) : null}
		</section>
	);
}

export interface CommandReturnsProps {
	children: ReactNode;
}

export function CommandReturns({ children }: CommandReturnsProps) {
	return (
		<div className="mt-6">
			<h4 className="not-prose text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
				Returns
			</h4>
			<div className="space-y-3">{children}</div>
		</div>
	);
}

export interface HumanOutputProps {
	children: ReactNode;
}

export function HumanOutput({ children }: HumanOutputProps) {
	return <div className="not-prose">{children}</div>;
}

export interface JsonOutputProps {
	children: ReactNode;
}

export function JsonOutput({ children }: JsonOutputProps) {
	return (
		<div className="not-prose">
			<h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
				<code className="font-mono normal-case">--json</code>
			</h4>
			{children}
		</div>
	);
}
