# Local PostgreSQL version change

The development Compose configuration pins PostgreSQL 18 and uses a separate
`superset_db18_data` volume mounted at `/var/lib/postgresql`. The official image
stores data in a version-specific directory below that mount; see the
[official image documentation](https://hub.docker.com/_/postgres).

The PostgreSQL 17 volume, `superset_db_data`, remains separate. PostgreSQL 18
starts empty and does not upgrade or import that volume. Keep both volumes
until the new setup and imported data have been verified. Never mount the old
PostgreSQL 17 data directory directly into PostgreSQL 18.

## Retain development data

Before changing the Compose file, save its PostgreSQL 17 configuration and
export the existing database:

```sh
set -eu
umask 077
cp docker-compose.yml docker-compose.pg17.yml
docker compose exec -T postgres pg_dump -U postgres -d main \
  --no-owner --no-acl > superset-pg17.sql
test -s superset-pg17.sql
docker compose down
```

Apply the PostgreSQL 18 Compose change, start the new database and restore the
export before running migrations or seeding:

```sh
set -eu
docker compose up -d --wait postgres
docker compose exec -T postgres psql -U postgres -d main \
  -v ON_ERROR_STOP=1 < superset-pg17.sql
docker compose up -d
```

Compare the imported tables, row counts and representative data with the saved
export, then run the normal development setup. If the data is disposable, skip
the import and deliberately reseed the new database instead. The export and
saved configuration belong to the developer; keep them out of version control.

Do not use volume removal commands during the change. In particular,
`./.superset/teardown.local.sh` runs `docker compose down -v` and deletes
`superset_db18_data`. Keep a verified export before using that teardown.

## Return to PostgreSQL 17

Stop the development stack with `docker compose down`, restore the saved
PostgreSQL 17 Compose file and restart it. Restore the complete file, including
its image, `superset_db_data` mount and top-level volume declaration. The old
database retains its pre-upgrade data; new PostgreSQL 18 writes are not copied
backward. This is a return to the retained database, not a downgrade of the new
database.

## Verification

An isolated arm64 rehearsal booted the pinned PostgreSQL 18 image and applied
the full application migration chain. A separate database imported 1,000
PostgreSQL 17 rows with Unicode JSON and integer identifiers above JavaScript's safe-integer range.
Ordered data checksums matched. Restarting PostgreSQL 17 preserved its original
checksum; an additional PostgreSQL 18 write left the old database unchanged.
Both runs used disposable volumes and fixture credentials. Other architectures
still need their own boot check.

This change is for local development. Native self-hosting adapters support
retained PostgreSQL 17 installations and do not require it.
