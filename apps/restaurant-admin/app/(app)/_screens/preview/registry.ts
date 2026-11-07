import type { ComponentType } from 'react';
import { Branches, Automation, Delivery, Domain, Franchise, Insights, Marketplace } from './phase45';
import { Customers, Feedback, FloorPlan, Loyalty, Marketing, Reservations } from './phase2';
import { Analytics, Expenses, Finance, Inventory, Procurement, Staff } from './phase3';

/** Prototype screens for phases not built yet, shown under /preview/<key>. */
export const PREVIEWS: { key: string; label: string; phase: number; Screen: ComponentType }[] = [
  { key: 'reservations', label: 'Reservations', phase: 2, Screen: Reservations },
  { key: 'floor', label: 'Floor plan', phase: 2, Screen: FloorPlan },
  { key: 'customers', label: 'Customers', phase: 2, Screen: Customers },
  { key: 'loyalty', label: 'Loyalty', phase: 2, Screen: Loyalty },
  { key: 'marketing', label: 'Marketing', phase: 2, Screen: Marketing },
  { key: 'feedback', label: 'Feedback', phase: 2, Screen: Feedback },
  { key: 'staff', label: 'Staff', phase: 3, Screen: Staff },
  { key: 'inventory', label: 'Inventory', phase: 3, Screen: Inventory },
  { key: 'procurement', label: 'Procurement', phase: 3, Screen: Procurement },
  { key: 'expenses', label: 'Expenses', phase: 3, Screen: Expenses },
  { key: 'finance', label: 'Finance', phase: 3, Screen: Finance },
  { key: 'analytics', label: 'Analytics', phase: 3, Screen: Analytics },
  { key: 'branches', label: 'Multi-branch', phase: 4, Screen: Branches },
  { key: 'marketplace', label: 'Marketplace', phase: 4, Screen: Marketplace },
  { key: 'domain', label: 'Custom domain', phase: 4, Screen: Domain },
  { key: 'delivery', label: 'Delivery', phase: 5, Screen: Delivery },
  { key: 'insights', label: 'AI insights', phase: 5, Screen: Insights },
  { key: 'automation', label: 'Automation', phase: 5, Screen: Automation },
  { key: 'franchise', label: 'Franchise', phase: 5, Screen: Franchise },
];
