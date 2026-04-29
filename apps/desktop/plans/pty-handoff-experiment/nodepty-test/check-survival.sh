#!/bin/bash
# Externally verify which shells from a survival-results.json are still alive.
# Usage: ./check-survival.sh survival-results.json
set -eu
FILE="${1:-survival-results.json}"
if [ ! -f "$FILE" ]; then
  echo "missing $FILE"
  exit 2
fi

ALIVE=0
DEAD=0
for pid in $(jq -r '.[] | .shellPid' "$FILE"); do
  if [ "$pid" = "null" ]; then
    echo "  ?    pid=null (workload didn't print before parent exit)"
    DEAD=$((DEAD+1))
    continue
  fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "  OK   pid=$pid alive"
    ALIVE=$((ALIVE+1))
  else
    echo "  DEAD pid=$pid"
    DEAD=$((DEAD+1))
  fi
done

echo
echo "Alive: $ALIVE   Dead: $DEAD"

# Also list helper-pid alive state for context.
echo
echo "Helper PIDs:"
for pid in $(jq -r '.[] | .helperPid' "$FILE"); do
  if kill -0 "$pid" 2>/dev/null; then
    echo "  OK   helper=$pid alive"
  else
    echo "  GONE helper=$pid"
  fi
done

# Cleanup any survivors so we don't leave sleeping shells around.
for pid in $(jq -r '.[] | .shellPid' "$FILE"); do
  [ "$pid" = "null" ] || kill "$pid" 2>/dev/null || true
done
for pid in $(jq -r '.[] | .helperPid' "$FILE"); do
  kill "$pid" 2>/dev/null || true
done

if [ "$DEAD" -eq 0 ]; then exit 0; else exit 1; fi
