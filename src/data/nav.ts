export interface NavLink {
  label: string;
  href: string;
}

/** A top-level nav entry that opens a dropdown instead of navigating. */
export interface NavGroup {
  label: string;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

export const isNavGroup = (item: NavItem): item is NavGroup => 'children' in item;

/**
 * Primary navigation. All four teaching sections live under a "Learn"
 * dropdown: six top-level items no longer fit beside the logo, auth menu, and
 * CTA between 1024px and 1280px, and the grouping reads better than a crowded
 * row (learn the system, then practice it).
 */
export const navItems: NavItem[] = [
  {
    label: 'Learn',
    children: [
      { label: 'The System', href: '/system' },
      { label: 'Protocol', href: '/protocol' },
      { label: 'Principles', href: '/principles' },
      { label: 'Leadership Tools', href: '/tools' },
    ],
  },
  { label: 'Practice', href: '/practice' },
  { label: 'About', href: '/about' },
];

/** Every nav destination, flattened (the footer lists them all). */
export const navLinks: NavLink[] = navItems.flatMap((item) =>
  isNavGroup(item) ? item.children : [item]
);
