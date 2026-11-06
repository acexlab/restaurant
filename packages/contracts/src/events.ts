/**
 * Standard event contracts (spec section 7.4).
 * Every module publishes and consumes events only through these names and the envelope below.
 */
export const EVENT_NAMES = [
  'token.created',
  'token.called',
  'token.completed',
  'reservation.created',
  'reservation.confirmed',
  'reservation.cancelled',
  'order.created',
  'order.confirmed',
  'order.updated',
  'order.cancelled',
  'order.completed',
  'kitchen.ticket.created',
  'kitchen.ticket.accepted',
  'kitchen.item.preparing',
  'kitchen.order.ready',
  'payment.completed',
  'payment.failed',
  'payment.refunded',
  'inventory.stock.low',
  'employee.checked_in',
  'employee.checked_out',
  // Platform lifecycle events
  'tenant.created',
  'module.activated',
  'module.status_changed',
  'module.features_changed',
  'integration.enabled',
  'integration.disabled',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(value: string): value is EventName {
  return (EVENT_NAMES as readonly string[]).includes(value);
}

/** Envelope carried by every event (spec 7.4). */
export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventName: EventName;
  schemaVersion: number;
  tenantId: string;
  branchId: string | null;
  sourceModule: string;
  entityId: string;
  occurredAt: string; // ISO-8601
  correlationId: string;
  payload: TPayload;
}
