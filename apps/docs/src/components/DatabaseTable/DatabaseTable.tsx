import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { Check, Key, Link, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DatabaseField {
	name: string;
	type: string;
	description: string;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	isRequired?: boolean;
	isOptional?: boolean;
	isUnique?: boolean;
	references?: {
		model: string;
		field: string;
	};
}

interface DatabaseTableProps {
	fields: DatabaseField[];
	className?: string;
	tableName?: string;
}

export function DatabaseTable({
	fields,
	className,
	tableName,
}: DatabaseTableProps) {
	return (
		<div className={cn("my-6 overflow-hidden rounded-lg border", className)}>
			{tableName && (
				<div className="border-b bg-muted/50 px-4 py-3">
					<h4 className="font-mono text-sm font-semibold">{tableName}</h4>
				</div>
			)}
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b bg-muted/30">
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{i18n._(msg({ message: "Field" }))}
							</th>
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{i18n._(msg({ message: "Type" }))}
							</th>
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{i18n._(
									msg({
										message: "Constraints",
									}),
								)}
							</th>
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{i18n._(
									msg({
										message: "Description",
									}),
								)}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{fields.map((field) => {
							const isRequired = field.isRequired ?? !field.isOptional;
							return (
								<tr
									key={field.name}
									className="hover:bg-muted/30 transition-colors"
								>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<code className="text-sm font-mono font-medium">
												{field.name}
											</code>
											{field.isPrimaryKey && (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
													title={i18n._(
														msg({
															message: "Primary Key",
														}),
													)}
												>
													<Key className="h-3 w-3" />
													{i18n._(
														msg({
															message: "PK",
														}),
													)}
												</span>
											)}
											{field.isForeignKey && (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
													title={i18n._(
														msg({
															message: "Foreign Key",
														}),
													)}
												>
													<Link className="h-3 w-3" />
													{i18n._(
														msg({
															message: "FK",
														}),
													)}
												</span>
											)}
										</div>
									</td>
									<td className="px-4 py-3">
										<code className="text-sm font-mono text-muted-foreground">
											{field.type}
										</code>
									</td>
									<td className="px-4 py-3">
										<div className="flex flex-wrap gap-1.5">
											{isRequired ? (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
													title={i18n._(
														msg({
															message: "Required",
														}),
													)}
												>
													<Check className="h-3 w-3" />
													{i18n._(
														msg({
															message: "Required",
														}),
													)}
												</span>
											) : (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
													title={i18n._(
														msg({
															message: "Optional",
														}),
													)}
												>
													<X className="h-3 w-3" />
													{i18n._(
														msg({
															message: "Optional",
														}),
													)}
												</span>
											)}
											{field.isUnique && (
												<span
													className="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
													title={i18n._(
														msg({
															message: "Unique",
														}),
													)}
												>
													{i18n._(
														msg({
															message: "Unique",
														}),
													)}
												</span>
											)}
										</div>
									</td>
									<td className="px-4 py-3">
										<div className="space-y-1">
											<p className="text-sm text-muted-foreground">
												{field.description}
											</p>
											{field.references && (
												<p className="text-xs text-muted-foreground/70">
													→{" "}
													{i18n._(
														msg({
															message: "References",
														}),
													)}{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono">
														{field.references.model}.{field.references.field}
													</code>
												</p>
											)}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
