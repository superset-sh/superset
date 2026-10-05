-- One task counter per team. An insert into tasks that sets team_id is numbered
-- from that team's counter; one that leaves it out still goes to the
-- organization's oldest team.
--
-- A team's counter is created on its first task. The oldest team keeps the key
-- derived from the organization's name; any other team is keyed on its own
-- name. A key another team in the organization already has gets a number
-- suffix (DESIG, DESI2, DESI3).

CREATE FUNCTION public.reserve_task_numbers(
	org uuid,
	team uuid,
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
	oldest_team_id uuid;
	target_team_id uuid;
	key_source text;
	derived_key text;
	candidate_key text;
	suffix integer;
BEGIN
	UPDATE public.task_sequences s
	SET last_number = s.last_number + amount
	WHERE s.organization_id = org
		AND s.team_id = coalesce(team, (
			SELECT t.id
			FROM auth.teams t
			WHERE t.organization_id = org
			ORDER BY t.created_at, t.id
			LIMIT 1
		))
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

	SELECT t.id INTO oldest_team_id
	FROM auth.teams t
	WHERE t.organization_id = org
	ORDER BY t.created_at, t.id
	LIMIT 1;

	target_team_id := coalesce(team, oldest_team_id);

	IF target_team_id = oldest_team_id THEN
		key_source := org_name;
	ELSE
		SELECT t.name INTO key_source
		FROM auth.teams t
		WHERE t.id = target_team_id AND t.organization_id = org;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'team % is not in organization %', target_team_id, org;
		END IF;
	END IF;

	-- "Jürgen Brandstetter's Team" -> JURGE; no Latin letters -> TASK.
	derived_key := coalesce(
		nullif(
			upper(left(regexp_replace(
				public.unaccent(regexp_replace(
					(regexp_split_to_array(btrim(key_source), '\s+'))[1],
					'[''’]s$', '', 'i'
				)),
				'[^A-Za-z]', '', 'g'
			), 5)),
			''
		),
		'TASK'
	);

	LOOP
		UPDATE public.task_sequences s
		SET last_number = s.last_number + amount
		WHERE s.team_id = target_team_id
		RETURNING s.team_id, s.key, s.last_number
		INTO reserved_team_id, reserved_key, reserved_last_number;
		EXIT WHEN FOUND;

		candidate_key := derived_key;
		suffix := 1;
		WHILE EXISTS (
			SELECT 1 FROM public.task_sequences s
			WHERE s.organization_id = org AND s.key = candidate_key
		) LOOP
			suffix := suffix + 1;
			candidate_key := left(derived_key, 5 - length(suffix::text)) || suffix;
		END LOOP;

		-- A concurrent insert for the same team or the same key makes this a
		-- no-op; the next pass then finds the row or picks the next key.
		INSERT INTO public.task_sequences (team_id, organization_id, key, last_number)
		SELECT
			target_team_id,
			org,
			candidate_key,
			coalesce(max(substring(t.slug FROM '^' || candidate_key || '-([0-9]{1,9})$')::int), 0)
		FROM public.tasks t
		WHERE t.organization_id = org AND t.slug LIKE candidate_key || '-%'
		ON CONFLICT DO NOTHING;
	END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.assign_task_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	reserved record;
BEGIN
	SELECT * INTO reserved
	FROM public.reserve_task_numbers(NEW.organization_id, NEW.team_id, 1);
	NEW.team_id := reserved.reserved_team_id;
	NEW.number := reserved.reserved_last_number;
	NEW.slug := reserved.reserved_key || '-' || reserved.reserved_last_number;
	RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP FUNCTION public.reserve_task_numbers(uuid, integer);
