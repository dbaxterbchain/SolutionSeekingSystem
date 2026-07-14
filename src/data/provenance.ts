/**
 * The honest trust signals: what is actually true, said plainly.
 *
 * Lives here rather than inline in a page because more than one page needs it now
 * (the home page and every mode landing page, which are where paid traffic lands).
 * Having ONE copy is the point: a trust claim that has drifted between two pages
 * is a trust claim we are no longer sure of.
 *
 * We have no user count and, until someone writes one, no testimonials. So we do
 * not imply either. See "Claims about users, and social proof" in
 * docs/change-checklist.md before touching a word of this.
 */

export interface ProvenanceItem {
  icon: string;
  title: string;
  body: string;
}

export const PROVENANCE: ProvenanceItem[] = [
  {
    icon: '☕',
    title: 'Built to run a real company',
    body: 'Beanchain Coffee is a worker-directed café with no HR department to escalate to. We wrote this system because we needed it, then used it on ourselves.',
  },
  {
    icon: '📖',
    title: 'The system is free, forever',
    body: 'Every page, the complete PDF, the worksheets, and all seven example conversations. You only pay if you want unlimited time with the AI assistants.',
  },
  {
    icon: '🎭',
    title: 'No invented praise',
    // Careful with this one. It used to say we would rather show the method than
    // quote a testimonial we made up, which read as "we have no testimonials" and
    // would sit directly beneath real ones. The promise is about fabrication, not
    // absence, so it stays true whether there are zero quotes on the page or six.
    body: 'Every example conversation on this site is labelled as a fictional demonstration, because it is. The only quotes we publish are real ones, in the words of the person who wrote them, used with their permission.',
  },
];

/** One line, for pages where the full band would be too much (the mode pages). */
export const PROVENANCE_LINE =
  'Built by David and Shannon Baxter at Beanchain Coffee, a worker-directed café, to run their own company.';
