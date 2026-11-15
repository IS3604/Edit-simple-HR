import type { Role } from '@/lib/types';

export type NavItem = { href: string; label: string; roles: Role[] };

const ALL: Role[] = ['superadmin', 'admin', 'employee'];
const STAFF: Role[] = ['superadmin', 'admin'];

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: ALL },
  { href: '/leave', label: 'My leave', roles: ALL },
  { href: '/requests', label: 'Requests', roles: STAFF },
  { href: '/employees', label: 'Employees', roles: STAFF },
  { href: '/balances', label: 'Leave balances', roles: STAFF },
  { href: '/grants', label: 'Special grants', roles: ['superadmin'] },
  { href: '/holidays', label: 'Holidays', roles: ALL },
  { href: '/users', label: 'Users & roles', roles: ['superadmin'] },
  { href: '/account', label: 'My account', roles: ALL },
];
