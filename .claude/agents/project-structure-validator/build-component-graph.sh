#!/bin/bash
# Builds component dependency graph for fast lookup
# Output: .claude/agents/project-structure-validator/.component-graph.json

DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/.component-graph.json"

echo "{" > "$OUTPUT"
echo '  "components": {' >> "$OUTPUT"

first=true
find "$DIR" -name "*.tsx" -type f ! -path "*/node_modules/*" ! -name "*.test.tsx" ! -name "*.stories.tsx" | while read file; do
  component=$(basename "$file" .tsx)
  path="${file#$DIR/}"

  # Count imports
  count=$(grep -r "from.*['\"].*$component['\"]" "$DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "$file" | wc -l | tr -d ' ')

  # Get importers
  importers=$(grep -l "from.*['\"].*$component['\"]" "$DIR" --include="*.tsx" --include="*.ts" -r 2>/dev/null | grep -v "$file" | sed "s|^$DIR/||" | paste -sd "," -)

  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> "$OUTPUT"
  fi

  echo -n "    \"$path\": {\"component\": \"$component\", \"imports\": $count, \"importers\": [" >> "$OUTPUT"
  if [ -n "$importers" ]; then
    echo "$importers" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' | tr -d '\n' >> "$OUTPUT"
  fi
  echo -n "]}" >> "$OUTPUT"
done

echo "" >> "$OUTPUT"
echo '  },' >> "$OUTPUT"
echo "  \"generated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" >> "$OUTPUT"
echo "}" >> "$OUTPUT"

echo "Built component graph: $OUTPUT"
