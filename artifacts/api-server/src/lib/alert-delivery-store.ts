import { pool } from "@workspace/db";
import type { AlertDeliveryRecord } from "./alert-delivery";

export interface AlertCooldown {
  key: string;
  durationMs: number;
}

// The reservation and initial history row commit together. PostgreSQL's clock
// and conditional UPSERT serialize contenders across processes and restarts.
export async function reserveDelivery(
  record: AlertDeliveryRecord,
  owner: string,
  cooldown?: AlertCooldown,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (cooldown) {
      const reserved = await client.query(`
        INSERT INTO operational_alert_cooldowns (key, reserved_at)
        VALUES ($1, clock_timestamp())
        ON CONFLICT (key) DO UPDATE SET reserved_at = clock_timestamp()
        WHERE operational_alert_cooldowns.reserved_at
          <= clock_timestamp() - ($2 * interval '1 millisecond')
        RETURNING key`, [cooldown.key, cooldown.durationMs]);
      if (!reserved.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
    }
    const inserted = await client.query(`
      INSERT INTO operational_alert_deliveries
        (deduplication_key, alert_name, status, error, owner, lease_until)
      VALUES ($1, $2, $3, $4, $5, clock_timestamp() + interval '30 seconds')
      ON CONFLICT (deduplication_key) DO NOTHING
      RETURNING deduplication_key`,
    [record.deduplicationKey, record.alertName, record.status, record.error, owner]);
    // Do not consume a cooldown when the alert already exists.
    await client.query(inserted.rowCount ? "COMMIT" : "ROLLBACK");
    return Boolean(inserted.rowCount);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDelivery(
  record: AlertDeliveryRecord,
  owner: string,
  leaseMs = 30_000,
): Promise<boolean> {
  const result = await pool.query(`
    UPDATE operational_alert_deliveries
    SET status = $3, attempts = $4, last_attempt_at = $5,
        delivered_at = $6, error = $7,
        lease_until = clock_timestamp() + ($8 * interval '1 millisecond')
    WHERE deduplication_key = $1 AND owner = $2 AND status = 'pending'
      AND lease_until > clock_timestamp()
    RETURNING deduplication_key`,
  [record.deduplicationKey, owner, record.status, record.attempts,
    record.lastAttemptAt, record.deliveredAt, record.error, leaseMs]);
  return Boolean(result.rowCount);
}

const recordColumns = `
  deduplication_key AS "deduplicationKey", alert_name AS "alertName",
  status, attempts,
  to_char(last_attempt_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastAttemptAt",
  to_char(delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "deliveredAt",
  error`;

export async function readDelivery(key: string): Promise<AlertDeliveryRecord> {
  const result = await pool.query<AlertDeliveryRecord>(`
    SELECT ${recordColumns} FROM operational_alert_deliveries WHERE deduplication_key = $1`, [key]);
  if (!result.rows[0]) throw new Error("Reserved alert delivery is missing");
  return result.rows[0];
}

export async function readDeliveryHistory(): Promise<AlertDeliveryRecord[]> {
  // Never silently leave a killed process's attempt pending forever. Its result
  // is ambiguous, so do not automatically retry and risk a second notification.
  await pool.query(`
    UPDATE operational_alert_deliveries
    SET status = 'failed', error = 'delivery_interrupted'
    WHERE status = 'pending' AND lease_until <= clock_timestamp()`);
  const result = await pool.query<AlertDeliveryRecord>(`
    SELECT ${recordColumns} FROM operational_alert_deliveries
    ORDER BY created_at DESC, deduplication_key DESC LIMIT 100`);
  return result.rows;
}
