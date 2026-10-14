// Regenerates the game list in profile/README.md from the organization's public repositories.
// Usage: GITHUB_TOKEN=... node .github/scripts/update-profile.mjs

import { readFile, writeFile } from "node:fs/promises";

const ORG = process.env.ORG || "YuStellarGamesStudio";
const README = new URL("../../profile/README.md", import.meta.url);
const EXCLUDE = new Set([".github"]);
const GAME_TOPICS = new Set(["game", "browser-game", "html5-game"]);

const GENRES = {
  "survivors-like": "割草", "bullet-hell": "彈幕", "tower-defense": "塔防",
  "stealth-game": "潛行", maze: "迷宮", "whack-a-mole": "打地鼠",
  "idle-game": "放置", "incremental-game": "放置", "merge-game": "合成",
  "shoot-em-up": "射擊", "top-down-shooter": "射擊", "action-rpg": "動作RPG",
  "hack-and-slash": "砍殺", "dungeon-crawler": "地城", "arcade-game": "街機",
  arcade: "街機", "action-game": "動作", "strategy-game": "策略",
  "survival-game": "生存", "cozy-game": "療癒", "dark-fantasy": "暗黑奇幻",
  fantasy: "奇幻", "boss-fights": "Boss 戰", "procedural-generation": "隨機生成",
  "hide-and-seek": "躲貓貓", "creature-collection": "收集",
};
const FEATURES = {
  pwa: "📲 PWA", "offline-first": "📴 離線可玩", "offline-game": "📴 離線可玩",
  "mobile-friendly": "📱 行動裝置", webgpu: "⚡ WebGPU", webgl2: "🧊 WebGL2",
  i18n: "🌐 多語系",
};

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${ORG}-profile-updater`,
  ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
};

async function fetchRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/orgs/${ORG}/repos?type=public&per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
}

// Reads og:image / og:description from the game's homepage, if it has one.
async function fetchMeta(url) {
  if (!url) return {};
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const html = await res.text();
    const meta = (prop) => {
      const tag = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]*>`, "i"))?.[0];
      return tag?.match(/content=["']([^"']*)["']/i)?.[1];
    };
    const image = meta("image");
    return {
      image: image && new URL(image, res.url).href,
      tagline: meta("description"),
    };
  } catch {
    return {};
  }
}

const esc = (s = "") =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const trim = (s = "", n = 120) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const httpsUrl = (url) => url?.replace(/^http:\/\//, "https://") || "";

const badge = (label, color, logo) =>
  `https://img.shields.io/badge/${encodeURIComponent(label).replace(/-/g, "--")}-${color}?style=for-the-badge${logo ? `&logo=${logo}&logoColor=white` : ""}`;

// "《兔兔末日 Bunny Doom》輕鬆類打地鼠遊戲" → { zh: "兔兔末日", en: "Bunny Doom", genre: "輕鬆類打地鼠遊戲" }
// "Hexsurge · 魔潮圍城 — A low-poly ..."     → { zh: "魔潮圍城", en: "Hexsurge", genre: "A low-poly ..." }
function parseTitle(repo) {
  const desc = repo.description || "";
  let title = repo.name;
  let genre = "";
  const bracket = desc.match(/《([^》]+)》\s*(.*)/);
  const dash = desc.match(/^(.+?)\s+[—–-]\s+(.*)$/);
  if (bracket) [, title, genre] = bracket;
  else if (dash) [, title, genre] = dash;
  else genre = desc;
  const parts = title.split(/\s*·\s*|\s+(?=[A-Za-z])|(?<=[A-Za-z!:])\s+(?=[^\x00-\x7F])/);
  const zh = parts.filter((p) => /[^\x00-\x7F]/.test(p)).join(" ");
  const en = parts.filter((p) => !/[^\x00-\x7F]/.test(p)).join(" ");
  return { zh: zh || en || repo.name, en: zh ? en : "", genre };
}

function gameCard(repo, index) {
  const { zh, en, genre } = parseTitle(repo);
  const play = httpsUrl(repo.homepage);
  const cover = repo.meta.image || `https://opengraph.githubassets.com/1/${ORG}/${repo.name}`;
  const topics = repo.topics || [];
  const genres = [...new Set(topics.map((t) => GENRES[t]).filter(Boolean))].slice(0, 4);
  const features = [...new Set(topics.map((t) => FEATURES[t]).filter(Boolean))].slice(0, 3);
  const stage = String(index + 1).padStart(2, "0");
  const link = play || repo.html_url;

  return `<td width="50%" valign="top">
<a href="${esc(link)}"><img src="${esc(cover)}" alt="${esc(zh)} ${esc(en)}" width="100%"></a>
<h3>🎮 ${esc(zh)}${en ? ` <sub>${esc(en)}</sub>` : ""}</h3>
<p><code>STAGE ${stage}</code> ${/[^\x00-\x7F]/.test(genre) ? esc(trim(genre, 60)) : ""}</p>
${repo.meta.tagline ? `<p><i>“${esc(trim(repo.meta.tagline))}”</i></p>\n` : ""}<p>${genres.map((g) => `<code>#${esc(g)}</code>`).join(" ")}${features.length ? `<br><sub>${features.map(esc).join(" · ")}</sub>` : ""}</p>
<p>${play ? `<a href="${esc(play)}"><img src="${badge("▶ PLAY NOW", "ff3e7f")}" alt="Play"></a> ` : ""}<a href="${esc(repo.html_url)}"><img src="${badge("SOURCE", "2b2d42", "github")}" alt="Source"></a></p>
</td>`;
}

function table(cells, cols) {
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(`<tr>\n${cells.slice(i, i + cols).join("\n")}\n</tr>`);
  }
  return `<table>\n${rows.join("\n")}\n</table>`;
}

function baseRow(repo) {
  const site = httpsUrl(repo.homepage);
  return `| [**${repo.name}**](${repo.html_url}) | ${esc(repo.description || "")} | ${site ? `[${site.replace(/^https:\/\//, "").replace(/\/$/, "")}](${site})` : "—"} |`;
}

async function main() {
  const repos = (await fetchRepos())
    .filter((r) => !EXCLUDE.has(r.name) && !r.archived && !r.fork && !r.private)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  const games = repos.filter((r) => r.topics?.some((t) => GAME_TOPICS.has(t)));
  const others = repos.filter((r) => !games.includes(r));
  await Promise.all(games.map(async (g) => (g.meta = await fetchMeta(httpsUrl(g.homepage)))));

  const section = [
    `<p align="center"><img src="${badge(`GAMES UNLOCKED ${games.length}`, "7c4dff")}" alt="Games"> <img src="${badge(`REPOS ${repos.length}`, "00b4d8")}" alt="Repos"></p>`,
    "",
    "## 🕹️ SELECT YOUR GAME",
    "",
    "> 點擊封面即可直接在瀏覽器遊玩 — 免下載、免登入。",
    "",
    table(games.map(gameCard), 2),
    ...(others.length
      ? ["", "## 🛰️ BASE CAMP · 基地設施", "", "| 倉庫 | 說明 | 網站 |", "| --- | --- | --- |", ...others.map(baseRow)]
      : []),
  ].join("\n");

  const readme = await readFile(README, "utf8");
  const updated = readme.replace(
    /(<!-- GAMES:START -->)[\s\S]*?(<!-- GAMES:END -->)/,
    `$1\n${section}\n$2`,
  );
  if (updated === readme) {
    console.log("README unchanged");
    return;
  }
  await writeFile(README, updated);
  console.log(`README updated: ${games.length} games, ${others.length} other repos`);
}

await main();
