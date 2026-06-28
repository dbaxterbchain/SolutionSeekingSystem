export interface NavLink {
  label: string;
  href: string;
}

export const navLinks: NavLink[] = [
  { label: 'The System', href: '/system' },
  { label: 'Protocol', href: '/protocol' },
  { label: 'Principles', href: '/principles' },
  { label: 'Leadership Tools', href: '/tools' },
  { label: 'Practice', href: '/practice' },
  { label: 'About', href: '/about' },
];
