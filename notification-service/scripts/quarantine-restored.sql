BEGIN IMMEDIATE;

UPDATE devices
SET active = 0,
    disabled_reason = 'restored_quarantine',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

UPDATE delivery_queue
SET status = 'permanent_failure',
    last_error_code = 'restore_quarantine',
    failure_kind = 'canceled',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status IN ('queued', 'retry', 'sending');

COMMIT;
