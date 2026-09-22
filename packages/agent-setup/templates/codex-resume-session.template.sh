_superset_codex_resume_id() {
  local _superset_resume_seen="0" _superset_skip_value="0" _superset_candidate=""
  local _superset_token
  for _superset_token in "$@"; do
    if [ "$_superset_skip_value" = "1" ]; then
      case "$_superset_token" in -*) return ;; esac
      _superset_skip_value="0"
      continue
    fi
    case "$_superset_token" in
      --last|--remote|--remote=*|--) return ;;
      -c|--config|--enable|--disable|-m|--model|-p|--profile|-s|--sandbox|-a|--ask-for-approval|-C|--cd|--add-dir)
        _superset_skip_value="1" ;;
      --config=*|--enable=*|--disable=*|--model=*|--profile=*|--sandbox=*|--ask-for-approval=*|--cd=*|--add-dir=*) ;;
      --all|--include-non-interactive|--strict-config|--oss|--full-auto|--dangerously-bypass-approvals-and-sandbox|--dangerously-bypass-hook-trust|--no-alt-screen) ;;
      -*) return ;;
      *)
        if [ "$_superset_resume_seen" = "0" ]; then
          [ "$_superset_token" = "resume" ] || return
          _superset_resume_seen="1"
        elif [ -z "$_superset_candidate" ]; then
          [[ "$_superset_token" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]] || return
          _superset_candidate="$_superset_token"
        fi
        ;;
    esac
  done
  [ "$_superset_skip_value" = "0" ] && printf '%s' "$_superset_candidate"
}
_superset_resume_id="$(_superset_codex_resume_id "$@")"
if [ -n "$_superset_resume_id" ]; then
  _superset_launch_payload=$(printf '{"hook_event_name":"SessionStart","session_id":"%s"}' "$_superset_resume_id")
fi
