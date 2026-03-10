/**
 * DB Reset Script
 * public 스키마의 모든 테이블과 enum을 삭제한 후 drizzle-kit push로 재생성
 */
import * as dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: "../../.env.local" });
dotenv.config({ path: "../../.env" });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

async function reset() {
  const sql = postgres(DATABASE_URL!, { max: 1 });

  console.log("Dropping all tables in public schema...");

  await sql.unsafe(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      -- Drop all tables
      FOR r IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;

      -- Drop all custom enum types
      FOR r IN (
        SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public' AND t.typtype = 'e'
      ) LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  console.log("All tables and enums dropped.");
  await sql.end();
  console.log("Now run: pnpm db:push");
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
