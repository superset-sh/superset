"use client";

import { motion } from "framer-motion";

const CONFIG_EXAMPLE = `{
  "ports": [
    { "port": 3000, "label": "Frontend Dev Server" },
    { "port": 8080, "label": "API Server" },
    { "port": 5432, "label": "PostgreSQL" }
  ]
}`;

export default function PortsPage() {
	return (
		<main className="flex flex-col bg-background min-h-screen pt-24">
			<div className="max-w-3xl mx-auto px-6 py-12">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					<h1 className="text-4xl font-bold text-foreground mb-4">
						Static Port Configuration
					</h1>
					<p className="text-lg text-muted-foreground mb-12">
						Define custom ports for your workspace with ports.json
					</p>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							Overview
						</h2>
						<p className="text-muted-foreground mb-4">
							Superset automatically detects ports opened by processes running
							in your terminal sessions. However, you can override this dynamic
							detection with a static configuration file. This is useful for:
						</p>
						<ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
							<li>
								Documenting ports that aren&apos;t auto-detected (databases,
								external services)
							</li>
							<li>Providing meaningful labels for your team</li>
							<li>Ensuring consistent port documentation across branches</li>
							<li>Projects where dynamic scanning doesn&apos;t work well</li>
						</ul>
					</section>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							Configuration
						</h2>
						<p className="text-muted-foreground mb-4">
							Create a{" "}
							<code className="text-amber-500 dark:text-amber-400">
								ports.json
							</code>{" "}
							file in your project&apos;s{" "}
							<code className="text-amber-500 dark:text-amber-400">
								.superset
							</code>{" "}
							directory:
						</p>
						<pre className="bg-muted rounded-lg p-4 overflow-x-auto mb-4">
							<code className="text-sm text-muted-foreground">
								your-project/.superset/ports.json
							</code>
						</pre>
					</section>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							Schema
						</h2>
						<p className="text-muted-foreground mb-4">
							The configuration file has one required field:
						</p>
						<pre className="bg-muted rounded-lg p-4 overflow-x-auto mb-6">
							<code className="text-sm text-green-600 dark:text-green-400">
								{CONFIG_EXAMPLE}
							</code>
						</pre>

						<div className="space-y-4">
							<div className="border border-border rounded-lg p-4">
								<h3 className="text-lg font-medium text-foreground mb-2">
									<code className="text-amber-500 dark:text-amber-400">
										ports
									</code>
								</h3>
								<p className="text-muted-foreground">
									An array of port definitions. Each entry must include:
								</p>
								<ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mt-2">
									<li>
										<code className="text-amber-500 dark:text-amber-400">
											port
										</code>{" "}
										- Port number (1-65535)
									</li>
									<li>
										<code className="text-amber-500 dark:text-amber-400">
											label
										</code>{" "}
										- Display text shown in the tooltip
									</li>
								</ul>
							</div>
						</div>
					</section>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							How It Works
						</h2>
						<ol className="list-decimal list-inside text-muted-foreground space-y-3 ml-4">
							<li>
								When you open a workspace, Superset checks for{" "}
								<code className="text-amber-500 dark:text-amber-400">
									.superset/ports.json
								</code>
							</li>
							<li>
								If the file exists, its ports are displayed in the sidebar
								instead of dynamically detected ports
							</li>
							<li>
								Ports appear as clickable badges that open{" "}
								<code className="text-amber-500 dark:text-amber-400">
									localhost:PORT
								</code>{" "}
								in your browser
							</li>
							<li>
								Hovering over a port badge shows your custom label in a tooltip
							</li>
							<li>
								Changes to the file are detected automatically - no restart
								needed
							</li>
						</ol>
					</section>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							Error Handling
						</h2>
						<p className="text-muted-foreground mb-4">
							If{" "}
							<code className="text-amber-500 dark:text-amber-400">
								ports.json
							</code>{" "}
							is malformed or contains invalid data:
						</p>
						<ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
							<li>An error toast notification will appear with details</li>
							<li>No ports will be displayed until the issue is fixed</li>
							<li>Dynamic port detection will NOT be used as a fallback</li>
						</ul>
						<p className="text-muted-foreground mt-4">
							Common validation errors include:
						</p>
						<ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
							<li>Invalid JSON syntax</li>
							<li>
								Missing the{" "}
								<code className="text-amber-500 dark:text-amber-400">
									ports
								</code>{" "}
								array
							</li>
							<li>Port number out of range (must be 1-65535)</li>
							<li>Missing or empty label</li>
						</ul>
					</section>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							Workspace Scope
						</h2>
						<p className="text-muted-foreground mb-4">
							The{" "}
							<code className="text-amber-500 dark:text-amber-400">
								ports.json
							</code>{" "}
							file is read from each workspace&apos;s working directory. This
							means:
						</p>
						<ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
							<li>Different branches can have different port configurations</li>
							<li>
								Changes in one workspace don&apos;t affect other workspaces
							</li>
							<li>
								You can commit{" "}
								<code className="text-amber-500 dark:text-amber-400">
									.superset/ports.json
								</code>{" "}
								to share with your team
							</li>
						</ul>
					</section>

					<section className="mb-12">
						<h2 className="text-2xl font-semibold text-foreground mb-4">
							Tips
						</h2>
						<ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
							<li>
								Use descriptive labels that help teammates understand each
								service
							</li>
							<li>
								Include ports for databases and external services that run
								outside terminals
							</li>
							<li>
								Commit{" "}
								<code className="text-amber-500 dark:text-amber-400">
									.superset/ports.json
								</code>{" "}
								to version control so your whole team benefits
							</li>
							<li>
								If you need dynamic detection, simply delete or rename the{" "}
								<code className="text-amber-500 dark:text-amber-400">
									ports.json
								</code>{" "}
								file
							</li>
						</ul>
					</section>
				</motion.div>
			</div>
		</main>
	);
}
