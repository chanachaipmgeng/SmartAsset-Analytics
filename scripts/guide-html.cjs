#!/usr/bin/env node
// Builds docs/user-guide/index.html from docs/user-guide/README.md.
// Usage: node scripts/guide-html.cjs
// No dependencies: handles the Markdown subset the guide uses (headings, paragraphs,
// lists, tables, blockquotes, fenced code incl. mermaid, images, links, bold, code).
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "docs", "user-guide");
const src = fs
  .readFileSync(path.join(dir, "README.md"), "utf8")
  .replace(/\r\n/g, "\n");

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Same anchors GitHub generates, so links in README.md keep working.
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

// Width/height attributes keep lazy images from shifting the page after a jump to an anchor.
function size(src) {
  try {
    const png = fs.readFileSync(path.join(dir, src));
    return ` width="${png.readUInt32BE(16)}" height="${png.readUInt32BE(20)}"`;
  } catch {
    return "";
  }
}

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${esc(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, src) =>
      `<figure><a class="zoom" href="${src}"><img src="${src}" alt="${alt}"${size(src)} loading="lazy"></a><figcaption>${alt}</figcaption></figure>`,
  );
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const lines = src.split("\n");
const out = [];
const toc = [];
let title = "คู่มือการใช้งาน";

for (let i = 0; i < lines.length;) {
  const line = lines[i];

  if (!line.trim()) {
    i++;
    continue;
  }

  const fence = line.match(/^```(\w*)/);
  if (fence) {
    const body = [];
    for (i++; i < lines.length && !lines[i].startsWith("```"); i++)
      body.push(lines[i]);
    i++;
    out.push(
      fence[1] === "mermaid"
        ? `<pre class="mermaid">${esc(body.join("\n"))}</pre>`
        : `<pre><code>${esc(body.join("\n"))}</code></pre>`,
    );
    continue;
  }

  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const text = h[2].trim();
    const id = slug(text);
    if (level === 1) title = text;
    // The README's own table of contents is replaced by the sidebar.
    if (text === "สารบัญ") {
      for (i++; i < lines.length && !/^(#|---)/.test(lines[i]); i++);
      continue;
    }
    if (level === 2 || level === 3) toc.push({ level, text, id });
    out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
    i++;
    continue;
  }

  // Section rules are redundant: every h2 already has a top border.
  if (/^---+\s*$/.test(line)) {
    i++;
    continue;
  }

  if (line.startsWith(">")) {
    const body = [];
    for (; i < lines.length && lines[i].startsWith(">"); i++)
      body.push(lines[i].replace(/^>\s?/, ""));
    const paras = body
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => `<p>${inline(p.replace(/\n/g, " "))}</p>`);
    out.push(`<blockquote>${paras.join("")}</blockquote>`);
    continue;
  }

  if (
    line.trim().startsWith("|") &&
    /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || "")
  ) {
    const head = cells(line);
    const rows = [];
    for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++)
      rows.push(cells(lines[i]));
    out.push(
      `<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
        rows
          .map(
            (r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
          )
          .join("") +
        "</tbody></table></div>",
    );
    continue;
  }

  const list = line.match(/^\s*(-|\d+\.)\s+/);
  if (list) {
    const tag = list[1] === "-" ? "ul" : "ol";
    const items = [];
    for (; i < lines.length && /^\s*(-|\d+\.)\s+/.test(lines[i]); i++) {
      items.push(
        `<li>${inline(lines[i].replace(/^\s*(-|\d+\.)\s+/, ""))}</li>`,
      );
    }
    out.push(`<${tag}>${items.join("")}</${tag}>`);
    continue;
  }

  const para = [];
  for (
    ;
    i < lines.length &&
    lines[i].trim() &&
    !/^(#|```|>|\s*\||\s*(-|\d+\.)\s|---)/.test(lines[i]);
    i++
  ) {
    para.push(lines[i].trim());
  }
  const html = inline(para.join(" "));
  out.push(
    html.startsWith("<figure>") && html.endsWith("</figure>")
      ? html
      : `<p>${html}</p>`,
  );
}

const nav = toc
  .map((t) => `<a class="l${t.level}" href="#${t.id}">${esc(t.text)}</a>`)
  .join("\n");

const page = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&display=swap">
<style>
:root {
  --bg: #f7f8fb; --fg: #1d2330; --muted: #5d6679; --card: #fff; --line: #e3e7ef;
  --primary: #4f46e5; --primary-soft: #eef0ff; --code: #f1f3f8;
  color-scheme: light;
}
:root.dark {
  --bg: #0f1320; --fg: #e5e8f0; --muted: #9aa3b8; --card: #171c2c; --line: #283048;
  --primary: #8b85ff; --primary-soft: #232848; --code: #1f2538;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 16px; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.75 'IBM Plex Sans Thai', system-ui, 'Segoe UI', sans-serif;
}
.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); }
aside {
  position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 24px 16px;
  border-right: 1px solid var(--line); background: var(--card);
}
.brand { display: flex; align-items: center; gap: 10px; margin: 0 8px 16px; font-weight: 700; }
.brand span { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #06b6d4); color: #fff; }
.tools { display: flex; gap: 8px; margin: 0 8px 16px; }
.tools input { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg); color: var(--fg); font: inherit; font-size: 14px; }
.tools button { border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg);
  cursor: pointer; padding: 0 10px; font-size: 16px; }
nav a { display: block; padding: 5px 8px; border-radius: 6px; color: var(--muted); text-decoration: none;
  font-size: 14px; line-height: 1.5; }
nav a.l3 { padding-left: 22px; font-size: 13px; }
nav a:hover { background: var(--bg); color: var(--fg); }
nav a.active { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
main { max-width: 980px; padding: 40px 48px 96px; }
h1 { font-size: 32px; line-height: 1.3; margin: 0 0 12px; }
h2 { font-size: 24px; margin: 56px 0 12px; padding-top: 16px; border-top: 1px solid var(--line); }
h3 { font-size: 19px; margin: 32px 0 8px; }
a { color: var(--primary); }
code { background: var(--code); padding: 1px 6px; border-radius: 5px; font-size: .88em;
  font-family: ui-monospace, Consolas, monospace; }
pre { background: var(--code); padding: 16px; border-radius: 10px; overflow-x: auto; }
pre.mermaid { background: var(--card); border: 1px solid var(--line); text-align: center; }
blockquote { margin: 16px 0; padding: 12px 16px; border-left: 4px solid var(--primary);
  background: var(--primary-soft); border-radius: 0 10px 10px 0; color: var(--fg); }
blockquote p { margin: 0; }
blockquote p + p { margin-top: 8px; }
figure { margin: 20px 0; }
figure img { display: block; max-width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line);
  box-shadow: 0 6px 24px rgb(15 20 40 / .08); cursor: zoom-in; }
figcaption { margin-top: 6px; color: var(--muted); font-size: 13px; text-align: center; }
.table { overflow-x: auto; margin: 16px 0; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
th, td { padding: 9px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
th { background: var(--bg); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
td figure { margin: 0; }
.lightbox { position: fixed; inset: 0; display: none; place-items: center; padding: 24px;
  background: rgb(8 10 20 / .85); z-index: 10; cursor: zoom-out; }
.lightbox.open { display: grid; }
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; }
.menu-btn { display: none; }
.hide { display: none !important; }
@media (max-width: 900px) {
  html { scroll-padding-top: 64px; }
  .layout { grid-template-columns: 1fr; }
  aside { position: fixed; inset: 0 auto 0 0; width: 300px; z-index: 5; transform: translateX(-100%);
    transition: transform .2s; box-shadow: 0 0 40px rgb(0 0 0 / .2); }
  aside.open { transform: none; }
  main { padding: 64px 18px 64px; }
  .menu-btn { display: block; position: fixed; top: 12px; left: 12px; z-index: 6; width: 40px; height: 40px;
    border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--fg); font-size: 18px; }
}
@media print {
  aside, .menu-btn { display: none; }
  .layout { display: block; }
  main { max-width: none; padding: 0; }
  h2 { break-before: page; border: 0; }
  figure, tr { break-inside: avoid; }
  figure img { box-shadow: none; }
}
</style>
<script>
  if (localStorage.getItem('guide.theme') === 'dark') document.documentElement.classList.add('dark');
</script>
</head>
<body>
<button class="menu-btn" aria-label="สารบัญ">☰</button>
<div class="layout">
<aside>
  <div class="brand"><span>SA</span>SmartAsset Analytics</div>
  <div class="tools">
    <input type="search" placeholder="ค้นหาหัวข้อ..." aria-label="ค้นหาหัวข้อ">
    <button class="theme" title="สลับธีมสว่าง/มืด">◐</button>
  </div>
  <nav>
${nav}
  </nav>
</aside>
<main>
${out.join("\n")}
</main>
</div>
<div class="lightbox"><img alt=""></div>
<script>
  const aside = document.querySelector('aside');
  document.querySelector('.menu-btn').onclick = () => aside.classList.toggle('open');
  document.querySelector('.theme').onclick = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('guide.theme', dark ? 'dark' : 'light');
  };

  const links = [...document.querySelectorAll('nav a')];
  document.querySelector('.tools input').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    links.forEach((a) => a.classList.toggle('hide', !!q && !a.textContent.toLowerCase().includes(q)));
  };
  links.forEach((a) => a.addEventListener('click', () => aside.classList.remove('open')));

  const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('active'));
      const a = byId.get(e.target.id);
      if (!a) continue;
      a.classList.add('active');
      // scrollIntoView here would cancel the page's own smooth scroll to the anchor.
      if (a.offsetTop < aside.scrollTop || a.offsetTop > aside.scrollTop + aside.clientHeight - 40) {
        aside.scrollTop = a.offsetTop - aside.clientHeight / 3;
      }
    }
  }, { rootMargin: '0px 0px -75% 0px' });
  document.querySelectorAll('main h2[id], main h3[id]').forEach((h) => spy.observe(h));

  const box = document.querySelector('.lightbox');
  document.querySelectorAll('a.zoom').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    box.querySelector('img').src = a.getAttribute('href');
    box.classList.add('open');
  }));
  box.onclick = () => box.classList.remove('open');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('open'); });
</script>
<script type="module">
  try {
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
    mermaid.initialize({ startOnLoad: false, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
    await mermaid.run({ querySelector: 'pre.mermaid' });
  } catch {
    // Offline: the diagram stays readable as its source text.
  }
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, "index.html"), page);
console.log(
  `docs/user-guide/index.html: ${toc.length} headings, ${(src.match(/!\[/g) || []).length} images`,
);
