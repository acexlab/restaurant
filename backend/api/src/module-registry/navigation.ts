/** Restaurant Admin navigation (spec 4.2). Items with a moduleId appear only when that module is active. */
export interface NavItem {
  key: string;
  label: string;
  path: string;
  /** Shown when any of these modules is active (shared services like Menu serve several products). */
  moduleId?: string | string[];
  permission?: string;
}

const ORDER_TAKING = ['online_ordering', 'waiter_management', 'pos_billing'];

export const NAVIGATION: NavItem[] = [
  { key: 'overview', label: 'Overview', path: '/' },
  { key: 'modules', label: 'Product Modules', path: '/modules', permission: 'modules.view' },
  { key: 'integrations', label: 'Integration Centre', path: '/integrations', permission: 'integrations.view' },
  { key: 'orders', label: 'Orders', path: '/orders', moduleId: ORDER_TAKING, permission: 'orders.view' },
  { key: 'menu', label: 'Menu Management', path: '/menu', moduleId: ['qr_menu', ...ORDER_TAKING], permission: 'menu.view' },
  { key: 'tokens', label: 'Token Management', path: '/tokens', moduleId: 'digital_token', permission: 'tokens.view' },
  { key: 'reservations', label: 'Reservations', path: '/reservations', moduleId: 'reservations', permission: 'reservations.view' },
  { key: 'tables', label: 'Tables & QR', path: '/tables', moduleId: ['table_management', 'qr_menu', 'online_ordering', 'waiter_management'], permission: 'tables.view' },
  { key: 'kitchen', label: 'Kitchen', path: '/kitchen', moduleId: 'kitchen_display', permission: 'kitchen.view' },
  { key: 'waiters', label: 'Waiter Management', path: '/waiters', moduleId: 'waiter_management', permission: 'waiter.view' },
  { key: 'pos', label: 'POS', path: '/pos', moduleId: 'pos_billing', permission: 'pos.view' },
  { key: 'customers', label: 'Customers', path: '/customers', moduleId: 'crm', permission: 'customers.view' },
  { key: 'marketing', label: 'Marketing', path: '/marketing', moduleId: 'marketing', permission: 'marketing.view' },
  { key: 'inventory', label: 'Inventory', path: '/inventory', moduleId: 'inventory', permission: 'inventory.view' },
  { key: 'procurement', label: 'Procurement', path: '/procurement', moduleId: 'procurement', permission: 'procurement.view' },
  { key: 'staff', label: 'Staff', path: '/staff', moduleId: 'staff', permission: 'staff.attendance.view' },
  { key: 'expenses', label: 'Expenses', path: '/expenses', moduleId: 'finance', permission: 'finance.view' },
  { key: 'analytics', label: 'Analytics', path: '/analytics', moduleId: 'analytics', permission: 'analytics.view' },
  { key: 'branches', label: 'Branches', path: '/branches', permission: 'branches.view' },
  { key: 'team', label: 'Team', path: '/team', permission: 'employees.view' },
  { key: 'audit', label: 'Audit Log', path: '/audit', permission: 'audit.view' },
  { key: 'settings', label: 'Settings', path: '/settings', permission: 'tenant.manage' },
  { key: 'billing', label: 'Subscription and Billing', path: '/billing', permission: 'subscriptions.manage' },
];
