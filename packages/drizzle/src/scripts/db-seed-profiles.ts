/**
 * DB Seed Profiles Script
 * auth.users 기반으로 profiles 동기화 + 트리거/RLS 재생성
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

async function seedProfiles() {
  const sql = postgres(DATABASE_URL!, { max: 1 });

  // 1. auth.users → profiles 동기화
  console.log("Syncing auth.users → profiles...");

  const result = await sql.unsafe(`
    INSERT INTO public.profiles (id, email, name, avatar)
    SELECT
      u.id,
      u.email,
      COALESCE(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name',
        split_part(u.email, '@', 1)
      ),
      u.raw_user_meta_data ->> 'avatar_url'
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = u.id
    )
    RETURNING id, email;
  `);

  console.log(`  ✓ ${result.length} profile(s) synced from auth.users`);

  // 2. auth trigger 재생성 (handle_new_user)
  console.log("Recreating auth triggers...");

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, name, avatar)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data ->> 'avatar_url'
      );
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();

    CREATE OR REPLACE FUNCTION public.handle_user_delete()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      DELETE FROM public.profiles WHERE id = OLD.id;
      RETURN OLD;
    END;
    $$;

    DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
    CREATE TRIGGER on_auth_user_deleted
      BEFORE DELETE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_user_delete();
  `);

  console.log("  ✓ handle_new_user trigger recreated");
  console.log("  ✓ handle_user_delete trigger recreated");

  // 3. RLS 정책 재생성
  console.log("Recreating RLS policies...");

  await sql.unsafe(`
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
    CREATE POLICY "Profiles are viewable by authenticated users"
      ON public.profiles FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
    CREATE POLICY "Users can update their own profile"
      ON public.profiles FOR UPDATE TO authenticated
      USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

    DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
    CREATE POLICY "Users can delete their own profile"
      ON public.profiles FOR DELETE TO authenticated
      USING (auth.uid() = id);
  `);

  console.log("  ✓ RLS policies recreated");

  await sql.end();
  console.log("Profile seed complete!");
}

seedProfiles().catch((err) => {
  console.error("Profile seed failed:", err);
  process.exit(1);
});
