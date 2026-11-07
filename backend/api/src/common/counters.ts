import type { Tx } from '../prisma/prisma.service';

/**
 * Next value of a per-tenant sequence that restarts whenever `period` changes
 * (a day for order numbers, a financial-year start for invoice numbers).
 * The upsert takes a row lock, so concurrent callers never get the same number.
 */
export async function nextNumber(tx: Tx, tenantId: string, key: string, period: string): Promise<number> {
  const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO counters ("tenantId", key, period, value)
    VALUES (${tenantId}::uuid, ${key}, ${period}::date, 1)
    ON CONFLICT ("tenantId", key) DO UPDATE
      SET value = CASE WHEN counters.period = EXCLUDED.period THEN counters.value + 1 ELSE 1 END,
          period = EXCLUDED.period
    RETURNING value`;
  return value;
}

/** Indian financial year (April–March) for a YYYY-MM-DD date, e.g. "2026-27" and its start date. */
export function financialYear(date: string) {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, start: `${start}-04-01` };
}
