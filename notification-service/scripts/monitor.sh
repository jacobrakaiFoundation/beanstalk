#!/usr/bin/env bash
set -euo pipefail

health_url=${HEALTH_URL:-http://127.0.0.1:8787/healthz}
require_push=${REQUIRE_PUSH:-0}
response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT
http_status=$(curl --silent --show-error --max-time 10 --output "$response_file" --write-out '%{http_code}' "$health_url")
payload=$(<"$response_file")
echo "$payload" | jq -c '{status,pushDisabled,poll,queue}'
[[ $http_status == 200 ]]
jq -e --arg require_push "$require_push" '
  .database == "ok" and
  .poll.initialized == true and
  .poll.stale == false and
  .poll.gapStatus == "normal" and
  (.poll.consecutiveFailures | tonumber) == 0 and
  (.queue.sending | tonumber) < 100 and
  (.queue.recentApnsFailures | tonumber) == 0 and
  ($require_push != "1" or .pushDisabled == false)
' <<<"$payload" >/dev/null
