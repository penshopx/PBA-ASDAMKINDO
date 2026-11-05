import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

// Shadow only the alert tables; other integration fixtures still use public.
// Never truncate live development history or consume its manual-test cooldown.
export async function createAlertTestSchema() {
  const schema = `alert_test_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`
      CREATE TABLE "${schema}".operational_alert_deliveries
        (LIKE public.operational_alert_deliveries INCLUDING ALL);
      CREATE TABLE "${schema}".operational_alert_cooldowns
        (LIKE public.operational_alert_cooldowns INCLUDING ALL);
      CREATE TABLE "${schema}".alert_responses
        (LIKE public.alert_responses INCLUDING ALL)`);
    // Set startup options before any concurrent work creates more connections.
    // Unlike a connect-event query, this finishes before a client is handed out.
    pool.options.options = `${pool.options.options ?? ""} -c search_path=${schema},public`.trim();
    await client.query(`SET search_path TO "${schema}", public`);
  } finally {
    client.release();
  }
  return {
    schema,
    async reset() {
      await pool.query(`TRUNCATE "${schema}".operational_alert_deliveries,
        "${schema}".operational_alert_cooldowns, "${schema}".alert_responses`);
    },
    async cleanup() {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    },
  };
}
