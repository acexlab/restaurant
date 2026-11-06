import type { EventName } from './events';

/** Spec 6.1 — every product module is declared here and seeded into the ProductModule table. */
export type ModuleCategory =
  | 'customer_experience'
  | 'service_operations'
  | 'kitchen'
  | 'finance'
  | 'business_operations'
  | 'growth'
  | 'platform';

export interface ModuleFeatureDefinition {
  key: string;
  name: string;
  defaultEnabled: boolean;
}

export interface ModuleDefinition {
  moduleId: string;
  name: string;
  description: string;
  version: string;
  category: ModuleCategory;
  /** Hard dependencies. Kept empty wherever possible: modules must work standalone (principle 1). */
  dependencies: string[];
  /** Modules or core services this module can optionally connect to. */
  integrations: string[];
  features: ModuleFeatureDefinition[];
  publishes: EventName[];
  consumes: EventName[];
  defaultPermissions: string[];
  defaultConfiguration: Record<string, unknown>;
  availability: 'available' | 'beta' | 'planned';
}

const f = (key: string, name: string, defaultEnabled = true): ModuleFeatureDefinition => ({
  key,
  name,
  defaultEnabled,
});

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    moduleId: 'digital_token',
    name: 'Digital Token Management',
    description: 'Walk-in queues, token calling, waiting-time estimates and queue displays.',
    version: '1.0.0',
    category: 'customer_experience',
    dependencies: [],
    integrations: ['notification_service', 'customer_identity', 'reservations', 'table_management'],
    features: [
      f('walk_in_tokens', 'Walk-in tokens'),
      f('remote_queue_joining', 'Remote queue joining', false),
      f('priority_queue', 'Priority queue', false),
      f('queue_display', 'TV queue display'),
      f('estimated_waiting_time', 'Estimated waiting time'),
      f('sms_notifications', 'SMS notifications', false),
    ],
    publishes: ['token.created', 'token.called', 'token.completed'],
    consumes: ['reservation.confirmed'],
    defaultPermissions: ['tokens.view', 'tokens.manage'],
    defaultConfiguration: { averageServiceMinutes: 15 },
    availability: 'available',
  },
  {
    moduleId: 'reservations',
    name: 'Reservation Management',
    description: 'Reservation calendar, time slots, deposits, reminders and no-show handling.',
    version: '0.1.0',
    category: 'customer_experience',
    dependencies: [],
    integrations: ['table_management', 'digital_token', 'crm', 'payments'],
    features: [f('deposits', 'Deposits', false), f('reminders', 'Reminders'), f('no_show_tracking', 'No-show tracking')],
    publishes: ['reservation.created', 'reservation.confirmed', 'reservation.cancelled'],
    consumes: [],
    defaultPermissions: ['reservations.view', 'reservations.manage'],
    defaultConfiguration: { slotMinutes: 30 },
    availability: 'planned',
  },
  {
    moduleId: 'qr_menu',
    name: 'QR Menu',
    description: 'Branded digital menu with table QR codes, variants, add-ons and multilingual content.',
    version: '0.1.0',
    category: 'customer_experience',
    dependencies: [],
    integrations: ['online_ordering', 'crm', 'customer_identity'],
    features: [f('table_qr', 'Table QR codes'), f('multilingual_menu', 'Malayalam + English menu'), f('item_images', 'Item images')],
    publishes: [],
    consumes: [],
    defaultPermissions: ['menu.view', 'menu.modify'],
    defaultConfiguration: { languages: ['en', 'ml'] },
    availability: 'beta',
  },
  {
    moduleId: 'online_ordering',
    name: 'Online Ordering',
    description: 'Cart, dine-in, takeaway and delivery ordering with live order tracking.',
    version: '0.1.0',
    category: 'customer_experience',
    dependencies: [],
    integrations: ['qr_menu', 'kitchen_display', 'waiter_management', 'pos_billing', 'delivery'],
    features: [f('dine_in', 'Dine-in'), f('takeaway', 'Takeaway'), f('delivery', 'Delivery', false)],
    publishes: ['order.created', 'order.confirmed', 'order.updated', 'order.cancelled', 'order.completed'],
    consumes: ['kitchen.order.ready', 'payment.completed'],
    defaultPermissions: ['orders.view', 'orders.create', 'orders.modify', 'orders.cancel'],
    defaultConfiguration: {},
    availability: 'beta',
  },
  {
    moduleId: 'crm',
    name: 'Customer CRM & Loyalty',
    description: 'Customer profiles, purchase history, rewards, memberships and feedback.',
    version: '0.1.0',
    category: 'growth',
    dependencies: [],
    integrations: ['online_ordering', 'pos_billing', 'marketing'],
    features: [f('loyalty_points', 'Loyalty points'), f('feedback', 'Feedback'), f('referrals', 'Referrals', false)],
    publishes: [],
    consumes: ['order.completed', 'payment.completed'],
    defaultPermissions: ['customers.view', 'customers.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'marketing',
    name: 'Marketing',
    description: 'Campaigns, segments and consent-aware SMS, email and WhatsApp messaging.',
    version: '0.1.0',
    category: 'growth',
    dependencies: [],
    integrations: ['crm', 'notification_service'],
    features: [f('sms_campaigns', 'SMS campaigns', false), f('whatsapp_campaigns', 'WhatsApp campaigns', false), f('email_campaigns', 'Email campaigns')],
    publishes: [],
    consumes: [],
    defaultPermissions: ['marketing.view', 'marketing.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'kitchen_display',
    name: 'Kitchen Display',
    description: 'Station-based kitchen tickets, preparation timers and ready status.',
    version: '0.1.0',
    category: 'kitchen',
    dependencies: [],
    integrations: ['online_ordering', 'waiter_management', 'pos_billing'],
    features: [f('manual_tickets', 'Manual tickets'), f('station_routing', 'Station routing'), f('audio_alerts', 'Audio alerts', false)],
    publishes: ['kitchen.ticket.created', 'kitchen.ticket.accepted', 'kitchen.item.preparing', 'kitchen.order.ready'],
    consumes: ['order.created', 'order.cancelled'],
    defaultPermissions: ['kitchen.view', 'kitchen.manage'],
    defaultConfiguration: {},
    availability: 'beta',
  },
  {
    moduleId: 'waiter_management',
    name: 'Waiter Management',
    description: 'Table assignment, manual orders, service requests and ready notifications.',
    version: '0.1.0',
    category: 'service_operations',
    dependencies: [],
    integrations: ['table_management', 'online_ordering', 'kitchen_display', 'pos_billing'],
    features: [f('service_requests', 'Service requests'), f('table_transfers', 'Table transfers')],
    publishes: [],
    consumes: ['order.created', 'kitchen.order.ready'],
    defaultPermissions: ['waiter.view', 'waiter.manage'],
    defaultConfiguration: {},
    availability: 'beta',
  },
  {
    moduleId: 'pos_billing',
    name: 'POS & Billing',
    description: 'Order entry, GST billing, discounts, split payments, refunds and closing reports.',
    version: '0.1.0',
    category: 'finance',
    dependencies: [],
    integrations: ['online_ordering', 'inventory', 'finance', 'analytics'],
    features: [f('split_payments', 'Split payments'), f('upi_payments', 'UPI payments'), f('refunds', 'Refunds')],
    publishes: ['payment.completed', 'payment.failed', 'payment.refunded'],
    consumes: ['order.created', 'order.cancelled'],
    defaultPermissions: ['pos.view', 'pos.operate', 'payments.refund'],
    defaultConfiguration: { currency: 'INR' },
    availability: 'beta',
  },
  {
    moduleId: 'table_management',
    name: 'Table Management',
    description: 'Floor plans, capacity, occupancy, merges and transfers.',
    version: '0.1.0',
    category: 'service_operations',
    dependencies: [],
    integrations: ['reservations', 'waiter_management', 'online_ordering'],
    features: [f('floor_plan', 'Floor plan'), f('table_merge', 'Merge tables')],
    publishes: [],
    consumes: ['reservation.confirmed'],
    defaultPermissions: ['tables.view', 'tables.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'inventory',
    name: 'Inventory',
    description: 'Ingredients, stock movements, recipes, wastage and expiry.',
    version: '0.1.0',
    category: 'business_operations',
    dependencies: [],
    integrations: ['qr_menu', 'kitchen_display', 'pos_billing', 'procurement', 'finance'],
    features: [f('recipe_deduction', 'Recipe-based deduction', false), f('expiry_tracking', 'Expiry tracking')],
    publishes: ['inventory.stock.low'],
    consumes: ['payment.completed'],
    defaultPermissions: ['inventory.view', 'inventory.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'procurement',
    name: 'Procurement',
    description: 'Suppliers, purchase orders and goods received.',
    version: '0.1.0',
    category: 'business_operations',
    dependencies: [],
    integrations: ['inventory', 'finance'],
    features: [f('purchase_orders', 'Purchase orders')],
    publishes: [],
    consumes: ['inventory.stock.low'],
    defaultPermissions: ['procurement.view', 'procurement.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'staff',
    name: 'Staff Management',
    description: 'Attendance, shifts, leave and activity logs.',
    version: '0.1.0',
    category: 'business_operations',
    dependencies: [],
    integrations: ['waiter_management', 'kitchen_display', 'pos_billing', 'finance'],
    features: [f('attendance', 'Attendance'), f('shift_scheduling', 'Shift scheduling')],
    publishes: ['employee.checked_in', 'employee.checked_out'],
    consumes: [],
    defaultPermissions: ['staff.attendance.view', 'staff.attendance.modify'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'finance',
    name: 'Financial Management',
    description: 'Expenses, costing and profit estimates.',
    version: '0.1.0',
    category: 'finance',
    dependencies: [],
    integrations: ['pos_billing', 'inventory', 'procurement', 'staff'],
    features: [f('expenses', 'Expenses')],
    publishes: [],
    consumes: ['payment.completed', 'payment.refunded'],
    defaultPermissions: ['finance.view', 'finance.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'analytics',
    name: 'Analytics',
    description: 'Revenue, best sellers, sales trends and branch comparisons.',
    version: '0.1.0',
    category: 'finance',
    dependencies: [],
    integrations: ['pos_billing', 'inventory', 'procurement', 'staff', 'crm'],
    features: [f('sales_reports', 'Sales reports')],
    publishes: [],
    consumes: ['order.completed', 'payment.completed'],
    defaultPermissions: ['analytics.view'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'multi_branch',
    name: 'Multi-Branch Management',
    description: 'Branch configuration, central menu, branch pricing and consolidated reports.',
    version: '0.1.0',
    category: 'platform',
    dependencies: [],
    integrations: [],
    features: [f('branch_pricing', 'Branch pricing'), f('central_menu', 'Central menu')],
    publishes: [],
    consumes: [],
    defaultPermissions: ['branches.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
  {
    moduleId: 'delivery',
    name: 'Delivery Management',
    description: 'Delivery dispatch and tracking.',
    version: '0.1.0',
    category: 'service_operations',
    dependencies: [],
    integrations: ['online_ordering'],
    features: [f('rider_tracking', 'Rider tracking', false)],
    publishes: [],
    consumes: ['order.confirmed'],
    defaultPermissions: ['delivery.view', 'delivery.manage'],
    defaultConfiguration: {},
    availability: 'planned',
  },
];

export function findModule(moduleId: string): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((m) => m.moduleId === moduleId);
}

/** Spec 6.2 lifecycle. */
export const MODULE_STATUSES = [
  'AVAILABLE',
  'PURCHASED',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATION_PENDING',
  'INACTIVE',
  'UNINSTALLED',
] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

/** Allowed lifecycle transitions. Deactivation never deletes data. */
export const MODULE_TRANSITIONS: Record<ModuleStatus, ModuleStatus[]> = {
  AVAILABLE: ['PURCHASED'],
  PURCHASED: ['PROVISIONING', 'ACTIVE'],
  PROVISIONING: ['ACTIVE'],
  ACTIVE: ['SUSPENDED', 'DEACTIVATION_PENDING', 'INACTIVE'],
  SUSPENDED: ['ACTIVE', 'INACTIVE'],
  DEACTIVATION_PENDING: ['INACTIVE', 'ACTIVE'],
  INACTIVE: ['ACTIVE', 'UNINSTALLED'],
  UNINSTALLED: ['PURCHASED'],
};
