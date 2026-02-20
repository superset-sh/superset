# Setup main entrypoint.

setup_main() {
  FAILED_STEPS=()
  SKIPPED_STEPS=()

  setup_parse_args "$@"
  local args_status=$?
  if [ "$args_status" -eq 2 ]; then
    return 0
  fi
  if [ "$args_status" -ne 0 ]; then
    return 1
  fi

  echo "🚀 Setting up Superset workspace..."
  echo ""

  # Step 1: Load environment
  if ! step_load_env; then
    step_failed "Load environment variables"
  fi

  # Step 2: Check dependencies
  if ! step_check_dependencies; then
    step_failed "Check dependencies"
  fi

  # Step 3: Install dependencies
  if ! step_install_dependencies; then
    step_failed "Install dependencies"
  fi

  # Step 4: Seed local DB into superset-dev-data/
  if ! step_seed_local_db; then
    step_failed "Seed local DB"
  fi

  # Step 5: Seed auth token into superset-dev-data/
  if ! step_seed_auth_token; then
    step_failed "Seed auth token"
  fi

  # Step 6: Setup Neon branch
  if ! step_setup_neon_branch; then
    step_failed "Setup Neon branch"
  fi

  # Step 7: Allocate port base (file-backed)
  if ! allocate_port_base; then
    step_failed "Allocate port base"
  fi

  # Step 8: Start Electric SQL
  if ! step_start_electric; then
    step_failed "Start Electric SQL"
  fi

  # Step 9: Write .env file
  if ! step_write_env; then
    step_failed "Write .env file"
  fi

  # Print summary and exit with appropriate code
  print_summary "Setup"
}
