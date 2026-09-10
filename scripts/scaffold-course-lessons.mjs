/**
 * Writes a draft lesson file for every video in the course plan that does not
 * exist yet. Never overwrites: rerunning it is safe. Titles, modules and
 * planned minutes come from "Solution Seeking Course and Video Plan v1.0".
 *
 *   node scripts/scaffold-course-lessons.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const LESSONS = [
  ['v01', 'm01', 'See what a different conversation can produce', 6],
  ['v02', 'm01', 'How the full Solution Seeking System fits together', 8],
  ['v03', 'm01', 'Set up your practice', 5],
  ['v04', 'm02', 'Introspection: understand your own experience', 8],
  ['v05', 'm02', 'Critical Thinking: examine the story you are telling', 5],
  ['v06', 'm02', 'Forgiveness: make room to understand', 5],
  ['v07', 'm02', 'Humility (and Understanding Pride)', 5],
  ['v08', 'm02', 'Compassion and Empathy', 5],
  ['v09', 'm02', 'Turn reflection into conversation preparation', 7],
  ['v10', 'm02', 'Watch an introspection from start to finish', 8],
  ['v11', 'm03', 'Prepare and open a Mutual Understanding conversation', 6],
  ['v12', 'm03', 'Understanding: check the picture you have built', 5],
  ['v13', 'm03', 'Good Faith', 5],
  ['v14', 'm03', 'Bravery', 4],
  ['v15', 'm03', 'Vulnerability', 5],
  ['v16', 'm03', 'Patience', 4],
  ['v17', 'm03', 'Share clearly and listen carefully', 8],
  ['v18', 'm03', 'Ask questions that make room for an answer', 6],
  ['v19', 'm03', 'Recognize mutual understanding and choose the next step', 9],
  ['v20', 'm04', 'Restate the shared problem and explore options', 7],
  ['v21', 'm04', 'Fairness', 5],
  ['v22', 'm04', 'Integrity (Consistency)', 5],
  ['v23', 'm04', 'Flexibility', 5],
  ['v24', 'm04', 'Build a solution you can actually test', 8],
  ['v25', 'm04', 'Implement, follow up, and revise', 7],
  ['v26', 'm05', 'Recover when a conversation becomes tense', 6],
  ['v27', 'm05', 'When someone will not participate', 7],
  ['v28', 'm05', 'When the same problem comes back', 6],
  ['v29', 'm06', 'Choose a tool for the situation', 5],
  ['v30', 'm06', 'One-on-Ones', 8],
  ['v31', 'm06', 'Feedback', 7],
  ['v32', 'm06', 'Targeted Conversations', 9],
  ['v33', 'm06', 'Solution Seeking Sessions', 10],
  ['v34', 'm07', 'Turn a solution into a better shared system', 8],
  ['v35', 'm07', 'Adapt or build a Leadership Tool', 7],
  ['v36', 'm08', 'Complete case: a workplace misunderstanding', 12],
  ['v37', 'm08', 'Complete case: shared responsibilities at home', 10],
  ['v38', 'm08', 'Complete case: a community decision', 10],
  ['v39', 'm09', 'Complete your certification assessment', 8],
  ['v40', 'm09', 'Keep the system alive in everyday life', 5],
];

const dir = 'src/content/course/lessons';
mkdirSync(dir, { recursive: true });

LESSONS.forEach(([id, module, title, minutes], i) => {
  const file = `${dir}/${id}.md`;
  if (existsSync(file)) {
    console.log(`skip  ${file} (exists)`);
    return;
  }
  const next = LESSONS[i + 1]?.[0];
  const kind = id === 'v39' ? 'orientation' : id === 'v40' ? 'plan' : 'standard';
  const lines = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `module: ${module}`,
    `kind: ${kind}`,
    ...(next ? [`next: ${next}`] : []),
    `worksheet: w-${module}`,
    'streamUid: null',
    `durationMin: ${minutes}`,
    'status: draft',
    'contentVersion: 1',
    `preview: ${id === 'v05'}`,
    'videoPlaceholder: false',
    'approvals: {}',
    '---',
    '',
    '## Outcome',
    '',
    '## Key points',
    '',
    '## Exercise',
    '',
    '## Model response',
    '',
    '## Self-review',
    '',
    '## Transcript',
    '',
  ];
  writeFileSync(file, lines.join('\n'));
  console.log(`wrote ${file}`);
});
