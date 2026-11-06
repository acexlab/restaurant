import { MODULE_CATALOG } from './modules';

/** Core platform permissions (spec 11.2). Module permissions come from the module catalogue. */
export const CORE_PERMISSIONS = [
  'tenant.view',
  'tenant.manage',
  'branches.view',
  'branches.manage',
  'employees.view',
  'employees.manage',
  'roles.manage',
  'modules.view',
  'modules.manage',
  'integrations.view',
  'integrations.configure',
  'subscriptions.manage',
  'audit.view',
] as const;

export const ALL_PERMISSIONS: string[] = Array.from(
  new Set<string>([...CORE_PERMISSIONS, ...MODULE_CATALOG.flatMap((m) => m.defaultPermissions)]),
).sort();

/** Wildcard granted to the Owner role. */
export const ALL = '*';

export interface DefaultRoleDefinition {
  key: string;
  name: string;
  permissions: string[];
}

/** Default role templates copied into every new tenant (spec 4.3). Tenants can add custom roles. */
export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
  { key: 'owner', name: 'Owner', permissions: [ALL] },
  {
    key: 'administrator',
    name: 'Administrator',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'subscriptions.manage'),
  },
  {
    key: 'general_manager',
    name: 'General Manager',
    permissions: ['tenant.view', 'branches.view', 'employees.view', 'modules.view', 'integrations.view', 'audit.view',
      'orders.view', 'orders.modify', 'orders.cancel', 'menu.view', 'menu.modify', 'tokens.view', 'tokens.manage',
      'kitchen.view', 'pos.view', 'analytics.view'],
  },
  {
    key: 'branch_manager',
    name: 'Branch Manager',
    permissions: ['branches.view', 'employees.view', 'modules.view', 'orders.view', 'orders.modify', 'orders.cancel',
      'tokens.view', 'tokens.manage', 'kitchen.view', 'pos.view', 'staff.attendance.view'],
  },
  { key: 'receptionist', name: 'Receptionist', permissions: ['tokens.view', 'tokens.manage', 'reservations.view', 'reservations.manage', 'tables.view'] },
  { key: 'cashier', name: 'Cashier', permissions: ['orders.view', 'pos.view', 'pos.operate'] },
  { key: 'chef', name: 'Chef', permissions: ['kitchen.view', 'kitchen.manage'] },
  { key: 'kitchen_supervisor', name: 'Kitchen Supervisor', permissions: ['kitchen.view', 'kitchen.manage', 'inventory.view'] },
  { key: 'waiter', name: 'Waiter', permissions: ['orders.view', 'orders.create', 'waiter.view', 'waiter.manage', 'tables.view'] },
  { key: 'storekeeper', name: 'Storekeeper', permissions: ['inventory.view', 'inventory.manage', 'procurement.view'] },
  { key: 'accountant', name: 'Accountant', permissions: ['finance.view', 'finance.manage', 'analytics.view', 'pos.view'] },
  { key: 'marketing_manager', name: 'Marketing Manager', permissions: ['customers.view', 'marketing.view', 'marketing.manage'] },
];

export function hasPermission(granted: Iterable<string>, required: string): boolean {
  for (const p of granted) {
    if (p === ALL || p === required) return true;
  }
  return false;
}
