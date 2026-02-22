# Setup argument parsing.

FORCE_OVERWRITE_DATA=0
SETUP_LOCAL_MCP=0

setup_print_usage() {
  cat <<EOT
Usage: .superset/setup.sh [options]

Options:
  -f, --force              Reset superset-dev-data/ before seeding local DB
  -m, --mcp              Add superset-local MCP entry to .mcp.json
  -h, --help               Show this help message
EOT
}

# Returns:
# 0 = continue
# 2 = help shown, stop successfully
# 1 = argument error
setup_parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -f|--force)
        FORCE_OVERWRITE_DATA=1
        shift
        ;;
      -m|--mcp)
        SETUP_LOCAL_MCP=1
        shift
        ;;
      -h|--help)
        setup_print_usage
        return 2
        ;;
      *)
        error "Unknown argument: $1"
        setup_print_usage
        return 1
        ;;
    esac
  done

  return 0
}
