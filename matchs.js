async function fetchPlayerData(player, oppAbbrev, season) {
  const pid = player.id;
  const pos = player.positionCode || '?';

  let log = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await fetchJSON(`${NHL_API}/player/${pid}/game-log/20252026/2`);
      log = data.gameLog || [];
      break;
    } catch { await new Promise(r => setTimeout(r, 800)); }
  }

  const s10 = sumStats(log, 10);
  const s5  = sumStats(log, 5);
  const s2  = sumStats(log, 2);
  const s1  = sumStats(log, 1);
  const b2b = b2bPoints(log);
  const onB2B = isB2B(log);
  const h2hSzn = h2hStats(log, oppAbbrev);

  let h2h5 = { pts: 0, gp: 0 };
  if (pos !== 'G') {
    try { h2h5 = await h2hMultiSeason(pid, oppAbbrev); } catch {}
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

async function buildTeamTable(roster, teamAbbrev, oppAbbrev, season, gameId) {
  const rows = [];
  for (const player of roster) {
    const row = await fetchPlayerData(player, oppAbbrev, season);
    rows.push(row);
  }
  rows.sort((a,b) => b.pts10 - a.pts10 || b.pts5 - a.pts5);
  return rows;
}

function teamLogoHTML(abbrev, darkLogo) {
  const logo = darkLogo || `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`;
  return `<img src="${logo}" alt="${abbrev}" style="width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 0 4px rgba(0,0,0,0.5))">`;
}

function renderTable(rows, tableId) {
  return `
  <div class="table-wrap">
  <table id="${tableId}">
    <thead>
      <tr>
        <th>#</th>
        <th onclick="sortTable('${tableId}',1)" title="Nom">Joueur</th>
        <th onclick="sortTable('${tableId}',2)" title="Position">Pos</th>
        <th onclick="sortTable('${tableId}',3)" class="sorted" title="Points 10 derniers matchs">Pts<br>10M</th>
        <th onclick="sortTable('${tableId}',4)" title="Points 5 derniers matchs">Pts<br>5M</th>
        <th onclick="sortTable('${tableId}',5)" title="Points 2 derniers matchs">Pts<br>2M</th>
        <th onclick="sortTable('${tableId}',6)" title="Points au dernier match">Pts<br>Der.</th>
        <th onclick="sortTable('${tableId}',7)" title="Passes 10 derniers matchs">Passe<br>10M</th>
        <th onclick="sortTable('${tableId}',8)" title="Buts 10 derniers matchs">But<br>10M</th>
        <th onclick="sortTable('${tableId}',9)" title="Points en back-to-back">Pts<br>B2B</th>
        <th onclick="sortTable('${tableId}',10)" title="Points face à l'adversaire cette saison">H2H<br>Saison</th>
        <th onclick="sortTable('${tableId}',11)" title="Points face à l'adversaire 5 dernières saisons">H2H<br>5 Saisons</th>
      </tr>
    </thead>
    <tbody>
    ${rows.map((r,i) => `
      <tr>
        <td class="rank">${i+1}</td>
        <td>${r.name}${r.onB2B ? ' <span style="color:var(--accent);font-size:10px" title="Match hier aussi">B2B</span>' : ''}</td>
        <td><span class="pos-badge pos-${r.pos}">${r.pos}</span></td>
        <td class="${valClass(r.pts10)}">${r.pts10}</td>
        <td class="${valClass(r.pts5)}">${r.pts5}</td>
        <td class="${valClass(r.pts2)}">${r.pts2}</td>
        <td class="${valClass(r.pts1)}">${r.pts1}</td>
        <td class="${valClass(r.a10)}">${r.a10}</td>
        <td class="${valClass(r.g10)}">${r.g10}</td>
        <td class="${r.b2b > 0 ? 'b2b-yes' : 'val-zero'}">${r.b2b || '—'}</td>
        <td>${h2hText(r.h2hSznPts, r.h2hSznGP)}</td>
        <td>${h2hText(r.h2h5Pts, r.h2h5GP)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>`;
}

function sortTable(tableId, colIdx) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const ths = table.querySelectorAll('th');
  ths.forEach(t => t.classList.remove('sorted'));
  ths[colIdx].classList.add('sorted');
  rows.sort((a,b) => {
    const av = parseFloat(a.cells[colIdx]?.textContent) || 0;
    const bv = parseFloat(b.cells[colIdx]?.textContent) || 0;
    return bv - av;
  });
  rows.forEach((r,i) => { r.cells[0].textContent = i+1; tbody.appendChild(r); });
}

function exportCSV(rows, filename) {
  const headers = ['Rang','Joueur','Position','Pts 10M','Pts 5M','Pts 2M','Pts Der.','Passes 10M','Buts 10M','Pts B2B','H2H Saison','H2H 5 Saisons'];
  const csvRows = [headers.join(',')];
  rows.forEach((r,i) => {
    csvRows.push([
      i+1,
      `"${r.name}"`, r.pos, r.pts10, r.pts5, r.pts2, r.pts1,
      r.a10, r.g10, r.b2b,
      `"${r.h2hSznPts}pt/${r.h2hSznGP}M"`,
      `"${r.h2h5Pts}pt/${r.h2h5GP}M"`
    ].join(','));
  });
  const blob = new Blob([csvRows.join('\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

const tableData = {};

function saveCache(data) {
  try {
    const key = `mikado_nhl_cache_${today()}`;
    localStorage.setItem(key, JSON.stringify(data));
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('mikado_nhl_cache_') && k !== key) localStorage.removeItem(k);
    }
  } catch(e) {}
}

function loadCache() {
  try {
    const key = `mikado_nhl_cache_${today()}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch(e) { return null; }
}

function buildMatchHeader(away, home, gameTime, venue) {
  const awayLogo = away.darkLogo || `https://assets.nhle.com/logos/nhl/svg/${away.abbrev}_dark.svg`;
  const homeLogo = home.darkLogo || `https://assets.nhle.com/logos/nhl/svg/${home.abbrev}_dark.svg`;
  return `
    <div class="match-header">
      <div class="match-vs">
        <div class="match-team-block">
          <img src="${awayLogo}" class="team-logo" alt="${away.abbrev}">
          <span class="match-team-abbrev">${away.abbrev}</span>
        </div>
        <div class="match-center">
          <div class="match-at">@</div>
          <div class="match-time">${gameTime} HE</div>
        </div>
        <div class="match-team-block">
          <img src="${homeLogo}" class="team-logo" alt="${home.abbrev}">
          <span class="match-team-abbrev">${home.abbrev}</span>
        </div>
      </div>
      <div class="match-venue">${venue}</div>
    </div>`;
}

function buildTabHTML(abbrev, logo, isAway) {
  return `${isAway ? '✈' : '🏠'} <img src="${logo}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin:0 4px"> ${abbrev}`;
}

async function loadAll(forceReload = false) {
  const btn = document.getElementById('load-btn');
  btn.disabled = true;
  document.getElementById('legend').style.display = 'none';

  const dateStr = today();
  document.getElementById('header-date').textContent = fmt(dateStr);

  if (!forceReload) {
    const cached = loadCache();
    if (cached) {
      setStatus(`✓ Données du cache — ${dateStr} · Clique "Actualiser" pour recharger`, false);
      document.getElementById('matches-container').innerHTML = '';
      document.getElementById('legend').style.display = 'block';
      renderAllMatches(cached);
      btn.disabled = false;
      btn.textContent = '↻ Actualiser';
      btn.onclick = () => loadAll(true);
      return;
    }
  }

  setStatus('Récupération des matchs du jour...', true);

  let schedule;
  try {
    schedule = await fetchJSON(`${NHL_API}/schedule/${dateStr}`);
  } catch(e) {
    setStatus('Connexion échouée — réessaie dans quelques secondes.');
    document.getElementById('matches-container').innerHTML = `
      <div class="empty">
        <span class="big" style="font-size:28px;color:var(--red)">Connexion échouée</span>
        <p style="margin-top:1rem;font-size:13px;color:var(--muted);line-height:2;text-align:left;max-width:480px;margin-left:auto;margin-right:auto">
          <strong style="color:var(--text)">Solutions :</strong><br>
          1. Désactive ton bloqueur de pub<br>
          2. Réessaie dans quelques secondes<br>
          3. Utilise Chrome ou Edge
        </p>
        <button onclick="loadAll()" style="margin-top:1.5rem;background:var(--accent);color:#0a0c10;border:none;padding:10px 24px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;cursor:pointer;border-radius:4px;text-transform:uppercase">↻ Réessayer</button>
      </div>`;
    btn.disabled = false;
    return;
  }

  const games = schedule?.gameWeek?.[0]?.games || [];
  if (!games.length) {
    document.getElementById('matches-container').innerHTML = `<div class="empty"><span class="big">0</span>Aucun match prévu aujourd'hui</div>`;
    setStatus('Aucun match trouvé.');
    btn.disabled = false;
    return;
  }

  document.getElementById('matches-container').innerHTML = '';
  document.getElementById('legend').style.display = 'block';

  const season = '20252026';
  const allMatchesData = [];

  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi];
    const home = game.homeTeam;
    const away = game.awayTeam;
    const gameTime = game.startTimeUTC ? new Date(game.startTimeUTC).toLocaleTimeString('fr-CA', {hour:'2-digit', minute:'2-digit', timeZone:'America/Toronto'}) : '';
    const venue = game.venue?.default || '';
    const matchId = `match_${gi}`;

    setStatus(`Chargement ${away.abbrev} @ ${home.abbrev} (${gi+1}/${games.length})...`, true);

    const section = document.createElement('div');
    section.className = 'match-section';
    section.innerHTML = buildMatchHeader(away, home, gameTime, venue) + `
      <div id="tabs_${matchId}" class="team-tabs"></div>
      <div id="content_${matchId}"></div>`;
    document.getElementById('matches-container').appendChild(section);

    let awayRoster = [], homeRoster = [];
    try {
      const ar = await fetchJSON(`${NHL_API}/roster/${away.abbrev}/${season}`);
      awayRoster = [...(ar.forwards||[]), ...(ar.defensemen||[]), ...(ar.goalies||[])];
    } catch {}
    try {
      const hr = await fetchJSON(`${NHL_API}/roster/${home.abbrev}/${season}`);
      homeRoster = [...(hr.forwards||[]), ...(hr.defensemen||[]), ...(hr.goalies||[])];
    } catch {}

    const teamsData = {};
    for (const [abbrev, roster, opp] of [[away.abbrev, awayRoster, home.abbrev], [home.abbrev, homeRoster, away.abbrev]]) {
      setStatus(`Analyse ${abbrev} vs ${opp} — ${roster.length} joueurs...`, true);
      const rows = await buildTeamTable(roster, abbrev, opp, season, game.id);
      teamsData[abbrev] = rows;
      tableData[`${matchId}_${abbrev}`] = rows;
    }

    allMatchesData.push({ game, away, home, teamsData, matchId, gameTime, venue, dateStr });

    const tabsEl = document.getElementById(`tabs_${matchId}`);
    const contentEl = document.getElementById(`content_${matchId}`);

    (function(away, home, teamsData, matchId, dateStr) {
      function showTeam(abbrev) {
        tabsEl.querySelectorAll('.team-tab').forEach(t => t.classList.toggle('active', t.dataset.abbrev === abbrev));
        const rows = teamsData[abbrev];
        const tid = `tbl_${matchId}_${abbrev}`;
        const oppAbbrev = abbrev === away.abbrev ? home.abbrev : away.abbrev;
        contentEl.innerHTML = `
          <div class="export-row">
            <button class="btn-sm" onclick="exportCSV(tableData['${matchId}_${abbrev}'],'${abbrev}_vs_${oppAbbrev}_${dateStr}.csv')">Exporter CSV</button>
          </div>
          ${renderTable(rows, tid)}
          <p class="note">Trié par Pts 10M · Clique sur un en-tête de colonne pour retrier · H2H = face-à-face · B2B = back-to-back</p>`;
      }

      for (const [abbrev, teamObj] of [[away.abbrev, away], [home.abbrev, home]]) {
        const isAway = abbrev === away.abbrev;
        const logo = teamObj.darkLogo || `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`;
        const tab = document.createElement('button');
        tab.className = 'team-tab';
        tab.dataset.abbrev = abbrev;
        tab.innerHTML = buildTabHTML(abbrev, logo, isAway);
        tab.onclick = () => showTeam(abbrev);
        tabsEl.appendChild(tab);
      }
      showTeam(away.abbrev);
    })(away, home, teamsData, matchId, dateStr);
  }

  saveCache(allMatchesData);
  setStatus(`✓ ${games.length} match${games.length>1?'s':''} chargé${games.length>1?'s':''} — ${today()}`, false);
  btn.disabled = false;
  btn.textContent = '↻ Actualiser';
  btn.onclick = () => loadAll(true);
}

function renderAllMatches(allMatchesData) {
  for (const matchData of allMatchesData) {
    const { away, home, teamsData, dateStr } = matchData;
    const matchId = matchData.matchId;

    const section = document.createElement('div');
    section.className = 'match-section';
    section.innerHTML = buildMatchHeader(away, home, matchData.gameTime, matchData.venue) + `
      <div id="tabs_${matchId}" class="team-tabs"></div>
      <div id="content_${matchId}"></div>`;
    document.getElementById('matches-container').appendChild(section);

    const tabsEl = document.getElementById(`tabs_${matchId}`);
    const contentEl = document.getElementById(`content_${matchId}`);

    for (const [abbrev, rows] of Object.entries(teamsData)) {
      tableData[`${matchId}_${abbrev}`] = rows;
    }

    function showTeam(abbrev) {
      tabsEl.querySelectorAll('.team-tab').forEach(t => t.classList.toggle('active', t.dataset.abbrev === abbrev));
      const rows = teamsData[abbrev];
      const tid = `tbl_${matchId}_${abbrev}`;
      const oppAbbrev = abbrev === away.abbrev ? home.abbrev : away.abbrev;
      contentEl.innerHTML = `
        <div class="export-row">
          <button class="btn-sm" onclick="exportCSV(tableData['${matchId}_${abbrev}'],'${abbrev}_vs_${oppAbbrev}_${dateStr}.csv')">Exporter CSV</button>
        </div>
        ${renderTable(rows, tid)}
        <p class="note">Trié par Pts 10M · Clique sur un en-tête de colonne pour retrier · H2H = face-à-face · B2B = back-to-back</p>`;
    }

    for (const [abbrev, teamObj] of [[away.abbrev, away], [home.abbrev, home]]) {
      const isAway = abbrev === away.abbrev;
      const logo = teamObj.darkLogo || `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`;
      const tab = document.createElement('button');
      tab.className = 'team-tab';
      tab.dataset.abbrev = abbrev;
      tab.innerHTML = buildTabHTML(abbrev, logo, isAway);
      tab.onclick = () => showTeam(abbrev);
      tabsEl.appendChild(tab);
    }
    showTeam(away.abbrev);
  }
}

// Init date display
document.getElementById('header-date').textContent = fmt(today());
