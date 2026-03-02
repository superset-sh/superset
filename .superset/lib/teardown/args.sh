# Teardown argument parsing.

REMOVE_DEV_DATA=0

teardown_print_usage() {
  cat <<EOT
Usage: .superset/teardown.sh [options]

Options:
  -f, --force              Remove superset-dev-data/ in current workspace
  -h, --help               Show this help message
EOT
}

# Returns:
# 0 = continue
# 2 = help shown, stop successfully
# 1 = argument error
teardown_parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -f|--force)
        REMOVE_DEV_DATA=1
        shift
        ;;
      -h|--help)
        teardown_print_usage
        return 2
        ;;
      *)
        error "Unknown argument: $1"
        teardown_print_usage
        return 1
        ;;
    esac
  done

  return 0
}
