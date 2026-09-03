export type RecoveryCheckDefinition = {
  name: string;
  severity: "critical" | "warning";
  sql: string;
};

export const recoveryChecks: RecoveryCheckDefinition[] = [
  {
    name: "matching company differs from requirement owner",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations FROM matchings m JOIN company_requirements r ON r.id = m.requirement_id WHERE m.company_user_id IS DISTINCT FROM r.company_user_id`,
  },
  {
    name: "program transactions without enrollments",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations FROM transactions t LEFT JOIN enrollments e ON e.id = t.reference_id WHERE t.kind = 'program' AND e.id IS NULL`,
  },
  {
    name: "invalid transaction amounts",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations FROM transactions WHERE amount < 0 OR fee_amount < 0 OR commission < 0 OR refund_amount < 0`,
  },
  {
    name: "inconsistent passport consent timestamps",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations FROM passport_consents WHERE (status = 'granted' AND granted_at IS NULL) OR (status = 'revoked' AND revoked_at IS NULL AND granted_at IS NOT NULL) OR (granted_at IS NOT NULL AND revoked_at IS NOT NULL AND revoked_at < granted_at)`,
  },
  {
    name: "inconsistent company consent timestamps",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations FROM company_talent_consents WHERE (status = 'granted' AND (granted_at IS NULL OR expires_at IS NULL)) OR (expires_at IS NOT NULL AND granted_at IS NOT NULL AND expires_at <= granted_at) OR (revoked_at IS NOT NULL AND granted_at IS NOT NULL AND revoked_at < granted_at)`,
  },
  {
    name: "verification subjects missing or unsupported",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations
      FROM verifications v
      WHERE (v.subject_type = 'competency' AND NOT EXISTS (SELECT 1 FROM member_evidence e WHERE e.id = v.subject_id))
         OR (v.subject_type = 'profile' AND NOT EXISTS (SELECT 1 FROM member_profiles p WHERE p.id = v.subject_id))
         OR (v.subject_type = 'document' AND (
           btrim(v.subject_id) = '' OR btrim(v.subject_name) = '' OR btrim(v.evidence_type) = ''
         ))
         OR v.subject_type NOT IN ('competency', 'profile', 'document')`,
  },
  {
    name: "mapped audit entities without source records",
    severity: "critical",
    sql: `SELECT count(*)::int AS violations
      FROM audit_logs a
      WHERE (a.entity_type = 'enrollment' AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.id = a.entity_id))
         OR (a.entity_type IN ('matching', 'matching_review') AND NOT EXISTS (SELECT 1 FROM matchings m WHERE m.id = a.entity_id))
         OR (a.entity_type IN ('transaction', 'transaction_reconciliation') AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = a.entity_id))
         OR (a.entity_type = 'program' AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.id = a.entity_id))
         OR (a.entity_type = 'company_requirement' AND NOT EXISTS (SELECT 1 FROM company_requirements r WHERE r.id = a.entity_id))
         OR (a.entity_type = 'company_talent_consent' AND NOT EXISTS (SELECT 1 FROM company_talent_consents c WHERE c.id = a.entity_id))
         OR (a.entity_type = 'settlement_ingest_failure' AND NOT EXISTS (SELECT 1 FROM settlement_ingest_failures s WHERE s.id = a.entity_id))
         OR (a.entity_type = 'notification' AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.id = a.entity_id))
         OR (a.entity_type = 'competency' AND NOT EXISTS (SELECT 1 FROM member_evidence e WHERE e.id = a.entity_id))
         OR (a.entity_type = 'profile' AND NOT EXISTS (SELECT 1 FROM member_profiles p WHERE p.id = a.entity_id))
         OR (a.entity_type = 'document' AND NOT EXISTS (
           SELECT 1 FROM verifications v WHERE v.subject_type = 'document' AND v.subject_id = a.entity_id
         ))
         OR a.entity_type NOT IN (
           'enrollment', 'matching', 'matching_review', 'transaction', 'transaction_reconciliation',
           'program', 'company_requirement', 'company_talent_consent', 'settlement_ingest_failure',
           'notification', 'competency', 'profile', 'document', 'pilot_run', 'pilot_feedback'
         )`,
  },
];