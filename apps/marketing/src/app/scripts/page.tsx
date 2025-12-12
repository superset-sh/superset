"use client";

import { motion } from "framer-motion";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

const CONFIG_EXAMPLE = `{
  "setup": [
    "bun install",
    "bun run db:migrate"
  ],
  "teardown": [
    "docker-compose down"
  ]
}`;

const SHELL_SCRIPT_EXAMPLE = `{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"]
}`;

export default function ScriptsPage() {
	return (
		<>
			<Header />
			<main className="flex flex-col bg-neutral-900 min-h-screen pt-24">
				<div className="max-w-3xl mx-auto px-6 py-12">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5 }}
					>
						<h1 className="text-4xl font-bold text-white mb-4">
							Setup & Teardown Scripts
						</h1>
						<p className="text-lg text-zinc-400 mb-12">
							Automate workspace initialization and cleanup with config.json
						</p>

						<section className="mb-12">
							<h2 className="text-2xl font-semibold text-white mb-4">
								Overview
							</h2>
							<p className="text-zinc-300 mb-4">
								Superset can automatically run commands when creating or
								deleting workspaces. This is useful for:
							</p>
							<ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
								<li>Installing dependencies</li>
								<li>Running database migrations</li>
								<li>Starting background services</li>
								<li>Cleaning up resources when done</li>
							</ul>
						</section>

						<section className="mb-12">
							<h2 className="text-2xl font-semibold text-white mb-4">
								Configuration
							</h2>
							<p className="text-zinc-300 mb-4">
								Create a <code className="text-amber-400">config.json</code>{" "}
								file in your project&apos;s{" "}
								<code className="text-amber-400">.superset</code> directory:
							</p>
							<pre className="bg-neutral-800 rounded-lg p-4 overflow-x-auto mb-4">
								<code className="text-sm text-zinc-300">
									your-project/.superset/config.json
								</code>
							</pre>
						</section>

						<section className="mb-12">
							<h2 className="text-2xl font-semibold text-white mb-4">Schema</h2>
							<p className="text-zinc-300 mb-4">
								The config file has two optional arrays:
							</p>
							<pre className="bg-neutral-800 rounded-lg p-4 overflow-x-auto mb-6">
								<code className="text-sm text-green-400">{CONFIG_EXAMPLE}</code>
							</pre>

							<div className="space-y-4">
								<div className="border border-zinc-700 rounded-lg p-4">
									<h3 className="text-lg font-medium text-white mb-2">
										<code className="text-amber-400">setup</code>
									</h3>
									<p className="text-zinc-300">
										Array of shell commands to run when a new workspace is
										created. Commands run sequentially in the workspace&apos;s
										worktree directory.
									</p>
								</div>

								<div className="border border-zinc-700 rounded-lg p-4">
									<h3 className="text-lg font-medium text-white mb-2">
										<code className="text-amber-400">teardown</code>
									</h3>
									<p className="text-zinc-300">
										Array of shell commands to run when a workspace is deleted.
										Useful for cleaning up resources like Docker containers or
										temporary files.
									</p>
								</div>
							</div>
						</section>

						<section className="mb-12">
							<h2 className="text-2xl font-semibold text-white mb-4">
								Using Shell Scripts
							</h2>
							<p className="text-zinc-300 mb-4">
								For complex setup logic, reference shell scripts instead of
								inline commands:
							</p>
							<pre className="bg-neutral-800 rounded-lg p-4 overflow-x-auto mb-4">
								<code className="text-sm text-green-400">
									{SHELL_SCRIPT_EXAMPLE}
								</code>
							</pre>
							<p className="text-zinc-400 text-sm">
								Make sure your scripts are executable:{" "}
								<code className="text-amber-400">
									chmod +x .superset/setup.sh
								</code>
							</p>
						</section>

						<section className="mb-12">
							<h2 className="text-2xl font-semibold text-white mb-4">
								How It Works
							</h2>
							<ol className="list-decimal list-inside text-zinc-300 space-y-3 ml-4">
								<li>
									When you create a new workspace, Superset creates a git
									worktree for your branch
								</li>
								<li>
									If <code className="text-amber-400">config.json</code> exists
									with setup commands, they run automatically in the new
									worktree
								</li>
								<li>
									Commands execute in a terminal tab so you can see output
								</li>
								<li>
									When deleting a workspace, teardown commands run before the
									worktree is removed
								</li>
							</ol>
						</section>

						<section className="mb-12">
							<h2 className="text-2xl font-semibold text-white mb-4">Tips</h2>
							<ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
								<li>
									Keep setup scripts fast - they run every time you create a
									workspace
								</li>
								<li>
									Use <code className="text-amber-400">&&</code> to chain
									commands that depend on each other
								</li>
								<li>
									Add <code className="text-amber-400">.superset/</code> to your{" "}
									<code className="text-amber-400">.gitignore</code> if you
									don&apos;t want to share configs
								</li>
								<li>Or commit it to share workspace setup with your team</li>
							</ul>
						</section>
					</motion.div>
				</div>
			</main>
			<Footer />
		</>
	);
}
