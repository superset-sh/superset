---
description: Delete Neon database branches created before today (preserves production)
allowed-tools: Bash, Read
---

Clean up old Neon database branches from the project's Neon account. This command deletes all non-production branches created before today's date.

## Steps

1. Read the root `.env` file to get `NEON_PROJECT_ID` and `NEON_ORG_ID`.
2. Run `neonctl branches list --project-id $NEON_PROJECT_ID --org-id $NEON_ORG_ID --output json` to get all branches.
3. Filter branches to find ones where:
   - `primary` is `false` (skip the production branch)
   - `created_at` is before today (UTC)
4. Show the user a table of branches that will be deleted (name, created date, branch ID).
5. If there are no branches to delete, inform the user and stop.
6. Ask the user for confirmation before deleting.
7. On confirmation, delete each branch in parallel using `neonctl branches delete <branch-id> --project-id $NEON_PROJECT_ID --org-id $NEON_ORG_ID`.
8. Report results.

$ARGUMENTS
