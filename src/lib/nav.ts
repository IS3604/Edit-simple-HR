import type { Role } from '@/lib/types';

export type NavIcon =
  | 'dashboard' | 'leave' | 'requests' | 'calendar' | 'employees' | 'balances' | 'grants' | 'holidays' | 'users' | 'account';
export type NavItem = { href: string; label: string; icon: NavIcon; roles: Role[] };
export type NavGroup = { label?: string; items: NavItem[] };

const STAFF: Role[] = ['superadmin', 'admin'];
const ALL: Role[] = ['superadmin', 'admin', 'employee'];

export const NAV: NavGroup[] = [
  {
    items: [
      { href: '/', label: 'Dashboard', icon: 'dashboard', roles: ALL },
      { href: '/leave', label: 'My leave', icon: 'leave', roles: ['employee'] },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/requests', label: 'Requests', icon: 'requests', roles: STAFF },
      { href: '/employees', label: 'Employees', icon: 'employees', roles: STAFF },
      { href: '/balances', label: 'Leave balances', icon: 'balances', roles: STAFF },
      { href: '/grants', label: 'Special grants', icon: 'grants', roles: ['superadmin'] },
    ],
  },
  {
    label: 'Company',
    items: [
      { href: '/calendar', label: 'Team calendar', icon: 'calendar', roles: ALL },
      { href: '/holidays', label: 'Holidays', icon: 'holidays', roles: ALL },
      { href: '/users', label: 'Users & roles', icon: 'users', roles: ['superadmin'] },
    ],
  },
];

export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
}
