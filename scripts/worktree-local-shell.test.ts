import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let workRoot: string;

beforeEach(() => {
	workRoot = mkdtempSync(join(tmpdir(), "superset-worktree-shell-"));
});

afterEach(() => {
	rmSync(workRoot, { recursive: true, force: true });
});

function runBash(script: string) {
	return spawnSync("bash", ["-lc", script], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
	});
}

function shellString(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

describe("worktree local shell helpers", () => {
	test("derives different default compose projects for same-named worktree paths", () => {
		const first = join(workRoot, "first", "superset");
		const second = join(workRoot, "second", "superset");
		mkdirSync(first, { recursive: true });
		mkdirSync(second, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/worktree-local.sh
			first_project="$(worktree_default_db_project ${shellString(first)})"
			second_project="$(worktree_default_db_project ${shellString(second)})"
			[[ "$first_project" == superset-superset-* ]]
			[[ "$second_project" == superset-superset-* ]]
			[[ "$first_project" != "$second_project" ]]
		`);

		expect(result.status).toBe(0);
	});

	test("detects missing or stale managed local setup", () => {
		const root = join(workRoot, "review", "superset");
		const envPath = join(workRoot, ".env");
		mkdirSync(root, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			env_path=${shellString(envPath)}
			id="$(worktree_path_hash "$root")"
			cat > "$env_path" <<ENV
# ===== Local workspace overrides (setup.local.sh) =====
SUPERSET_WORKTREE_ID="$id"
SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
SUPERSET_PORT_BASE="3000"
LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
LOCAL_PG_PORT="3014"
LOCAL_NEON_PROXY_PORT="3015"
LOCAL_ELECTRIC_PORT="3009"
LOCAL_REDIS_PORT="3016"
LOCAL_KV_REST_PORT="3017"
API_PORT="3001"
DESKTOP_VITE_PORT="3005"
CADDY_ELECTRIC_PORT="3010"
WRANGLER_PORT="3012"
RELAY_PORT="3013"
DATABASE_URL="postgres://postgres:postgres@localhost:3015/main"
DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
KV_REST_API_URL="http://localhost:3017"
KV_URL="redis://localhost:3016"
ELECTRIC_URL="http://localhost:3009/v1/shape"
NEXT_PUBLIC_ELECTRIC_URL="http://localhost:3012"
NEXT_PUBLIC_ELECTRIC_PROXY_URL="http://localhost:3012"
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
RELAY_URL="http://localhost:3013"
NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
ENV
			if worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
			cp "$env_path" "$env_path.local"
			sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL="postgres://postgres:postgres@production.example.com:5432/main"|' "$env_path"
			if ! worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
			cp "$env_path.local" "$env_path"
			sed -i.bak 's/^SUPERSET_WORKTREE_ID=.*/SUPERSET_WORKTREE_ID="stale"/' "$env_path"
			if ! worktree_env_requires_local_setup "$root" "$env_path"; then
				exit 1
			fi
		`);

		expect(result.status).toBe(0);
	});

	test("rejects non-local service URLs before destructive worktree actions", () => {
		const root = join(workRoot, "remote-env", "superset");
		mkdirSync(root, { recursive: true });

		const result = runBash(`
			set -euo pipefail
			source .superset/lib/common.sh
			source .superset/lib/worktree-local.sh
			root=${shellString(root)}
			export SUPERSET_WORKTREE_ID="$(worktree_path_hash "$root")"
			export SUPERSET_WORKTREE_ROOT="$(worktree_physical_root "$root")"
			export SUPERSET_HOME_DIR="$(worktree_expected_home_dir "$root")"
			export SUPERSET_PORT_BASE=3000
			export LOCAL_DB_PROJECT="$(worktree_default_db_project "$root")"
			export LOCAL_PG_PORT=3014
			export LOCAL_NEON_PROXY_PORT=3015
			export LOCAL_ELECTRIC_PORT=3009
			export LOCAL_REDIS_PORT=3016
			export LOCAL_KV_REST_PORT=3017
			export API_PORT=3001
			export DESKTOP_VITE_PORT=3005
			export WRANGLER_PORT=3012
			export CADDY_ELECTRIC_PORT=3010
			export RELAY_PORT=3013
			export DATABASE_URL="postgres://postgres:postgres@production.example.com:5432/main"
			export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:3014/main"
			export KV_REST_API_URL="http://localhost:3017"
			export KV_URL="redis://localhost:3016"
			export ELECTRIC_URL="http://localhost:3009/v1/shape"
			export NEXT_PUBLIC_ELECTRIC_URL="http://localhost:3012"
			export NEXT_PUBLIC_ELECTRIC_PROXY_URL="http://localhost:3012"
			export NEXT_PUBLIC_API_URL="http://localhost:3001"
			export NEXT_PUBLIC_DESKTOP_URL="http://localhost:3005"
			export RELAY_URL="http://localhost:3013"
			export NEXT_PUBLIC_RELAY_URL="http://localhost:3013"
			if worktree_assert_current_local_env "$root"; then
				exit 1
			fi
		`);

		expect(result.status).toBe(0);
		expect(result.stderr + result.stdout).toContain("DATABASE_URL");
	});
});
