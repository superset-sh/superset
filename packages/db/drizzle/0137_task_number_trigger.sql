-- Per-team task numbers. An insert into tasks that leaves slug out gets team_id,
-- number and slug = <key>-<number> from its organization's team counter.
--
-- Drizzle has no syntax for functions or triggers, so this is a custom
-- migration. The counter row stays locked until the inserting transaction
-- commits, so numbers in a team never collide and a rolled-back insert gives
-- its number back.

CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

-- Takes `amount` consecutive numbers and returns the last one. The first call
-- for an organization creates its counter on the organization's oldest team
-- (creating a team if it has none), keyed on the first word of its name, and
-- starts above the highest <key>-<n> slug the organization already has.
CREATE FUNCTION public.reserve_task_numbers(
	org uuid,
	amount integer,
	OUT reserved_team_id uuid,
	OUT reserved_key text,
	OUT reserved_last_number integer
)
LANGUAGE plpgsql
AS $$
DECLARE
	org_name text;
	org_slug text;
	default_team_id uuid;
	derived_key text;
BEGIN
	UPDATE public.task_sequences s
	SET last_number = s.last_number + amount
	WHERE s.organization_id = org
	RETURNING s.team_id, s.key, s.last_number
	INTO reserved_team_id, reserved_key, reserved_last_number;
	IF FOUND THEN
		RETURN;
	END IF;

	SELECT o.name, o.slug INTO org_name, org_slug
	FROM auth.organizations o
	WHERE o.id = org;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'organization % not found', org;
	END IF;

	INSERT INTO auth.teams (organization_id, name, slug)
	SELECT org, org_name, coalesce(org_slug, org::text)
	WHERE NOT EXISTS (SELECT 1 FROM auth.teams t WHERE t.organization_id = org)
	ON CONFLICT DO NOTHING;

	SELECT t.id INTO default_team_id
	FROM auth.teams t
	WHERE t.organization_id = org
	ORDER BY t.created_at
	LIMIT 1;

	-- "Jürgen Brandstetter's Team" -> JURGE; no Latin letters -> TASK.
	derived_key := coalesce(
		nullif(
			upper(left(regexp_replace(
				public.unaccent(regexp_replace(
					(regexp_split_to_array(btrim(org_name), '\s+'))[1],
					'[''’]s$', '', 'i'
				)),
				'[^A-Za-z]', '', 'g'
			), 5)),
			''
		),
		'TASK'
	);

	INSERT INTO public.task_sequences (team_id, organization_id, key, last_number)
	SELECT
		default_team_id,
		org,
		derived_key,
		coalesce(max(substring(t.slug FROM '^' || derived_key || '-([0-9]{1,9})$')::int), 0)
	FROM public.tasks t
	WHERE t.organization_id = org AND t.slug LIKE derived_key || '-%'
	ON CONFLICT DO NOTHING;

	UPDATE public.task_sequences s
	SET last_number = s.last_number + amount
	WHERE s.organization_id = org
	RETURNING s.team_id, s.key, s.last_number
	INTO reserved_team_id, reserved_key, reserved_last_number;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.assign_task_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	reserved record;
BEGIN
	SELECT * INTO reserved FROM public.reserve_task_numbers(NEW.organization_id, 1);
	NEW.team_id := reserved.reserved_team_id;
	NEW.number := reserved.reserved_last_number;
	NEW.slug := reserved.reserved_key || '-' || reserved.reserved_last_number;
	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER tasks_assign_number
BEFORE INSERT ON public.tasks
FOR EACH ROW
WHEN (NEW.slug IS NULL)
EXECUTE FUNCTION public.assign_task_number();
