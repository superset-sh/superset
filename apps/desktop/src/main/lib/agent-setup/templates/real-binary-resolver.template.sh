list_binary_candidates() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="${dir%/}"
    case "$dir" in
      "{{BIN_DIR}}"|"$HOME"/.superset/bin|"$HOME"/.superset-*/bin) continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\n" "$dir/$name"
    fi
  done
}

is_probable_shim() {
  local candidate="$1"
  local home_prefix="$HOME/"
  case "$candidate" in
    "$home_prefix".*"/bin/"*) return 0 ;;
  esac
  [ -L "$candidate" ]
}

resolve_binary_chain() {
  local name="$1"
  local candidate=""
  local selected=""
  local root=""

  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ -z "$selected" ]; then
      selected="$candidate"
      continue
    fi
    if [ "$candidate" = "$selected" ]; then
      continue
    fi
    root="$candidate"
    break
  done <<EOF
$(list_binary_candidates "$name")
EOF

  if [ -z "$selected" ]; then
    return 1
  fi

  if [ -z "$root" ]; then
    root="$selected"
  fi

  if ! is_probable_shim "$selected"; then
    root="$selected"
  fi

  REAL_BIN="$selected"
  REAL_BIN_ROOT="$root"
}
