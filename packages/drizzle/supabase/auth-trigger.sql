-- ============================================
-- Supabase Auth → Profiles 자동 생성 트리거
-- ============================================
--
-- 이 SQL을 Supabase Dashboard > SQL Editor에서 실행하세요.
-- 또는 Supabase CLI로 마이그레이션에 포함할 수 있습니다.
--
-- 기능:
-- 1. auth.users에 새 사용자 생성 시 profiles 자동 생성
-- 2. 사용자 메타데이터(full_name, avatar_url)를 profiles로 복사
-- 3. 기본 role은 'editor'로 설정
-- ============================================

-- 1. profiles 자동 생성 함수
-- 참고: role 관리는 role-permission 기능의 user_roles 테이블을 통해 처리됨
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

-- 2. 트리거 생성 (이미 존재하면 삭제 후 재생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. (선택) 사용자 삭제 시 profiles도 삭제
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

-- 4. (선택) 기존 auth.users에 대해 profiles 생성 (최초 설정 시)
-- 주의: 이미 profiles가 있는 사용자는 건너뜁니다.
/*
INSERT INTO public.profiles (id, email, name, avatar)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'avatar_url'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);
*/

-- ============================================
-- 권한 설정 (RLS - Row Level Security)
-- ============================================

-- profiles 테이블 RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 정책: 모든 인증된 사용자가 profiles 조회 가능
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 정책: 자신의 profile만 수정 가능
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 정책: 자신의 profile만 삭제 가능 (선택적)
CREATE POLICY "Users can delete their own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ============================================
-- 검증 쿼리
-- ============================================
-- 트리거 확인
-- SELECT * FROM pg_trigger WHERE tgname LIKE 'on_auth%';

-- 함수 확인
-- SELECT proname FROM pg_proc WHERE proname LIKE 'handle_%_user%';
