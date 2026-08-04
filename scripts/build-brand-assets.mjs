/**
 * Builds the downloadable brand asset set in `public/brand/` from the original
 * artwork. Run by hand, and commit what it produces:
 *
 *   node scripts/build-brand-assets.mjs
 *
 * NOT part of `npm run build`. These are static artifacts that change only when
 * the logo does, so putting sharp in the critical path of every deploy would buy
 * nothing. This script exists so the derivation is reproducible and reviewable
 * rather than a folder of files somebody made once in an image editor.
 *
 * THE RULE: every asset is DERIVED from supplied artwork, never redrawn. Two
 * sources, because the original is two different things in one file:
 *
 *   images/Logo/SolutionSeekingLogo.svg — the master. Its chevrons get their
 *     soft gradient from four EMBEDDED RASTER MASKS, so the mark cannot be
 *     recoloured and does not survive being shrunk to favicon size. Its wordmark,
 *     though, is clean outlined vector: two groups holding "Solution" (8 paths)
 *     and "SEEKINGSYSTEM" (13 paths). Those are extracted here, exactly.
 *
 *   public/favicon.svg — three flat paths tracing the same mark geometry, with
 *     no masks. This is the only recolourable, infinitely scalable copy of the
 *     mark we have, and it is what every flat and single-colour variant below is
 *     built from.
 *
 * The LOGO's own wordmark is never re-typeset: it ships as the outlines it was
 * drawn as. The standalone typographic LOCKUPS are a different thing, and those
 * are now set in the brand faces rather than shipped as the original rasters.
 * See the note above buildLockups().
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import opentype from 'opentype.js';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public/brand');
const PUBLIC = join(ROOT, 'public');
const MASTER = join(ROOT, 'images/Logo/SolutionSeekingLogo.svg');
const FONTS = join(ROOT, 'src/assets/fonts');

/** Brand colours. Must match `tailwind.config.mjs`; see /design. */
const COLOR = {
  brand: '#5271FF', // brand-500, the front S
  brandBack: '#A3B2FF', // brand-300, the S behind it
  sky: '#3D9BF0', // sky-500, the SEEKING word
  ink: '#16276B',
  white: '#FFFFFF',
  black: '#000000',
};

const log = (...args) => console.log('  ', ...args);

// ── Geometry helpers ────────────────────────────────────────────────────────

/**
 * The tight ink bounds of an SVG, in its own user units.
 *
 * Rendered and measured rather than computed from path data: the artwork uses
 * clip paths and masks, so the only honest answer to "where does this actually
 * put pixels" comes from rendering it. Scanning alpha directly rather than using
 * sharp's trim() keeps the mapping back to user units explicit.
 */
async function inkBounds(svg, viewBoxSize) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 300 })
    .resize(viewBoxSize, viewBoxSize, { fit: 'contain', background: '#0000' })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      // Ignore near-transparent antialiasing so the box hugs real ink.
      if (data[(y * info.width + x) * info.channels + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('SVG rendered empty: nothing to measure');

  const scale = viewBoxSize / info.width;
  return {
    x: minX * scale,
    y: minY * scale,
    width: (maxX - minX + 1) * scale,
    height: (maxY - minY + 1) * scale,
  };
}

/** Wrap body markup in a standalone SVG cropped tightly to its ink. */
async function tightSvg(body, viewBoxSize, title) {
  const loose = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}">${body}</svg>`;
  const b = await inkBounds(loose, viewBoxSize);
  const round = (n) => Math.round(n * 100) / 100;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` viewBox="${round(b.x)} ${round(b.y)} ${round(b.width)} ${round(b.height)}"`,
    ` width="${Math.round(b.width)}" height="${Math.round(b.height)}"`,
    ` role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    body,
    `</svg>`,
  ].join('');
}

// ── Source extraction ───────────────────────────────────────────────────────

/**
 * The wordmark ("Solution" over "SEEKING SYSTEM") lifted out of the master as
 * vector, with the two clip rects it depends on.
 *
 * Located structurally rather than by index: both groups are the ones carrying a
 * translate transform and a fill, which is how the exporter emitted the type and
 * how it distinguishes them from the mark's clip/mask stack.
 */
function extractWordmark() {
  const svg = readFileSync(MASTER, 'utf8');

  const groups = [...svg.matchAll(/<g transform="matrix\(1, 0, 0, 1, (\d+), (\d+)\)">/g)]
    .map((m) => ({ index: m.index, x: Number(m[1]), y: Number(m[2]) }))
    // The type sits below the mark; the mark's own transforms are higher up the
    // canvas. Anything past the halfway line is wordmark.
    .filter((g) => g.y > 1000);

  if (groups.length !== 2) {
    throw new Error(
      `Expected 2 wordmark groups in the master SVG, found ${groups.length}. ` +
        'The artwork changed: re-check the structure before trusting this output.'
    );
  }

  // Take each group with its balanced closing tag.
  const bodies = groups.map(({ index }) => {
    let depth = 0;
    for (let i = index; i < svg.length; i++) {
      if (svg[i] !== '<') continue;
      const end = svg.indexOf('>', i);
      const isClose = svg[i + 1] === '/';
      const selfClose = svg[end - 1] === '/';
      if (!isClose && !selfClose) depth++;
      else if (isClose) {
        depth--;
        if (depth === 0) return svg.slice(index, end + 1);
      }
      i = end;
    }
    throw new Error('Unbalanced group in the master SVG');
  });

  // Carry over only the clip rects these groups reference (tiny), never the
  // <defs> block, which holds the mark's base64 mask images.
  const ids = [...bodies.join('').matchAll(/clip-path="url\(#([^)]+)\)"/g)].map((m) => m[1]);
  const clips = ids
    .map((id) => {
      const at = svg.indexOf(`id="${id}"`);
      const start = svg.lastIndexOf('<clipPath', at);
      return svg.slice(start, svg.indexOf('</clipPath>', at) + 11);
    })
    .join('');

  return `<defs>${clips}</defs>${bodies.join('')}`;
}

/**
 * The mark as a single flat colour, in the master's OWN geometry.
 *
 * The obvious source for this was `public/favicon.svg`, which already holds a
 * flat three-path version of the mark. It is not the same shape: rendered beside
 * the master at 512px its right-hand terminals are angular spikes where the
 * master's are generously rounded. It is a hand-simplification that reads fine at
 * 32px and misrepresents the logo at any size where you can see it, so it is not
 * what we hand to anyone.
 *
 * The master's real geometry is hiding in its `<defs>`: each chevron is a
 * clipPath whose path carries the rounded corners (four curve commands each).
 * Those four paths, filled in one colour, ARE the mark's exact silhouette.
 *
 * What a single colour cannot reproduce is the LAYERING. In the master, the
 * chevrons overlap and are told apart purely by opacity gradients baked into
 * raster masks. Flatten that and they fuse into one solid form. That is inherent
 * to going single-colour, not a defect here, which is why the guide keeps the
 * gradient master as the primary mark and scopes this variant to small sizes,
 * one-colour print, and knockouts.
 */
function markStrokes() {
  const svg = readFileSync(MASTER, 'utf8');

  // A chevron is a clipPath whose path has curves; the rest are bounding boxes.
  const chevrons = [...svg.matchAll(/<clipPath id="([^"]+)">\s*<path d="([^"]+)"/g)]
    .filter(([, , d]) => (d.match(/C/g) || []).length >= 4)
    .map(([, id, d]) => ({ id, d }));

  if (chevrons.length !== 4) {
    throw new Error(
      `Expected 4 chevron clip paths in the master SVG, found ${chevrons.length}. ` +
        'The artwork changed: re-check the structure before trusting this output.'
    );
  }

  // A chevron's translate lives on an ancestor of where its clip-path is USED,
  // so scope the search to that top-level child. Reading "the nearest transform
  // anywhere before it" instead picks up transforms belonging to the mask images
  // in <defs> and silently shifts two of the four shapes.
  const body = svg.slice(svg.indexOf('</defs>') + 7);
  const children = [];
  let depth = 0;
  let start = null;
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '<') continue;
    const end = body.indexOf('>', i);
    const isClose = body[i + 1] === '/';
    const selfClose = body[end - 1] === '/';
    if (!isClose && !selfClose) {
      if (depth === 0) start = i;
      depth++;
    } else if (isClose) {
      depth--;
      if (depth === 0 && start !== null) {
        children.push(body.slice(start, end + 1));
        start = null;
      }
    }
    i = end;
  }

  const strokes = [];
  for (const child of children) {
    const hit = chevrons.find((c) => child.includes(`clip-path="url(#${c.id})"`));
    if (!hit) continue;
    const t = child.match(/transform="matrix\(1, 0, 0, 1, (\d+), (\d+)\)"/);
    strokes.push({ d: hit.d, transform: t ? ` transform="translate(${t[1]}, ${t[2]})"` : '' });
  }
  if (strokes.length !== 4) {
    throw new Error(`Expected 4 mark strokes in document order, found ${strokes.length}`);
  }

  // Rendered in isolation, strokes 0+1 draw one complete S and strokes 2+3 draw
  // the same S again, offset down and right. (Pairing them any other way gives
  // two meaningless half-shapes, which is how this was confirmed.) That pairing
  // is the whole identity: two S's, one behind the other.
  return { back: smoothPair(strokes.slice(0, 2)), front: smoothPair(strokes.slice(2)) };
}

/**
 * How far to slide a protruding arm back, in user units on the 1500 canvas.
 * Rendered at 60, 90, 110, 130 and 160: below about 110 a sliver of the knob
 * survives, and past 130 the arm is visibly short. 120 leaves margin either way.
 */
const ARM_SHAVE = 120;

/** Split an M/L/C/Z path into commands with their absolute numbers. */
function parsePath(d) {
  const out = [];
  const re = /([MLCZ])([^MLCZ]*)/gi;
  let m;
  while ((m = re.exec(d))) {
    out.push({ cmd: m[1].toUpperCase(), nums: (m[2].match(/-?[\d.]+/g) || []).map(Number) });
  }
  return out;
}

const endpoint = (c) => ({ x: c.nums[c.nums.length - 2], y: c.nums[c.nums.length - 1] });
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Shorten one arm of a chevron by sliding its end cap back toward the bend.
 *
 * Each chevron is a bent bar whose two arms finish in a HORIZONTAL cap. Where
 * the two S's cross, one arm runs past the other and its cap lands outside the
 * silhouette as a knob. Rounding that knob was tried and is not the fix: a
 * rounded knob is still a knob. Sliding the cap back until it is buried inside
 * the partner removes it, and the outline through the bend then belongs entirely
 * to the partner's own bend cap, so the outside of the bend matches the inside.
 *
 * The cap slides along the arm's 45-degree axis, which keeps both of the arm's
 * long edges on the lines they already lay on. Everything else, including the
 * rounded corner at the cap, is translated with it rather than reshaped.
 */
function shaveArm(d, capIndex, amount = ARM_SHAVE) {
  const cmds = parsePath(d);

  // The arm caps are the two horizontal line segments.
  const caps = [];
  for (let i = 1; i < cmds.length; i++) {
    if (cmds[i].cmd !== 'L') continue;
    if (Math.abs(endpoint(cmds[i - 1]).y - endpoint(cmds[i]).y) < 0.01) caps.push(i);
  }
  if (caps.length !== 2) {
    throw new Error(`Expected 2 arm caps on a chevron, found ${caps.length}`);
  }
  const cap = caps[capIndex];

  // Slide toward the bend, which the outer bend cap (commands 1 and 2) locates.
  const capMid = { x: (endpoint(cmds[cap - 1]).x + endpoint(cmds[cap]).x) / 2, y: endpoint(cmds[cap]).y };
  const bend = { x: endpoint(cmds[1]).x, y: (endpoint(cmds[1]).y + endpoint(cmds[2]).y) / 2 };
  const dx = Math.sign(bend.x - capMid.x) * amount;
  const dy = Math.sign(bend.y - capMid.y) * amount;

  // The cap, plus whatever draws its rounded corner. When that corner closes the
  // path, the opening M is the same point and has to move with it.
  const move = new Set([cap, cap - 1]);
  if (cmds[cap - 1].cmd === 'C') move.add(cap - 2);
  const after = cmds[cap + 1];
  if (after && after.cmd === 'C') {
    move.add(cap + 1);
    if (dist(endpoint(after), endpoint(cmds[0])) < 0.01) move.add(0);
  }

  return cmds
    .map((c, i) => {
      if (c.cmd === 'Z') return 'Z';
      const nums = move.has(i) ? c.nums.map((n, j) => n + (j % 2 === 0 ? dx : dy)) : c.nums;
      return `${c.cmd} ${nums.map((n) => Math.round(n * 1000) / 1000).join(' ')}`;
    })
    .join(' ');
}

/**
 * One S, with each chevron's crossing arm shaved back.
 *
 * Which arm crosses is found rather than hardcoded: it is the one whose cap sits
 * nearest the partner chevron. The other arm is the S's own outer tip and is
 * left exactly as drawn, sharp corners included.
 */
function smoothPair([a, b]) {
  const offsetOf = (s) => {
    const m = s.transform.match(/translate\((\d+), (\d+)\)/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
  };
  const points = (s) => {
    const o = offsetOf(s);
    return parsePath(s.d)
      .filter((c) => c.cmd !== 'Z')
      .map((c) => ({ x: endpoint(c).x + o.x, y: endpoint(c).y + o.y }));
  };
  const centre = (s) => {
    const p = points(s);
    return {
      x: p.reduce((t, q) => t + q.x, 0) / p.length,
      y: p.reduce((t, q) => t + q.y, 0) / p.length,
    };
  };
  const capMids = (s) => {
    const cmds = parsePath(s.d);
    const o = offsetOf(s);
    const mids = [];
    for (let i = 1; i < cmds.length; i++) {
      if (cmds[i].cmd !== 'L') continue;
      const p = endpoint(cmds[i - 1]);
      const q = endpoint(cmds[i]);
      if (Math.abs(p.y - q.y) < 0.01) mids.push({ x: (p.x + q.x) / 2 + o.x, y: q.y + o.y });
    }
    return mids;
  };

  return [
    [a, centre(b)],
    [b, centre(a)],
  ].map(([stroke, partner]) => {
    const mids = capMids(stroke);
    const crossing = dist(mids[0], partner) <= dist(mids[1], partner) ? 0 : 1;
    return { ...stroke, d: shaveArm(stroke.d, crossing) };
  });
}

const paths = (strokes, fill) =>
  strokes.map((s) => `<path d="${s.d}"${s.transform} fill="${fill}"/>`).join('');

/**
 * The mark in flat colour, as TWO S's rather than one silhouette.
 *
 * Filling all four strokes in a single colour fuses them into one solid blob
 * that reads as a different, cruder logo: in the master the two S's are told
 * apart purely by opacity gradients baked into raster masks, so flattening
 * destroys the only thing separating them. A second, lighter tone puts that
 * separation back without needing a gradient.
 */
const markTwoTone = (frontHex, backHex) => paths(back(), backHex) + paths(front(), frontHex);

/**
 * The mark in ONE colour, for stamps, embroidery, and knockouts on photography.
 *
 * Where a second tone is not available, the two S's are separated by knocking a
 * gap out of the back one along the front one's edge: the front S is painted
 * into the mask in black with a fat stroke, so it removes itself plus a clear
 * ring around it. Without the gap this is the fused blob described above.
 */
function markMono(hex) {
  const cut = paths(front(), '#000').replace(/fill="#000"/g, 'fill="#000" stroke="#000" stroke-width="26"');
  return [
    `<defs><mask id="ssm-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="1500" height="1500">`,
    `<rect x="0" y="0" width="1500" height="1500" fill="#fff"/>`,
    cut,
    `</mask></defs>`,
    `<g mask="url(#ssm-gap)">${paths(back(), hex)}</g>`,
    paths(front(), hex),
  ].join('');
}

let _strokes = null;
const back = () => (_strokes ??= markStrokes()).back;
const front = () => (_strokes ??= markStrokes()).front;

// ── Output ──────────────────────────────────────────────────────────────────

async function writeSvg(name, markup) {
  writeFileSync(join(OUT, name), markup);
  log(`svg  ${name}`);
}

/**
 * The user-unit width of an SVG, for working out a render density.
 *
 * sharp rasterizes an SVG at `density` DPI against its declared size, so a fixed
 * high density blows the pixel limit on a large viewBox (the master is 1500
 * units square: at 600 DPI that is a 12500px render for a 2048px output). Scale
 * the density to the size actually wanted instead.
 */
function svgWidth(buffer) {
  const head = buffer.toString('utf8', 0, 400);
  const viewBox = head.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) [\d.]+"/);
  if (viewBox) return Number(viewBox[1]);
  const width = head.match(/width="([\d.]+)"/);
  return width ? Number(width[1]) : 1500;
}

/** Density that renders `svg` at roughly `targetPx` wide, with headroom to spare. */
const densityFor = (svg, targetPx) =>
  Math.min(2400, Math.max(72, Math.ceil((72 * targetPx * 1.5) / svgWidth(svg))));

/** Rasterize an SVG file at a set of widths, transparent background. */
async function raster(svgName, widths, { square = false, background = null } = {}) {
  const svg = readFileSync(join(OUT, svgName));
  const stem = basename(svgName, '.svg');
  for (const w of widths) {
    const pipeline = sharp(svg, { density: densityFor(svg, w) });
    const out = square
      ? pipeline.resize(w, w, { fit: 'contain', background: background ?? '#0000' })
      : pipeline.resize({ width: w, background: background ?? '#0000' });
    await (background ? out.flatten({ background }) : out).png().toFile(join(OUT, `${stem}-${w}.png`));
    log(`png  ${stem}-${w}.png`);
  }
}

/**
 * A square, fully opaque tile: white mark centred on brand, at `fill` of the
 * tile's height. For app icons and social avatars, both of which are composited
 * by someone else onto a background we do not control.
 *
 * Built by compositing onto an explicit canvas rather than resize-contain plus
 * flatten. sharp applies `flatten` before `extend`, so the contain letterbox and
 * the extended border both survived as transparent black and the first version
 * of this icon shipped with two dark bars down its sides.
 */
async function tile(destPath, size, fill) {
  const svg = readFileSync(join(OUT, 'mark-mono-white.svg'));
  const inner = Math.round(size * fill);
  const mark = await sharp(svg, { density: densityFor(svg, inner) })
    .resize(inner, inner, { fit: 'inside' })
    .png()
    .toBuffer();
  const { width, height } = await sharp(mark).metadata();
  await sharp({
    create: { width: size, height: size, channels: 4, background: COLOR.brand },
  })
    .composite([
      {
        input: mark,
        top: Math.round((size - height) / 2),
        left: Math.round((size - width) / 2),
      },
    ])
    .png()
    .toFile(destPath);
}

// ── Typographic lockups ─────────────────────────────────────────────────────

/**
 * The lockups are SET, not copied.
 *
 * They used to ship as the original rasters from images/ExamplesOfTypography/.
 * Those are retired: the brand faces render the same three-tier formula better,
 * they scale, they carry a qualifier slot anyone can extend, and a PNG of type
 * is a dead end for whoever has to place it. This is the one place the guide
 * deliberately does NOT hand back the original artwork, because the original was
 * a picture of a lockup and this is the lockup itself.
 *
 * Set in the brand faces and CONVERTED TO OUTLINES, so a downloaded file needs
 * no font installed. The logo's own wordmark is still never re-typeset: that is
 * artwork, this is typesetting, and they are different jobs.
 */
// parse(), not loadSync(): the latter is deprecated in this version and returns
// undefined rather than throwing, which surfaces much later as a null font.
const face = (file) => {
  const font = opentype.parse(readFileSync(join(FONTS, file)).buffer);
  if (!font?.getPath) throw new Error(`Could not parse font: ${file}`);
  return font;
};

const FACE = {
  solution: face('Poppins-Medium.ttf'),
  seeking: face('Anton-Regular.ttf'),
  qualifier: face('Poppins-Medium.ttf'),
};

/** Proportions carried over from the live specimen on /design. */
const LOCKUP = { solution: 96, seeking: 192, qualifier: 76, tracking: 0.2, gap: 0.04 };

/**
 * One line of type as outlines, optionally letterspaced.
 *
 * Letterspacing has to be applied glyph by glyph: opentype lays out a whole
 * string at the font's own advances, with no tracking parameter.
 */
function line(font, text, size, tracking = 0) {
  const extra = size * tracking;
  if (!extra) {
    return { d: font.getPath(text, 0, 0, size).toPathData(2), width: font.getAdvanceWidth(text, size) };
  }
  let x = 0;
  let d = '';
  for (const ch of [...text]) {
    d += `${font.getPath(ch, x, 0, size).toPathData(2)} `;
    x += font.getAdvanceWidth(ch, size) + extra;
  }
  return { d: d.trim(), width: x - extra };
}

/** Bounding box of path data, by rendering-free parsing of its coordinates. */
function pathBounds(d) {
  const nums = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]);
    maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]);
    maxY = Math.max(maxY, nums[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

const shift = (d, dx, dy) =>
  `<path d="${d}" transform="translate(${Math.round(dx * 100) / 100}, ${Math.round(dy * 100) / 100})"/>`;

/**
 * Stack the lines, centred, tight to their real ink.
 *
 * Stacked on measured bounding boxes rather than font metrics: Anton's ascent
 * dwarfs Poppins', so metric-based leading leaves a visible hole under
 * "Solution" and none under the qualifier.
 */
function lockup(qualifier) {
  const parts = [
    { ...line(FACE.solution, 'Solution', LOCKUP.solution), fill: COLOR.ink },
    { ...line(FACE.seeking, 'SEEKING', LOCKUP.seeking), fill: COLOR.sky },
  ];
  if (qualifier) {
    // A short qualifier is set as a letterspaced cap line, the way SYSTEM reads
    // in the master. A long one is a phrase and would look absurd tracked out.
    const long = qualifier.length > 8;
    parts.push({
      ...line(
        FACE.qualifier,
        long ? qualifier : qualifier.toUpperCase(),
        long ? LOCKUP.qualifier * 0.62 : LOCKUP.qualifier,
        long ? 0 : LOCKUP.tracking
      ),
      fill: COLOR.ink,
    });
  }

  const boxes = parts.map((p) => pathBounds(p.d));
  const widest = Math.max(...boxes.map((b) => b.maxX - b.minX));
  const gap = LOCKUP.seeking * LOCKUP.gap;

  let y = 0;
  const body = parts
    .map((p, i) => {
      const b = boxes[i];
      const dx = (widest - (b.maxX - b.minX)) / 2 - b.minX;
      const dy = y - b.minY;
      y += b.maxY - b.minY + gap;
      return `<g fill="${p.fill}">${shift(p.d, dx, dy)}</g>`;
    })
    .join('');

  const height = y - gap;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(widest)} ${Math.ceil(height)}"`,
    ` width="${Math.ceil(widest)}" height="${Math.ceil(height)}"`,
    ` role="img" aria-label="Solution Seeking${qualifier ? ` ${qualifier}` : ''}">`,
    `<title>Solution Seeking${qualifier ? ` ${qualifier}` : ''}</title>`,
    body,
    `</svg>`,
  ].join('');
}

const LOCKUPS = [
  ['lockup-solution-seeking', null],
  ['lockup-system', 'System'],
  ['lockup-guide', 'Guide'],
  ['lockup-mentor', 'Mentor'],
  ['lockup-beanchain-process', 'A Beanchain Process'],
];

async function buildLockups() {
  for (const [name, qualifier] of LOCKUPS) {
    writeFileSync(join(OUT, `${name}.svg`), lockup(qualifier));
    log(`svg  ${name}.svg`);
    await raster(`${name}.svg`, [1200]);
  }
}

/**
 * Write a zip with Node alone, no system archiver.
 *
 * This started as PowerShell's Compress-Archive, which turned out to be a bad
 * dependency twice over: it opens every input EXCLUSIVELY, so it fails whenever
 * a dev server is watching public/, and it fails by writing nothing while
 * PowerShell still exits 0, so the script cheerfully reported success and
 * produced no file. Reading the bytes ourselves sidesteps both, and makes the
 * script behave the same on every machine.
 *
 * Timestamps are pinned rather than taken from the clock so re-running with no
 * artwork change produces a byte-identical archive, and git sees nothing.
 */
function makeZip() {
  const zipPath = join(OUT, 'solution-seeking-brand-assets.zip');
  rmSync(zipPath, { force: true });

  const names = readdirSync(OUT)
    .filter((n) => /\.(svg|png)$/.test(n))
    .sort();

  const DOS_TIME = 0; // 00:00
  const DOS_DATE = (1980 - 1980) * 512 + 1 * 32 + 1; // 1980-01-01
  const locals = [];
  const central = [];
  let offset = 0;

  for (const name of names) {
    const raw = readFileSync(join(OUT, name));
    const deflated = deflateRawSync(raw, { level: 9 });
    // Only claim compression when it actually helped.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(zipPath, Buffer.concat([...locals, centralBuf, end]));
  if (!existsSync(zipPath)) throw new Error('zip was not written');
  log(`zip  ${basename(zipPath)}  (${names.length} files)`);
}

// ── Run ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });
console.log('\nBuilding brand assets into public/brand/\n');

console.log(' Wordmark (extracted from the master as vector)');
await writeSvg('wordmark.svg', await tightSvg(extractWordmark(), 1500, 'Solution Seeking System'));
await raster('wordmark.svg', [800, 1600]);

console.log('\n Mark, flat (master geometry, two S\'s kept apart)');
await writeSvg(
  'mark-color.svg',
  await tightSvg(markTwoTone(COLOR.brand, COLOR.brandBack), 1500, 'Solution Seeking mark')
);
for (const [name, hex] of [
  ['mono-brand', COLOR.brand],
  ['mono-white', COLOR.white],
  ['mono-ink', COLOR.ink],
  ['mono-black', COLOR.black],
]) {
  await writeSvg(`mark-${name}.svg`, await tightSvg(markMono(hex), 1500, 'Solution Seeking mark'));
}
await raster('mark-color.svg', [256, 512, 1024], { square: true });
await raster('mark-mono-white.svg', [512], { square: true });
await raster('mark-mono-ink.svg', [512], { square: true });
await raster('mark-mono-black.svg', [512], { square: true });

console.log('\n App icons (flat mark: the gradient master is unreadable this small)');
const iconSvg = readFileSync(join(OUT, 'mark-color.svg'));
for (const size of [16, 32, 48, 180, 192, 512]) {
  await sharp(iconSvg, { density: densityFor(iconSvg, size) })
    .resize(size, size, { fit: 'contain', background: '#0000' })
    .png()
    .toFile(join(OUT, `icon-${size}.png`));
  log(`png  icon-${size}.png`);
}
// A social avatar is cropped to a circle by most platforms, so the mark sits
// smaller inside its tile than it does on an app icon.
await tile(join(OUT, 'social-avatar-1024.png'), 1024, 0.58);
log('png  social-avatar-1024.png');

console.log('\n Full logo (the master, gradients intact)');
await raster('logo.svg', [512, 1024, 2048]);

/*
 * The site's own icons, rebuilt from the same geometry as everything above.
 *
 * Both were wrong, in ways that only showed up once the real artwork was pulled
 * apart. favicon.svg was a hand-simplification drawing ONE S in three paths,
 * with angular terminals where the master's are rounded: a different mark, not a
 * smaller one. apple-touch-icon.png was the entire logo, wordmark included,
 * shrunk into 180px, where "SEEKING SYSTEM" is a grey smudge.
 *
 * The paths are unchanged, so nothing that references them has to change.
 */
console.log('\n Live site icons (public/)');
writeFileSync(join(PUBLIC, 'favicon.svg'), readFileSync(join(OUT, 'mark-color.svg')));
log('svg  favicon.svg  (was a different, approximated mark)');

// iOS composites the tile onto a background of its choosing and ignores
// transparency, so this one is deliberately opaque: a brand tile, white mark.
await tile(join(PUBLIC, 'apple-touch-icon.png'), 180, 0.66);
log('png  apple-touch-icon.png  (was the full logo, wordmark illegible)');

console.log('\n Typographic lockups (set in the brand faces, outlined)');
await buildLockups();

console.log('\n Archive');
makeZip();

console.log('\nDone. Look at every file before committing it.\n');
