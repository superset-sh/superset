# Teardown main entrypoint.

teardown_main() {
  FAILED_STEPS=()
  SKIPPED_STEPS=()

  teardown_parse_args "$@"
  local args_status=$?
  if [ "$args_status" -eq 2 ]; then
    return 0
  fi
  if [ "$args_status" -ne 0 ]; then
    return 1
  fi

  echo "🧹 Tearing down Superset workspace..."
  echo ""

  # Step 1: Load environment
  if ! step_load_env; then
    step_failed "Load environment variables"
  fi

  # Step 2: Check dependencies (informational only)
  step_check_dependencies

  # Step 3: Kill terminal daemons
  if ! step_kill_terminal_daemons; then
    step_failed "Kill terminal daemons"
  fi

  # Step 4: Stop Electric SQL
  if ! step_stop_electric; then
    step_failed "Stop Electric SQL"
  fi

  # Step 5: Cleanup stale Electric replication sessions
  if ! step_cleanup_electric_replication; then
    step_failed "Cleanup Electric replication sessions"
  fi

  # Step 6: Delete Neon branch
  if ! step_delete_neon_branch; then
    step_failed "Delete Neon branch"
  fi

  # Step 7: Deallocate port base
  if ! step_deallocate_port; then
    step_failed "Deallocate port base"
  fi

  # Step 8: Remove superset-dev-data (optional)
  if ! step_remove_dev_data; then
    step_failed "Remove superset-dev-data"
  fi

  # Print summary and exit with appropriate code
  print_summary "Teardown"
}
