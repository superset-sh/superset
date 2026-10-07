import { expect, test } from "bun:test";
import { tmpdir } from "node:os";

async function runClient(
	body: string,
	flag?: string,
	url = "postgres://test:test@127.0.0.1:1/test",
	unpooledUrl = url,
) {
	const clientPath = new URL("./client.ts", import.meta.url).pathname;
	const utilsPath = new URL("./utils/sql.ts", import.meta.url).pathname;
	const rowsPath = new URL("./utils/execute-rows.ts", import.meta.url).pathname;
	const child = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`import { mock } from "bun:test";
			mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
			const { db, dbWs } = await import(${JSON.stringify(clientPath)});
			const { getCurrentTxid, withConnectionLock } = await import(${JSON.stringify(utilsPath)});
			const { executeRows } = await import(${JSON.stringify(rowsPath)});
			const { sql } = await import("${new URL("../node_modules/drizzle-orm/index.js", import.meta.url).pathname}");
			try { ${body}; process.exit(0); }
			catch (error) { console.error(error); process.exit(1); }`,
		],
		{
			cwd: tmpdir(),
			env: {
				PATH: process.env.PATH ?? "",
				DATABASE_URL: url,
				DATABASE_URL_UNPOOLED: unpooledUrl,
				...(flag === undefined ? {} : { SELF_HOST_DB: flag }),
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}

test("uses native Postgres for both exports when explicitly enabled", async () => {
	const result = await runClient(
		`if (db.constructor.name !== "PostgresJsDatabase" || db !== dbWs) throw Error("native driver missing");`,
		"1",
	);
	expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
});

test("native Postgres uses the direct URL instead of the Neon proxy URL", async () => {
	const result = await runClient(
		`if (db.$client.options.host[0] !== "direct.example.test" || db.$client.options.port[0] !== 5432) throw Error("native client did not select the direct URL");`,
		"1",
		"postgres://test:test@proxy.example.test:4444/test",
		"postgres://test:test@direct.example.test:5432/test",
	);
	expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
});

test("keeps Neon HTTP and WebSocket drivers by default", async () => {
	for (const flag of [undefined, "0"]) {
		const result = await runClient(
			`if (db.constructor.name !== "NeonHttpDatabase" || dbWs.constructor.name !== "NeonDatabase" || db === dbWs) throw Error("default drivers changed");`,
			flag,
		);
		expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
	}
});

const localUrl = process.env.SELF_HOST_DB_TEST_DATABASE_URL;
(localUrl ? test : test.skip)(
	"native exports run queries, commit and roll back transactions, and serialize advisory locks",
	async () => {
		if (
			!localUrl ||
			!["127.0.0.1", "localhost", "[::1]"].includes(new URL(localUrl).hostname)
		) {
			throw Error("A disposable loopback PostgreSQL database is required");
		}
		const result = await runClient(
			`const assert = (value, message) => { if (!value) throw Error(message); };
			for (const client of [db, dbWs]) {
				const rows = executeRows(await client.execute(sql\`SELECT 42::int AS answer\`));
				assert(rows[0]?.answer === 42, "query result missing");
				await client.transaction(async (tx) => {
					await tx.execute(sql\`CREATE TEMP TABLE proof_commit (value int) ON COMMIT DROP\`);
					await tx.execute(sql\`INSERT INTO proof_commit VALUES (7)\`);
					assert(executeRows(await tx.execute(sql\`SELECT value FROM proof_commit\`))[0]?.value === 7, "transaction query missing");
					const txid = await getCurrentTxid(tx);
					assert(Number.isSafeInteger(txid) && txid > 0, "transaction ID missing");
				});
			}
			await db.execute(sql\`CREATE TABLE proof_rollback (value int)\`);
			try { await dbWs.transaction(async (tx) => {
				await tx.execute(sql\`INSERT INTO proof_rollback VALUES (9)\`);
				throw Error("rollback");
			}); } catch (error) { assert(error.message === "rollback", "unexpected rollback error"); }
			assert(executeRows(await db.execute(sql\`SELECT count(*)::int AS n FROM proof_rollback\`))[0]?.n === 0, "rollback failed");
			let release;
			const held = new Promise(resolve => release = resolve);
			let started;
			const ready = new Promise(resolve => started = resolve);
			const first = withConnectionLock("native-proof", async () => { started(); await held; });
			await ready;
			const blocked = await dbWs.transaction(async tx => executeRows(await tx.execute(sql\`SELECT pg_try_advisory_xact_lock(hashtextextended('native-proof'::text, 0)) AS locked\`))[0]?.locked);
			assert(blocked === false, "advisory lock did not exclude a concurrent transaction");
			release(); await first;
			assert(await withConnectionLock("native-proof", async () => true), "advisory lock did not release");
			await db.execute(sql\`DROP TABLE proof_rollback\`);`,
			"1",
			localUrl,
		);
		expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
	},
	30000,
);
