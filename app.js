const NHL_API = 'https://api-web.nhle.com/v1';
const WORKER = 'https://nhl-proxy.973vybration.workers.dev';

async function fetchJSON(url) {
  // Essaie d'abord directement, puis via le Worker Cloudflare
  const urls = [
    url,
    `${WORKER}?url=${encodeURIComponent(url)}`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch(e) {
      lastErr = e;
      console.warn('Tentative echouee:', u, e.message);
    }
  }
  throw new Error(`Connexion impossible: ${lastErr?.message}`);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmt(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function setStatus(msg, spinning=false) {
  document.getElementById('status-msg').textContent = msg;
  document.getElementById('spinner').style.display = spinning ? 'block' : 'none';
}

// Get game log for a player (last N games)
async function getPlayerGameLog(playerId, season) {
  try {
    const data = await fetchJSON(`${NHL_API}/player/${playerId}/game-log/${season}/2`);
    return data.gameLog || [];
  } catch { return []; }
}

// Sum stats over last N games
function sumStats(log, n) {
  const games = log.slice(0, n);
  let pts=0, g=0, a=0;
  for (const gm of games) {
    pts += (gm.points || 0);
    g   += (gm.goals  || 0);
    a   += (gm.assists|| 0);
  }
  return { pts, g, a, count: games.length };
}

// Check if player is on a back-to-back (played yesterday)
function isB2B(log) {
  if (!log.length) return false;
  const lastGame = new Date(log[0].gameDate);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  return lastGame.toDateString() === yesterday.toDateString();
}

// Count B2B points this season
function b2bPoints(log) {
  let pts = 0;
  for (let i = 0; i < log.length - 1; i++) {
    const d1 = new Date(log[i].gameDate);
    const d2 = new Date(log[i+1].gameDate);
    const diff = Math.abs(d1 - d2) / 86400000;
    if (diff <= 1) pts += (log[i].points || 0);
  }
  return pts;
}

// H2H stats vs specific opponent
function h2hStats(log, oppAbbrev) {
  const games = log.filter(g => g.opponentAbbrev === oppAbbrev);
  const pts = games.reduce((s,g) => s+(g.points||0), 0);
  return { pts, gp: games.length };
}

// H2H across multiple seasons
async function h2hMultiSeason(playerId, oppAbbrev) {
  const seasons = ['20252026','20242025','20232024','20222023','20222023'];
  let totalPts = 0, totalGP = 0;
  for (const s of seasons) {
    try {
      const data = await fetchJSON(`${NHL_API}/player/${playerId}/game-log/${s}/2`);
      const log = data.gameLog || [];
      const { pts, gp } = h2hStats(log, oppAbbrev);
      totalPts += pts; totalGP += gp;
    } catch {}
  }
  return { pts: totalPts, gp: totalGP };
}

function valClass(v) {
  if (v === 0) return 'val-zero';
  if (v >= 3) return 'val-high';
  if (v >= 1) return 'val-mid';
  return 'val-low';
}

function h2hText(pts, gp) {
  if (gp === 0) return '<span class="val-zero">—</span>';
  return `<span class="h2h">${pts}pt / ${gp}M</span>`;
}