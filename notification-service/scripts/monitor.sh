#!/usr/bin/env bash
set -euo pipefail

health_url=${HEALTH_URL:-http://127.0.0.1:8787/healthz}
require_push=${REQUIRE_PUSH:-0}
require_apns=${REQUIRE_APNS:-0}
require_fcm=${REQUIRE_FCM:-0}
max_pending_age_seconds=${MAX_PENDING_AGE_SECONDS:-1800}
max_pending_jobs=${MAX_PENDING_JOBS:-1000}
[[ $max_pending_age_seconds =~ ^[0-9]+$ ]] || { echo "MAX_PENDING_AGE_SECONDS must be a non-negative integer" >&2; exit 2; }
[[ $max_pending_jobs =~ ^[1-9][0-9]*$ ]] || { echo "MAX_PENDING_JOBS must be a positive integer" >&2; exit 2; }
response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT
http_status=$(curl --silent --show-error --max-time 10 --output "$response_file" --write-out '%{http_code}' "$health_url")
payload=$(<"$response_file")
echo "$payload" | jq -c '{status,pushDisabled,pushProviders,poll,queue}'
[[ $http_status == 200 ]]
jq -e \
  --arg require_push "$require_push" \
  --arg require_apns "$require_apns" \
  --arg require_fcm "$require_fcm" \
  --argjson max_pending_age_seconds "$max_pending_age_seconds" \
  --argjson max_pending_jobs "$max_pending_jobs" '
  .database == "ok" and
  .poll.initialized == true and
  .poll.stale == false and
  .poll.gapStatus == "normal" and
  (.poll.consecutiveFailures | tonumber) == 0 and
  (.queue.sending | tonumber) < 100 and
  (((.queue.queued | tonumber) + (.queue.retrying | tonumber) + (.queue.sending | tonumber)) <= $max_pending_jobs) and
  (.queue.oldestPendingAgeSeconds == null or (.queue.oldestPendingAgeSeconds | tonumber) <= $max_pending_age_seconds) and
  (.queue.recentPushFailures | tonumber) == 0 and
  ($require_push != "1" or .pushDisabled == false) and
  ($require_apns != "1" or .pushProviders.apns == true) and
  ($require_fcm != "1" or .pushProviders.fcm == true)
' <<<"$payload" >/dev/null
