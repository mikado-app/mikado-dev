function sumStats(log, n) {
  const games = log.slice(0, n);
  let pts=0, g=0, a=0;
  for (const gm of games) {
    pts += gm.points || 0;
    g   += gm.goals  || 0;
    a   += gm.assists|| 0;
  }
  return { pts, g, a, count: games.length };
}

function isB2B(log) {
  if (!log.length) return false;
  const last = new Date(log[0].gameDate + "T00:00:00Z");
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  return last.toISOString().slice(0,10) === y.toISOString().slice(0,10);
}

function b2bPoints(log) {
  let pts = 0;
  for (let i = 0; i < log.length - 1; i++) {
    const d1 = new Date(log[i].gameDate);
    const d2 = new Date(log[i+1].gameDate);
    if (Math.abs(d1 - d2) / 86400000 <= 1) pts += log[i].points || 0;
  }
  return pts;
}

function h2hStats(log, opp) {
  const games = log.filter(g => g.opponentAbbrev === opp);
  const pts = games.reduce((s,g) => s+(g.points||0), 0);
  return { pts, gp: games.length };
}

async function h2hMultiSeason(pid, opp) {
  const seasons = ['20252026','20242025','20232024','20222023','20212022'];
  let totalPts = 0, totalGP = 0;

  for (const s of seasons) {
    try {
      const data = await cachedFetchJSON(`${NHL_API}/player/${pid}/game-log/${s}/2`);
      const log = data.gameLog || [];
      const { pts, gp } = h2hStats(log, opp);
      totalPts += pts;
      totalGP += gp;
    } catch {}
  }
  return { pts: totalPts, gp: totalGP };
}

async function fetchPlayerData(player, opp, season) {
  const pid = player.id;
  const pos = player.positionCode || '?';

  let log = [];
  try {
    const data = await cachedFetchJSON(`${NHL_API}/player/${pid}/game-log/${season}/2`);
    log = data.gameLog || [];
  } catch {}

  const s10 = sumStats(log, 10);
  const s5  = sumStats(log, 5);
  const s2  = sumStats(log, 2);
  const s1  = sumStats(log, 1);

  const b2b = b2bPoints(log);
  const onB2B = isB2B(log);
  const h2hSzn = h2hStats(log, opp);

  let h2h5 = { pts:0, gp:0 };
  if (pos !== 'G') {
    try { h2h5 = await h2hMultiSeason(pid, opp); } catch {}
  }

  return {
    name: `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim(),
    pos,
    pts10: s10.pts, g10: s10.g, a10: s10.a,
    pts5: s5.pts, pts2: s2.pts, pts1: s1.pts,
    b2b, onB2B,
    h2hSznPts: h2hSzn.pts, h2hSznGP: h2hSzn.gp,
    h2h5Pts: h2h5.pts, h2h5GP: h2h5.gp,
    pid
  };
}

async function buildTeamTable(roster, team, opp, season) {
  const rows = [];
  for (const p of roster) {
    rows.push(await fetchPlayerData(p, opp, season));
  }
  rows.sort((a,b) => b.pts10 - a.pts10 || b.pts5 - a.pts5);
  return rows;
}
