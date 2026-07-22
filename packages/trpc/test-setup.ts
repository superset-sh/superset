// CI has no root .env, and @superset/db/client throws at import without a URL.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ??=
	"postgresql://test:test@localhost:5432/test";
