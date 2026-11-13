#!/usr/bin/env node
/**
 * Génère les visuels du README de profil (profile/ui/*.svg), au style du portfolio
 * https://corgidev42.github.io/ : fond sombre, bordures 1px, ombres franches, pixel-art.
 *
 * Contraintes GitHub prises en compte :
 *   - un README n'accepte ni CSS ni JS : tout le style vit dans des SVG chargés en <img> ;
 *   - un SVG en <img> ne peut rien charger d'externe : JetBrains Mono est donc embarquée
 *     en base64, réduite aux seuls caractères utilisés par chaque image ;
 *   - chaque SVG porte son propre fond sombre : lisible en thème clair comme en thème sombre ;
 *   - les cartes font 400px de large : deux par ligne sur ordinateur, une par ligne sur mobile.
 *
 * Usage : node tools/build-profile.mjs           tout régénérer (réseau requis : polices + API GitHub)
 *         node tools/build-profile.mjs --stats   seulement les deux cartes d'activité (utilisé par la CI)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from './icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'profile', 'ui');
const CACHE = join(ROOT, 'tools', '.cache');

/* ───────────────────────── Contenu (à modifier ici) ───────────────────────── */

const SECTIONS = [
  ['about', 'À propos'],
  ['experience', 'Expérience'],
  ['projects', 'Projets phares'],
  ['stack', 'Stack'],
  ['offcode', 'Off-code'],
  ['activity', 'Activité GitHub'],
  ['contact', 'Contact'],
];

const TERMINAL = [
  ['cmd', 'whoami'],
  ['out', 'vincent bonnard · montpellier'],
  ['cmd', 'cat profil.txt'],
  ['out', 'C++17 · Qt 6/QML · Linux embarqué'],
  ['out', 'React/TS · Django · Python · Docker'],
  ['cmd', './dispo --cdi'],
  ['ok', 'École 42 — campus de Perpignan'],
  ['ok', '6 mois de C++/Qt chez GameSide'],
  ['ok', 'disponible en CDI · Montpellier'],
];

const CATS = {
  sys: { label: 'Systèmes & C/C++', icon: 'chip', color: 'amber' },
  web: { label: 'Web & temps réel', icon: 'code', color: 'violet' },
  game: { label: 'Jeux & moteurs', icon: 'joystick', color: 'magenta' },
  tool: { label: 'Outils & IA', icon: 'robot', color: 'green' },
};

const PROJECTS = [
  {
    id: 'transcendence', cat: 'web', impact: 5, team: 'Équipe de 5',
    title: 'Meditation Transcendentale', sub: 'ft_transcendence · École 42',
    pitch: "Plateforme d'échecs multijoueur temps réel : matchmaking, chat, spectateurs, analytics. 16 services conteneurisés.",
    stack: ['React 19', 'Django ASGI', 'WebSockets', 'PostgreSQL', 'Redis', 'Docker'],
  },
  {
    id: 'ft-irc', cat: 'sys', impact: 5, team: 'Binôme EVE',
    title: 'ft_irc', sub: 'Serveur IRC · École 42',
    pitch: "Serveur IRC en C++ : boucle d'événements epoll, messages analysés par une grammaire BNF, une commande = une classe.",
    stack: ['C++17', 'Sockets TCP', 'epoll', 'CMake', 'Docker'],
  },
  {
    id: 'minishell', cat: 'sys', impact: 4, team: 'Binôme EVE',
    title: 'minishell', sub: 'Shell Unix · École 42',
    pitch: 'Un shell façon Bash écrit en C : arbre syntaxique, pipes, redirections, heredocs, signaux et builtins.',
    stack: ['C', 'fork / execve', 'Pipes', 'Signaux', 'AST'],
  },
  {
    id: 'cub3d', cat: 'game', impact: 4, team: 'Binôme EVE',
    title: 'cub3D', sub: 'Moteur de raycasting · École 42',
    pitch: "Moteur de rendu 3D par raycasting en C : un labyrinthe texturé, en temps réel, à partir d'une carte 2D.",
    stack: ['C', 'MiniLibX', 'Raycasting / DDA', 'Makefile'],
  },
  {
    id: 'topquizz', cat: 'web', impact: 4, team: 'Perso',
    title: 'TopQuizz', sub: 'Quiz événementiel propulsé par IA',
    pitch: 'Soirée quiz en local : le Mac anime, la TV affiche, les smartphones buzzent. Questions générées par IA.',
    stack: ['FastAPI', 'React', 'Socket.IO', 'Docker', 'Gemini / Ollama'],
  },
  {
    id: 'inception', cat: 'sys', impact: 3, team: 'Solo',
    title: 'Inception', sub: 'Infrastructure Docker · École 42',
    pitch: 'Une stack web montée à la main : Nginx en TLS, WordPress, MariaDB, Redis. Un conteneur et un Dockerfile par service.',
    stack: ['Docker Compose', 'Nginx', 'MariaDB', 'Redis', 'TLS'],
  },
];

// [nom, « utilisé au quotidien » ?]
const STACK = [
  { id: 'lang', title: 'Langages', icon: 'terminal', color: 'amber',
    tags: [['C++17', 1], ['C', 1], ['QML', 1], ['Python', 1], ['TypeScript'], ['JavaScript'], ['SQL'], ['HTML / CSS'], ['Bash'], ['PowerShell']] },
  { id: 'fw', title: 'Frameworks & API', icon: 'code', color: 'violet',
    tags: [['Qt 6 / Qt Quick', 1], ['C++ STL', 1], ['REST / JSON', 1], ['React'], ['Django / ASGI'], ['FastAPI'], ['Node.js'], ['WebSockets'], ['OpenCV'], ['API OpenAI / Gemini']] },
  { id: 'sys', title: 'Systèmes & réseau', icon: 'chip', color: 'magenta',
    tags: [['Linux', 1], ['Sockets UDP / TCP', 1], ['Multithreading', 1], ['Embarqué (Raspberry Pi 4)', 1], ['macOS'], ['PostgreSQL'], ['Redis'], ['Nginx']] },
  { id: 'tools', title: 'Outillage & méthodes', icon: 'bolt', color: 'green',
    tags: [['Git', 1], ['CMake / Makefile', 1], ['Docker', 1], ['Cursor / LLM', 1], ['QTest'], ['Tests E2E'], ['CI / CD'], ['Reverse engineering'], ['Peer review']] },
];

const STATS = [
  { id: 'hike', icon: 'mountain', color: 'green', name: 'Randonnée', sub: 'Endurance, autonomie, rigueur', v: 8, lbl: 'END' },
  { id: 'gym', icon: 'dumbbell', color: 'magenta', name: 'Musculation & sport', sub: 'Régularité, progression mesurée', v: 7, lbl: 'FOR' },
  { id: 'games', icon: 'gamepad', color: 'violet', name: 'Jeux vidéo & game dev', sub: 'Conception, mécaniques, moteurs', v: 8, lbl: 'DEX' },
  { id: 'board', icon: 'meeple', color: 'amber', name: 'Jeux de société', sub: 'Stratégie, logique, règles', v: 9, lbl: 'INT' },
];

const BUTTONS = [
  { id: 'portfolio', label: 'Portfolio', icon: 'bolt', accent: true },
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin' },
  { id: 'mail', label: 'E-mail', icon: 'mail' },
  { id: 'eve', label: 'Collectif EVE', icon: 'branch' },
];

/* ───────────────────────────── Jetons de design ───────────────────────────── */

const C = {
  bg: '#0d1117', alt: '#0a0d12', panel: '#131a24', line: '#2b3545',
  text: '#e6edf3', soft: '#c3ccd7', muted: '#8b98a9',
  amber: '#ffb224', magenta: '#ff4d8d', violet: '#9d7bff', green: '#3ddc84',
};
const MONO = "JBM,'JetBrains Mono',ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";
const ADV = 0.6; // chasse de JetBrains Mono : 600/1000 em
const tw = (str, size, ls = 0) => [...str].length * (size * ADV + ls);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (n) => Math.round(n * 100) / 100;

function wrap(str, max) {
  const lines = [];
  let cur = '';
  for (const word of str.split(' ')) {
    if (cur && [...cur].length + 1 + [...word].length > max) { lines.push(cur); cur = word; }
    else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ───────────────────────────── Polices embarquées ─────────────────────────── */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
async function fontBase64(weight, chars) {
  const key = createHash('sha1').update(weight + ':' + chars).digest('hex').slice(0, 16);
  const file = join(CACHE, `jbm-${weight}-${key}.woff2`);
  if (existsSync(file)) return readFileSync(file).toString('base64');
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@${weight}&text=${encodeURIComponent(chars)}`;
    const css = await (await fetch(cssUrl, { headers: { 'User-Agent': UA } })).text();
    const url = css.match(/url\((https:\/\/[^)]+)\)/)?.[1];
    if (!url) throw new Error('sous-ensemble de police introuvable');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, buf);
    return buf.toString('base64');
  } catch (e) {
    console.warn(`  ! police ${weight} non embarquée (${e.message}) — repli sur la police monospace du système`);
    return null;
  }
}

/* ───────────────────────────── Mini-moteur SVG ─────────────────────────────── */

class Svg {
  constructor(w, h, label) {
    this.w = w; this.h = h; this.label = label;
    this.body = []; this.css = [];
    this.chars = { 500: new Set(), 800: new Set() };
  }
  add(s) { this.body.push(s); return this; }
  style(s) { this.css.push(s); return this; }
  rect(x, y, w, h, fill, extra = '') { return this.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`); }
  /** Rectangle au contour net de 1px, tracé à l'intérieur de la boîte. */
  box(x, y, w, h, fill, stroke) { return this.rect(x + 0.5, y + 0.5, w - 1, h - 1, fill, ` stroke="${stroke}"`); }
  note(str, weight) { for (const ch of str) if (ch !== ' ') this.chars[weight].add(ch); }
  text(x, y, str, o = {}) {
    const { size = 12, weight = 500, fill = C.text, anchor, ls, attrs = '' } = o;
    this.note(str, weight);
    return this.add(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}${attrs}>${esc(str)}</text>`);
  }
  /** Texte en plusieurs morceaux de couleurs / graisses différentes. */
  spans(x, y, parts, o = {}) {
    const { size = 12, attrs = '' } = o;
    const inner = parts.map(([str, fill = C.text, weight = 500]) => {
      this.note(str, weight);
      return `<tspan fill="${fill}" font-weight="${weight}">${esc(str)}</tspan>`;
    }).join('');
    return this.add(`<text x="${x}" y="${y}" font-size="${size}" xml:space="preserve"${attrs}>${inner}</text>`);
  }
  icon(name, x, y, size, col = {}) {
    const rows = ICONS[name], s = size / rows[0].length;
    const pal = { '#': col.main ?? C.text, o: col.accent ?? C.amber, w: col.light ?? C.text, k: col.dark ?? C.bg };
    const d = {};
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length;) {
        const c = row[rx];
        if (c === '.') { rx++; continue; }
        let n = 1;
        while (row[rx + n] === c) n++;
        (d[c] ||= []).push(`M${rx} ${ry}h${n}v1h-${n}z`);
        rx += n;
      }
    });
    const paths = Object.entries(d).map(([c, segs]) => `<path fill="${pal[c]}" d="${segs.join('')}"/>`).join('');
    return this.add(`<g transform="translate(${x} ${y}) scale(${r2(s)})" shape-rendering="crispEdges"${col.attrs ?? ''}>${paths}</g>`);
  }
  /** Rangées d'étiquettes ; renvoie la hauteur occupée. */
  tags(list, x0, y0, maxW, o = {}) {
    const { size = 10, padX = 6, h = 18, gap = 5, color = C.amber } = o;
    let x = x0, y = y0;
    for (const [name, core] of list) {
      const w = Math.ceil(tw(name, size) + padX * 2);
      if (x > x0 && x + w > x0 + maxW) { x = x0; y += h + gap; }
      this.box(x, y, w, h, core ? color : C.bg, core ? color : C.line);
      this.text(x + padX, y + h / 2 + size * 0.36, name, { size, weight: core ? 800 : 500, fill: core ? C.bg : C.soft });
      x += w + gap;
    }
    return y + h - y0;
  }
  async render() {
    const faces = [];
    for (const weight of [500, 800]) {
      const chars = [...this.chars[weight]].sort().join('');
      if (!chars) continue;
      const b64 = await fontBase64(weight, chars);
      if (b64) faces.push(`@font-face{font-family:JBM;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2')}`);
    }
    const css = faces.join('') + `text{font-family:${MONO}}` + this.css.join('') +
      '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}" role="img" aria-label="${esc(this.label)}">` +
      `<title>${esc(this.label)}</title><style>${css}</style>${this.body.join('')}</svg>\n`;
  }
}

/* ───────────────────────────── Bannière (hero) ─────────────────────────────── */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);
const LED = [C.amber, C.magenta, C.violet];

/** Même « plasma » tramé que le fond du portfolio, figé à l'instant t. */
function matrix(s, { cols, rows, cell, t, thr, dim }) {
  const groups = {};
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p = (Math.sin(x * 0.21 + t * 0.7) + Math.sin(y * 0.27 - t * 0.5) + Math.sin((x + y) * 0.13 + t * 0.35) + 3) / 6;
      if (!(p > thr && (p - thr) / (1 - thr) > BAYER[(y & 3) * 4 + (x & 3)])) continue;
      const color = Math.min(2, ((Math.sin(x * 0.05 + t * 0.11) + Math.sin(y * 0.07 - t * 0.09) + 2) * 0.75) | 0);
      const blink = (x * 7 + y * 13 + ((x * y) % 5)) % 4; // 0 = fixe, 1..3 = clignote
      const key = `${color}|${dim(x / cols) ? 'd' : 'f'}|${blink}`;
      (groups[key] ||= []).push(`M${x * cell} ${y * cell}h${cell - 2}v${cell - 2}h-${cell - 2}z`);
    }
  }
  for (const [key, segs] of Object.entries(groups)) {
    const [color, lvl, blink] = key.split('|');
    s.add(`<path class="led ${lvl}${+blink ? ' k' + blink : ''}" fill="${LED[color]}" d="${segs.join('')}"/>`);
  }
}

async function hero() {
  const W = 840, H = 328, GROUND = 296;
  const s = new Svg(W, H, 'Vincent Bonnard — Développeur C++ / Systèmes & FullStack, Montpellier. Disponible en CDI.');
  s.style(
    '.led{shape-rendering:crispEdges}.f{opacity:.42}.d{opacity:.2}' +
    '.k1{animation:bk 3.4s steps(1) infinite}.k2{animation:bk 4.6s steps(1) -1.7s infinite}.k3{animation:bk 5.8s steps(1) -3.1s infinite}' +
    '@keyframes bk{0%,62%{visibility:visible}63%,100%{visibility:hidden}}' +
    '.cur{animation:cur 1.1s steps(1) infinite}@keyframes cur{50%{opacity:0}}' +
    '.walk{animation:walk 24s linear infinite}@keyframes walk{from{transform:translateX(-60px)}to{transform:translateX(880px)}}' +
    '.fa{animation:fr .36s steps(1) infinite}.fb{animation:fr .36s steps(1) -.18s infinite}@keyframes fr{0%,49.9%{opacity:1}50%,100%{opacity:0}}' +
    '.out{animation:show .01s linear both}@keyframes show{from{opacity:0}to{opacity:1}}' +
    '.cov{animation-name:type;animation-fill-mode:both}@keyframes type{from{transform:translateX(0)}}'
  );

  s.rect(0, 0, W, H, C.bg);
  matrix(s, { cols: 60, rows: 21, cell: 14, t: 7.3, thr: 0.5, dim: (x) => x < 0.52 });

  // Statut
  const status = 'DISPONIBLE EN CDI · MONTPELLIER';
  const sw = Math.ceil(tw(status, 11, 1)) + 40;
  s.box(40, 30, sw, 26, C.bg, C.green);
  s.rect(52, 39, 8, 8, C.green, ' class="cur"');
  s.text(70, 47, status, { size: 11, fill: C.green, ls: 1 });

  // Nom : plein + contour, comme sur le portfolio
  const nameW = Math.ceil(tw('VINCENT', 70, -3)) + 14;
  s.rect(34, 68, nameW, 132, C.bg);
  s.text(38, 128, 'VINCENT', { size: 70, weight: 800, ls: -3 });
  s.text(38, 192, 'BONNARD', { size: 70, weight: 800, ls: -3, fill: C.bg, attrs: ` stroke="${C.text}" stroke-width="1.6"` });

  // Rôle
  const role = [['Développeur ', C.muted], ['C++ / Systèmes', C.amber, 800], [' & ', C.line], ['FullStack', C.amber, 800]];
  s.rect(34, 208, Math.ceil(tw(role.map((p) => p[0]).join(''), 17)) + 12, 30, C.bg);
  s.spans(38, 229, role, { size: 17 });
  const line2 = 'École 42 · Linux embarqué · temps réel · web';
  s.rect(34, 238, Math.ceil(tw(line2, 12)) + 12, 22, C.bg);
  s.text(38, 253, line2, { size: 12, fill: C.muted });

  // Terminal
  const TX = 506, TY = 30, TW2 = 296, LH = 18, FS = 11.5;
  const TH = 30 + 14 + (TERMINAL.length + 1) * LH + 8;
  s.rect(TX + 7, TY + 7, TW2, TH, C.line);
  s.box(TX, TY, TW2, TH, C.alt, C.line);
  s.rect(TX, TY + 29, TW2, 1, C.line);
  [C.magenta, C.amber, C.green].forEach((c, i) => s.rect(TX + 12 + i * 14, TY + 10, 9, 9, c));
  s.text(TX + TW2 - 12, TY + 19, '~/vincent — zsh', { size: 10, fill: C.muted, anchor: 'end' });

  let delay = 0.5;
  TERMINAL.forEach(([kind, str], i) => {
    const y = TY + 30 + 14 + i * LH + 10, x = TX + 14;
    if (kind === 'cmd') {
      s.spans(x, y, [['$ ', C.amber], [str, C.text]], { size: FS });
      // cache qui glisse caractère par caractère : effet « frappe » sans JS
      const n = [...str].length, w = Math.ceil(tw(str, FS)) + 4, dur = r2(n * 0.055);
      s.add(`<rect class="cov" x="${x + tw('$ ', FS)}" y="${y - 12}" width="${w}" height="16" fill="${C.alt}" style="transform:translateX(${w}px);animation-duration:${dur}s;animation-delay:${r2(delay)}s;animation-timing-function:steps(${n})"/>`);
      delay += dur + 0.25;
    } else {
      const parts = kind === 'ok' ? [['[ OK ] ', C.green], [str, C.soft]] : [[str, C.muted]];
      s.spans(x + tw('  ', FS), y, parts, { size: FS, attrs: ` class="out" style="animation-delay:${r2(delay)}s"` });
      delay += 0.14;
    }
  });
  const yEnd = TY + 30 + 14 + TERMINAL.length * LH + 10;
  s.spans(TX + 14, yEnd, [['$', C.amber]], { size: FS, attrs: ` class="out" style="animation-delay:${r2(delay)}s"` });
  s.add(`<g class="out" style="animation-delay:${r2(delay)}s"><rect class="cur" x="${TX + 14 + tw('$ ', FS)}" y="${yEnd - 11}" width="7" height="13" fill="${C.text}"/></g>`);

  // Sol + mascotte
  s.rect(0, GROUND, W, H - GROUND, C.bg);
  s.rect(0, GROUND, W, 1, C.line);
  for (let x = 0; x < W; x += 14) s.rect(x, GROUND + 14, 6, 1, C.line);
  s.add('<g class="walk">');
  s.icon('corgi-a', 0, GROUND - 22, 36, { accent: C.amber, attrs: ' class="fa"' });
  s.icon('corgi-b', 0, GROUND - 22, 36, { accent: C.amber, attrs: ' class="fb"' });
  s.add('</g>');

  s.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${C.line}"/>`);
  return s.render();
}

/* ───────────────────────────── Titres de section ───────────────────────────── */

async function heading(index, title) {
  const W = 840, H = 52, up = title.toUpperCase();
  const s = new Svg(W, H, `${index} — ${title}`);
  s.rect(0, 0, W, H, C.bg);
  s.rect(0, 14, 34, 24, C.amber);
  s.text(17, 31, index, { size: 12, weight: 800, fill: C.bg, anchor: 'middle' });
  s.text(50, 35, up, { size: 24, weight: 800, ls: -0.8 });
  const end = 50 + tw(up, 24, -0.8) + 18;
  s.rect(end, 26, W - end, 1, C.line);
  return s.render();
}

/* ───────────────────────────── Cartes projets ──────────────────────────────── */

const CARD_W = 400, SH = 6;

async function projectCard(p, pitchLines) {
  const cat = CATS[p.cat], col = C[cat.color];
  const w = CARD_W - SH, PAD = 16;
  const yTitle = 64, yPitch = yTitle + 36;
  const yTags = yPitch + pitchLines * 17 + 8;
  const s = new Svg(CARD_W, 10, `${p.title} — ${p.sub}. ${p.pitch} Stack : ${p.stack.join(', ')}.`);

  const yFoot = yTags + 46 + 12; // deux rangées d'étiquettes réservées : toutes les cartes ont la même hauteur
  const h = yFoot + 34;
  s.h = h + SH;

  s.rect(SH, SH, w, h, col);
  s.box(0, 0, w, h, C.panel, col);

  // Bandeau catégorie + pastilles d'impact
  s.icon(cat.icon, PAD, 10, 16, { accent: col });
  s.text(PAD + 26, 23, cat.label.toUpperCase(), { size: 10, fill: col, ls: 0.8 });
  for (let i = 0; i < 5; i++) {
    const x = w - PAD - (5 - i) * 10 + 3;
    if (i < p.impact) s.rect(x, 15, 7, 7, col); else s.box(x, 15, 7, 7, 'none', C.line);
  }
  s.rect(0.5, 36, w - 1, 1, C.line);

  s.text(PAD, yTitle, p.title, { size: 17, weight: 800, ls: -0.4 });
  s.text(PAD, yTitle + 17, p.sub, { size: 10.5, fill: C.muted });
  wrap(p.pitch, 50).forEach((line, i) => s.text(PAD, yPitch + 12 + i * 17, line, { size: 11.5, fill: C.soft }));
  s.tags(p.stack.map((t) => [t]), PAD, yTags, w - PAD * 2, { size: 10 });

  s.rect(0.5, yFoot, w - 1, 1, C.line);
  s.text(PAD, yFoot + 21, p.team, { size: 10.5, fill: C.muted });
  s.text(w - PAD - 18, yFoot + 21, 'GitHub', { size: 11, weight: 800, anchor: 'end' });
  s.icon('external', w - PAD - 13, yFoot + 10, 13, { main: C.text });
  return s.render();
}

/* ───────────────────────────── Panneaux de stack ───────────────────────────── */

async function stackPanel(g, bodyH) {
  const col = C[g.color], w = CARD_W - SH, PAD = 16;
  const h = 52 + bodyH + 16;
  const s = new Svg(CARD_W, h + SH, `${g.title} : ${g.tags.map((t) => t[0]).join(', ')}.`);
  s.rect(SH, SH, w, h, C.line);
  s.box(0, 0, w, h, C.panel, C.line);
  s.rect(0, 0, w, 3, col);
  s.icon(g.icon, PAD, 17, 18, { accent: col });
  s.text(PAD + 28, 31, g.title, { size: 14, weight: 800 });
  s.tags(g.tags, PAD, 52, w - PAD * 2, { size: 11, padX: 8, h: 22, gap: 6, color: col });
  return s.render();
}
const stackBodyH = (g) => new Svg(1, 1, '').tags(g.tags, 16, 0, CARD_W - SH - 32, { size: 11, padX: 8, h: 22, gap: 6 });

/* ───────────────────────────── Fiche perso (stats) ─────────────────────────── */

async function statTile(st, i) {
  const col = C[st.color], w = CARD_W - SH, h = 92;
  const s = new Svg(CARD_W, h + SH, `${st.name} — ${st.sub}. ${st.lbl} ${st.v} sur 10.`);
  s.rect(SH, SH, w, h, C.line);
  s.box(0, 0, w, h, C.panel, C.line);
  s.icon(st.icon, 18, 16, 36, { accent: col });
  s.text(70, 30, st.name, { size: 14, weight: 800 });
  s.text(70, 47, st.sub, { size: 11, fill: C.muted });
  // jauge à 10 segments : les segments pleins s'allument un par un au chargement
  const bx = 70, by = 62, seg = 24, gap = 3;
  s.style('.sg{animation:show .01s linear both}@keyframes show{from{opacity:0}to{opacity:1}}');
  for (let k = 0; k < 10; k++) {
    s.rect(bx + k * (seg + gap), by, seg, 11, C.line);
    if (k < st.v) s.rect(bx + k * (seg + gap), by, seg, 11, col, ` class="sg" style="animation-delay:${r2(0.4 + i * 0.12 + k * 0.08)}s"`);
  }
  s.text(w - 16, 72, st.lbl, { size: 11, weight: 800, fill: col, anchor: 'end' });
  return s.render();
}

/* ───────────────────────────── Boutons ─────────────────────────────────────── */

async function button(b) {
  const label = b.label.toUpperCase(), size = 12;
  const w = Math.ceil(tw(label, size, 0.6)) + 16 + 10 + 36, h = 40, sh = 4;
  const s = new Svg(w + sh, h + sh, b.label);
  s.rect(sh, sh, w, h, b.accent ? '#8a5f14' : C.line);
  s.box(0, 0, w, h, b.accent ? C.amber : C.bg, b.accent ? C.amber : C.text);
  const fg = b.accent ? C.bg : C.text;
  s.icon(b.icon, 18, 12, 16, { main: fg, accent: b.accent ? C.bg : C.amber });
  s.text(18 + 16 + 10, 25, label, { size, weight: 800, fill: fg, ls: 0.6 });
  return s.render();
}

/* ───────────────────────────── Cartes d'activité (données GitHub) ──────────── */

const USER = 'Corgidev42';

async function gh(path) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const res = await fetch('https://api.github.com' + path, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'profile-readme-build', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** Uniquement des données publiques, via l'API REST : fonctionne avec le GITHUB_TOKEN d'Actions. */
async function fetchActivity() {
  const year = new Date().getUTCFullYear();
  const q = (s) => encodeURIComponent(s);
  const [user, repos, commits, prs] = await Promise.all([
    gh(`/users/${USER}`),
    gh(`/users/${USER}/repos?per_page=100&type=owner`),
    gh(`/search/commits?per_page=1&q=${q(`author:${USER} is:public author-date:>=${year}-01-01`)}`),
    gh(`/search/issues?per_page=1&q=${q(`author:${USER} is:public type:pr`)}`),
  ]);
  const own = repos.filter((r) => !r.fork);
  const bytes = {};
  for (const r of own) {
    const langs = await gh(`/repos/${r.full_name}/languages`);
    for (const [name, n] of Object.entries(langs)) bytes[name] = (bytes[name] || 0) + n;
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, pct: (n / total) * 100 }));
  return {
    year, langs,
    rows: [
      ['Dépôts publics', user.public_repos],
      [`Commits publics en ${year}`, commits.total_count],
      ['Pull requests', prs.total_count],
      ['Étoiles reçues', own.reduce((n, r) => n + r.stargazers_count, 0)],
      ['Abonnés', user.followers],
    ],
  };
}

const ACT_H = 184;

async function statsCard(data) {
  const w = CARD_W - SH, PAD = 16;
  const s = new Svg(CARD_W, ACT_H + SH, 'GitHub en chiffres : ' + data.rows.map(([k, v]) => `${k} ${v}`).join(', ') + '.');
  s.rect(SH, SH, w, ACT_H, C.line);
  s.box(0, 0, w, ACT_H, C.panel, C.line);
  s.rect(0, 0, w, 3, C.amber);
  s.icon('branch', PAD, 17, 18, { accent: C.amber });
  s.text(PAD + 28, 31, 'GitHub en chiffres', { size: 14, weight: 800 });
  data.rows.forEach(([label, value], i) => {
    const y = 64 + i * 24;
    s.text(PAD, y, label, { size: 12, fill: C.soft });
    const v = String(value), vx = w - PAD;
    const from = PAD + tw(label, 12) + 10, to = vx - tw(v, 14) - 10;
    for (let x = from; x < to; x += 8) s.rect(Math.round(x), y - 4, 2, 2, C.line);
    s.text(vx, y, v, { size: 14, weight: 800, fill: C.amber, anchor: 'end' });
  });
  return s.render();
}

async function langsCard(data) {
  const w = CARD_W - SH, PAD = 16, colors = [C.amber, C.magenta, C.violet, C.green, C.text, C.muted];
  const s = new Svg(CARD_W, ACT_H + SH, 'Langages des dépôts publics : ' + data.langs.map((l) => `${l.name} ${l.pct.toFixed(1)} %`).join(', ') + '.');
  s.rect(SH, SH, w, ACT_H, C.line);
  s.box(0, 0, w, ACT_H, C.panel, C.line);
  s.rect(0, 0, w, 3, C.violet);
  s.icon('code', PAD, 17, 18, { accent: C.violet });
  s.text(PAD + 28, 31, 'Langages', { size: 14, weight: 800 });
  s.text(w - PAD, 31, 'dépôts publics', { size: 10.5, fill: C.muted, anchor: 'end' });
  // barre empilée à bords francs
  const bw = w - PAD * 2, sum = data.langs.reduce((n, l) => n + l.pct, 0);
  let x = PAD;
  data.langs.forEach((l, i) => {
    const seg = Math.max(2, Math.round((l.pct / sum) * bw));
    const width = i === data.langs.length - 1 ? PAD + bw - x : seg - 2;
    s.rect(x, 52, Math.max(1, width), 12, colors[i]);
    x += seg;
  });
  data.langs.forEach((l, i) => {
    const cx = PAD + (i % 2) * (bw / 2), cy = 92 + Math.floor(i / 2) * 26;
    s.rect(cx, cy - 9, 10, 10, colors[i]);
    s.text(cx + 18, cy, l.name, { size: 12, fill: C.soft });
    s.text(cx + bw / 2 - 28, cy, l.pct.toFixed(1) + ' %', { size: 12, weight: 800, anchor: 'end' });
  });
  return s.render();
}

/* ───────────────────────────── Écriture ────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
const files = {};
const statsOnly = process.argv.includes('--stats');

if (!statsOnly) {
  files['hero.svg'] = await hero();
  for (const [i, [id, title]] of SECTIONS.entries()) files[`h-${id}.svg`] = await heading(String(i + 1).padStart(2, '0'), title);
  const pitchMax = Math.max(...PROJECTS.map((p) => wrap(p.pitch, 50).length));
  for (const p of PROJECTS) files[`card-${p.id}.svg`] = await projectCard(p, pitchMax);
  const bodyMax = Math.max(...STACK.map(stackBodyH));
  for (const g of STACK) files[`stack-${g.id}.svg`] = await stackPanel(g, bodyMax);
  for (const [i, st] of STATS.entries()) files[`stat-${st.id}.svg`] = await statTile(st, i);
  for (const b of BUTTONS) files[`btn-${b.id}.svg`] = await button(b);
}

// Cartes d'activité : régénérées toutes les 6 h par .github/workflows/profile-automation.yml (--stats)
try {
  const data = await fetchActivity();
  files['stats.svg'] = await statsCard(data);
  files['langs.svg'] = await langsCard(data);
} catch (e) {
  console.warn(`  ! cartes d'activité inchangées (${e.message})`);
  if (statsOnly) process.exitCode = 1;
}

let total = 0;
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  total += Buffer.byteLength(svg);
}
console.log(`${Object.keys(files).length} visuels → profile/ui/ (${(total / 1024).toFixed(0)} Ko au total)`);
