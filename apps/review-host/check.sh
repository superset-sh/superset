#!/usr/bin/env bash
# Outside-in check on the App Store review host. Run from a clone, with gcloud
# authenticated. Exits non-zero with a reason if a reviewer would have a bad time.
#
# The in-box timer keeps the version current and the in-box watchdog restarts a
# host the relay cannot see, but neither can report a box that is wedged, deleted
# or unreachable — that is what this is for.
#
# The interesting check is the last one. It derives the host procedures the
# mobile app actually calls from the working tree, then probes each against the
# live box. That is what would have caught 2026-08-17, when the app started
# calling github.getPullRequestDetail and the box silently 404'd it for three
# weeks: the version floor never noticed, because 1.22.0 still cleared 1.21.0.
set -uo pipefail

INSTANCE="${INSTANCE:-superset-review-host}"
ZONE="${ZONE:-us-west1-b}"
PROJECT="${PROJECT:-fair-scout-481221-v0}"
ORG="${REVIEW_ORG_ID:-9617bc8e-7f57-4af8-8b5e-586290ae536a}"
ROOT="$(git rev-parse --show-toplevel)"
SECRET=review-host-watchdog
FAIL=0
note() { echo "$1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

ssh_box() { gcloud compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" --quiet --command="$1" 2>/dev/null; }

# Distinguish "the box is broken" from "this machine cannot ask". Without this,
# an expired gcloud refresh token reports the instance as missing and pages
# someone about a host that is perfectly healthy — every probe below runs
# through gcloud, so they all fail the same way.
if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "INCONCLUSIVE: gcloud cannot authenticate on this machine; the review host was not checked"
  echo "  run: gcloud auth login"
  exit 2
fi

STATUS=$(gcloud compute instances describe "$INSTANCE" --zone="$ZONE" --project="$PROJECT" --format="value(status)" 2>/dev/null)
[ "$STATUS" = "RUNNING" ] && note "instance: RUNNING" || fail "instance is '${STATUS:-missing}', not RUNNING"

INFO=$(ssh_box "sudo curl -sf -m 10 -H 'Authorization: Bearer $SECRET' http://127.0.0.1:48800/trpc/host.info")
RUNNING_VERSION=$(printf '%s' "$INFO" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["version"])' 2>/dev/null)
HOST_ID=$(printf '%s' "$INFO" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["hostId"])' 2>/dev/null)
if [ -n "$RUNNING_VERSION" ]; then note "host-service: $RUNNING_VERSION (host $HOST_ID)"; else fail "host-service is not answering"; fi

TAG=$(curl -sf -m 20 -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/superset-sh/superset/releases/latest 2>/dev/null \
  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("tag_name",""))' 2>/dev/null)
LATEST="${TAG#desktop-v}"
# Every branch below fails closed. A probe that cannot run tells us nothing
# about the host, and reporting OK on no evidence is the failure mode this
# script exists to catch — it is how the box went 21 days unnoticed.
if [ -z "$LATEST" ]; then
  fail "could not read the latest release from GitHub; version not verified"
elif [ -n "$LATEST" ] && [ -n "$RUNNING_VERSION" ]; then
  if [ "$LATEST" = "$RUNNING_VERSION" ]; then
    note "version: current with $LATEST"
  else
    NEWER=$(printf '%s\n%s\n' "$RUNNING_VERSION" "$LATEST" | sort -V | tail -1)
    [ "$NEWER" = "$RUNNING_VERSION" ] && note "version: $RUNNING_VERSION is ahead of released $LATEST" \
      || fail "version: running $RUNNING_VERSION, released $LATEST — the daily timer has not caught up"
  fi
fi

if [ -n "$HOST_ID" ]; then
  ONLINE=$(ssh_box "sudo sh -c 'T=\$(python3 -c \"import json;print(json.load(open(\\\"/root/.superset/config.json\\\"))[\\\"auth\\\"][\\\"accessToken\\\"])\"); curl -sf -m 10 -H \"Authorization: Bearer \$T\" \"https://relay.superset.sh/presence?hostIds=$ORG:$HOST_ID\"'" \
    | python3 -c 'import json,sys;h=json.load(sys.stdin)["hosts"];print("yes" if any(v.get("online") for v in h.values()) else "no")' 2>/dev/null)
  [ "$ONLINE" = "yes" ] && note "relay: sees the host online" || fail "relay does not see the host — the reviewer gets an empty app"
fi

# Procedures the mobile app calls on a host client. apiClient calls are excluded:
# host.relayEndpoint and github.listPullRequests are cloud API, not host-service.
NS=$(grep -oE "^[[:space:]]+[a-zA-Z][a-zA-Z0-9]*:" "$ROOT/packages/host-service/src/trpc/router/router.ts" \
  | sed -E 's/^[[:space:]]+//; s/:$//' | sort -u | paste -sd'|' -)
PROCS=$(grep -rhE "\b($NS)\.[a-zA-Z][a-zA-Z0-9]*\.(query|mutate)\b" "$ROOT/apps/mobile" --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v apiClient \
  | grep -oE "\b($NS)\.[a-zA-Z][a-zA-Z0-9]*\.(query|mutate)\b" | sed -E 's/\.(query|mutate)$//' | sort -u)
COUNT=$(printf '%s\n' "$PROCS" | grep -c . || true)
if [ -n "$RUNNING_VERSION" ] && [ "$COUNT" -gt 0 ]; then
  # Reports per procedure so a probe that never ran is distinguishable
  # from one that found nothing missing. -m bounds a hung procedure.
  PROBED=$(ssh_box "sudo sh -c 'for P in $(printf '%s ' $PROCS); do R=\$(curl -s -m 15 -H \"Authorization: Bearer $SECRET\" \"http://127.0.0.1:48800/trpc/\$P\" | head -c 200); case \"\$R\" in *NOT_FOUND*) echo \"missing \$P\";; *) echo \"ok \$P\";; esac; done'")
  MISSING=$(printf '%s\n' "$PROBED" | awk '$1=="missing"{print $2}')
  if [ -z "$PROBED" ]; then
    fail "the procedure probe did not run; the host's surface is unverified"
  elif [ -z "$MISSING" ]; then
    note "procedures: all $COUNT the app calls are present"
  else
    fail "procedures missing on the host: $(printf '%s' "$MISSING" | tr '\n' ' ')"
  fi
fi

# The workspace list is the reviewer's home screen, and workspace.list reads
# host.db — which will happily describe worktrees that are not on disk. That is
# exactly what moving to GCP produced: host.db came across, the worktrees did
# not, and every demo workspace would have opened onto nothing while the list
# looked perfect. So test the disk, not the list.
WS_JSON=$(ssh_box "sudo curl -s -m 10 -H 'Authorization: Bearer $SECRET' http://127.0.0.1:48800/trpc/workspace.list")
if [ -z "$WS_JSON" ]; then
  fail "workspace.list did not answer; the reviewer's workspaces are unverified"
else
  PATHS=$(printf '%s' "$WS_JSON" | python3 -c 'import json,sys
d = json.load(sys.stdin)["result"]["data"]["json"]
print(" ".join(w["worktreePath"] for w in d if w.get("worktreePath")))' 2>/dev/null)
  if [ -n "$PATHS" ]; then
    # A failed ssh here returns nothing, which is indistinguishable from "all
    # present" unless the probe reports for itself.
    DISK=$(ssh_box "sudo bash -c 'for p in $PATHS; do if [ -d \"\$p\" ]; then echo \"ok \$p\"; else echo \"gone \$p\"; fi; done'")
    GONE=$(printf '%s\n' "$DISK" | awk '$1=="gone"{print $2}' | paste -sd', ' -)
    if [ -z "$DISK" ]; then
      fail "the worktree probe did not run; cannot tell whether the workspaces open"
    elif [ -z "$GONE" ]; then
      note "worktrees: every workspace has one on disk"
    else
      fail "worktrees missing (the workspace opens onto nothing): $GONE"
    fi
  fi

  # Whatever is in this organization is what Apple sees, and it has drifted
  # before — two stray probe workspaces sat next to the curated set.
  ACTUAL=$(printf '%s' "$WS_JSON" | python3 -c 'import json,sys
d = json.load(sys.stdin)["result"]["data"]["json"]
print("\n".join(sorted(w["name"] for w in d if w.get("type") != "main")))' 2>/dev/null)
  EXPECTED='Add haptics to buttons
Add transcription demo
Fix input overflow handling
Tidy up empty states
Update icon size'
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    note "demo set: matches the App Store screenshots"
  else
    EXTRA=$(comm -13 <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") | paste -sd', ' -)
    LOST=$(comm -23 <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") | paste -sd', ' -)
    [ -n "$EXTRA" ] && fail "extra workspaces the reviewer would see: $EXTRA"
    [ -n "$LOST" ] && fail "demo workspaces missing from the reviewer's list: $LOST"
  fi
fi

# The store listing promises "review the diff from your phone", so an empty diff
# is a listing mismatch, not a cosmetic gap. It has been empty twice: once when
# the worktrees were rebuilt as bare branches, and once when the demo repos lost
# refs/remotes/origin/HEAD and the base could not resolve at all.
if [ -n "$WS_JSON" ]; then
  # These ids are interpolated into commands a remote shell parses, so anything
  # that is not a plain uuid is dropped rather than escaped. workspace.adopt
  # takes an unrestricted existingWorkspaceId, so the host database is not a
  # trusted source of shell-safe strings.
  WS_IDS=$(printf '%s' "$WS_JSON" | python3 -c 'import json,re,sys
d = json.load(sys.stdin)["result"]["data"]["json"]
ok = re.compile(r"\A[0-9a-fA-F-]{36}\Z")
print(" ".join(w["id"] for w in d if w.get("type") != "main" and ok.match(w.get("id", ""))))' 2>/dev/null)
  # Dropping one silently would hide a workspace from every probe below, which is
  # the fail-open shape this script keeps getting wrong.
  WS_NONMAIN=$(printf '%s' "$WS_JSON" | python3 -c 'import json,sys
d = json.load(sys.stdin)["result"]["data"]["json"]
print(sum(1 for w in d if w.get("type") != "main"))' 2>/dev/null)
  WS_COUNT=$(printf '%s' "$WS_IDS" | wc -w | tr -d " ")
  [ "$WS_COUNT" = "$WS_NONMAIN" ] || fail "$((WS_NONMAIN - WS_COUNT)) workspace(s) have an id that is not a uuid and were not checked"

  if [ -n "$WS_IDS" ]; then
    NODIFF=$(ssh_box "sudo sh -c 'for W in $WS_IDS; do n=\$(curl -s -m 15 -X POST -H \"Authorization: Bearer $SECRET\" -H \"content-type: application/json\" --data \"{\\\"json\\\":{\\\"workspaceId\\\":\\\"\$W\\\"}}\" http://127.0.0.1:48800/trpc/git.listCommits | grep -c hash); [ \"\$n\" = \"0\" ] && echo \$W; done'")
    [ -z "$NODIFF" ] && note "diffs: every demo workspace has one" \
      || fail "demo workspaces with an empty diff (the listing promises diff review): $(printf '%s' "$NODIFF" | tr '\n' ' ')"
  fi
fi

# The pull-request chip is the reviewer's only route to the diff, and it needs a
# GitHub token on the box: ctx.github() throws NO_GITHUB_TOKEN rather than
# falling back to unauthenticated, even for a public repo. The token is a
# fine-grained PAT and PATs expire — this one on 2026-10-05 — so check it
# directly rather than waiting for a reviewer to find an empty chip.
for REPO in acme-demo acme-ios-demo; do
  TOKEN_STATUS=$(ssh_box "sudo bash -c 'set -a; . /etc/superset-review-host.env 2>/dev/null; set +a; curl -s -o /dev/null -w \"%{http_code}\" -m 15 -H \"Authorization: Bearer \$GH_TOKEN\" https://api.github.com/repos/superset-sh/$REPO/pulls/1'")
  case "$TOKEN_STATUS" in
    200) note "github token: can read $REPO#1" ;;
    401|403) fail "the GitHub token is rejected ($TOKEN_STATUS) — expired or revoked; the PR chip and the diff behind it are gone. Regenerate a fine-grained PAT (public repositories, read-only) and rewrite /etc/superset-review-host.env" ;;
    "") fail "could not test the GitHub token against $REPO" ;;
    *) fail "GitHub returned $TOKEN_STATUS for $REPO#1" ;;
  esac
done

# Both demo projects carry a linked pull request — acme through acme-demo#1 and
# acme-ios through acme-ios-demo#1. The chip is the only navigation to
# files-changed, so losing a link removes the diff from that whole project even
# though every other check still passes.
if [ -n "$WS_IDS" ]; then
  IDS_JSON=$(printf '%s\n' $WS_IDS | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
  LINKED=$(ssh_box "sudo curl -s -m 20 -X POST -H 'Authorization: Bearer $SECRET' -H 'content-type: application/json' --data '{\"json\":{\"workspaceIds\":$IDS_JSON}}' http://127.0.0.1:48800/trpc/pullRequests.historyByWorkspaces" \
    | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)["result"]["data"]["json"]["workspaces"]
    print(sum(1 for w in d if w.get("pullRequests")))
except Exception:
    print("")' 2>/dev/null)
  case "$LINKED" in
    "")  fail "could not read pull-request links" ;;
    0)   fail "no workspace has a linked pull request — the chip is the only route to the diff the listing promises" ;;
    1)   fail "only one workspace has a linked pull request; one of the two demo projects has no route to a diff" ;;
    *)   note "pull requests: $LINKED workspace(s) linked, so the diff is reachable in both projects" ;;
  esac
fi

[ "$FAIL" -eq 0 ] && echo "OK — the review host is serving what the app expects" || echo "review host needs attention"
exit "$FAIL"
