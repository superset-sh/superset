-- ============================================
-- Supabase Storage Buckets 초기 설정
-- ============================================
--
-- DB reset 또는 새 Supabase 인스턴스 세팅 시 실행
-- Supabase Dashboard > SQL Editor 또는 psql로 실행
--
-- 버킷:
-- 1. files (private) - 인증된 사용자만 접근
-- 2. public-files (public) - 공개 접근 가능
-- ============================================

-- 1. Storage 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('files', 'files', false, 52428800, NULL),
  ('public-files', 'public-files', true, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS 정책 — files (private bucket)

-- 인증된 사용자가 자신의 폴더에 업로드 가능
CREATE POLICY "Authenticated users can upload files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'files');

-- 인증된 사용자가 자신의 파일 조회 가능
CREATE POLICY "Authenticated users can read own files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'files');

-- 인증된 사용자가 자신의 파일 삭제 가능
CREATE POLICY "Authenticated users can delete own files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'files');

-- 3. RLS 정책 — public-files (public bucket)

-- 누구나 조회 가능
CREATE POLICY "Public files are viewable by everyone"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'public-files');

-- 인증된 사용자가 업로드 가능
CREATE POLICY "Authenticated users can upload public files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'public-files');

-- 인증된 사용자가 삭제 가능
CREATE POLICY "Authenticated users can delete public files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'public-files');
