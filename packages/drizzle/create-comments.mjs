import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const sql = postgres(process.env.DATABASE_URL);

async function createCommentTable() {
  // Create enums if not exist
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE comment_target_type AS ENUM ('board_post', 'community_post', 'blog_post', 'page');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE comment_status AS ENUM ('visible', 'hidden', 'deleted');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create comments table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS comment_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,
      author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      target_type comment_target_type NOT NULL,
      target_id UUID NOT NULL,
      parent_id UUID,
      depth INTEGER NOT NULL DEFAULT 0,
      status comment_status NOT NULL DEFAULT 'visible',
      mentions JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Create indexes
  await sql.unsafe('CREATE INDEX IF NOT EXISTS idx_comment_comments_target ON comment_comments(target_type, target_id);');
  await sql.unsafe('CREATE INDEX IF NOT EXISTS idx_comment_comments_parent ON comment_comments(parent_id);');
  await sql.unsafe('CREATE INDEX IF NOT EXISTS idx_comment_comments_author ON comment_comments(author_id);');

  console.log('✅ Comments table created successfully!');
  await sql.end();
}

createCommentTable().catch(e => {
  console.error(e);
  process.exit(1);
});
