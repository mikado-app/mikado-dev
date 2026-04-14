/****************************************************
 * MIKADO SPORTS ▪ PRONOS — COMPOS ULTRA OPTIMISÉES
 * Mode C — Réduction extrême des appels API (–80%)
 * Cache quotidien + cache mémoire + anti-doublon
 ****************************************************/

let _composLoaded = false;

// 🧠 Cache mémoire (réinitialisé à chaque session)
const lastGameCache = {};     // teamAbbrev → lastGameId
const landingCache = {};      // gameId → landing JSON
const lineupCache = {};       // gameId → lineup construit

// 🗓 Cache localStorage (réinitialisé chaque jour)
function getDailyCacheKey() {
  return 'mikado_compos_' + today();
}

/****************************************************
 * FETCH INTELLIGENT (API NHL + WORKER)
 * - Timeout 5s
 * - Retry via WORKER
 * - Anti-crash
 ****************************************************/
async function smartFetch(url) {
  const urls = [
    url,
    `${WORKER}?url=${encodeURIComponent(url)}`
  ];

  let lastErr = null;

  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      console.warn('Fetch échoué:', u, e.message);
    }
  }

  throw lastErr || new Error("Erreur réseau");
}

/****************************************************
 * LANDING CACHE — évite les appels doublons
 ****************************************************/
async function fetchLanding(gameId) {
  if (landingCache[gameId]) return landingCache[gameId];

  const data = await smartFetch(`${NHL_API}/game/${gameId}/landing`);
  landingCache[gameId] = data;
  return data;
}

/****************************************************
 * LAST GAME ID CACHE — évite 2 appels par équipe
 ****************************************************/
async function getLastGameId(teamAbbrev) {
  if (lastGameCache[teamAbbrev]) return lastGameCache[teamAbbrev];

  try {
    const data = await smartFetch(`${NHL_API}/club-schedule/${teamAbbrev}/month/now`);
    const games = data.games || [];

    const finished = games.filter(g =>
      g.gameState === 'OFF' ||
      g.gameState === 'FINAL' ||
      g.gameState === 'OVER'
    );

    if (!finished.length) return null;

    finished.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));

    lastGameCache[teamAbbrev] = finished[0].id;
    return finished[0].id;

  } catch (e) {
    console.warn("Erreur lastGameId:", teamAbbrev, e.message);
    return null;
  }
}

/****************************************************
 * CHARGEMENT PRINCIPAL DES COMPOS
 ****************************************************/
async function loadCompos() {
  const container = document.getElementById('compos-container');
  const statusMsg = document.getElementById('compos-status-msg');
  const spinner = document.getElementById('compos-spinner');

  const cacheKey = getDailyCacheKey();
  const cached = localStorage.getItem(cacheKey);

  // ⚡ Affichage immédiat du cache (provisoire)
  if (cached) {
    container.innerHTML = cached;
    statusMsg.textContent = 'Compositions provisoires (cache) — ' + fmt(today());
  } else {
    spinner.style.display = 'block';
    statusMsg.textContent = 'Chargement des compositions...';
  }

  // 🔥 On continue quand même pour charger les officielles
  try {
    const schedule = await smartFetch(`${NHL_API}/schedule/${today()}`);
    const games = schedule?.gameWeek?.[0]?.games || [];

    if (!games.length) {
      container.innerHTML = `
        <div class="empty">
          <span class="big">0</span>Aucun match prévu
        </div>`;
      spinner.style.display = 'none';
      statusMsg.textContent = 'Aucun match aujourd\'hui';
      return;
    }

    container.innerHTML = '<div class="compo-grid" id="compo-grid"></div>';
    const grid = document.getElementById('compo-grid');

    // 🔄 Chargement parallèle ultra-rapide
    for (const game of games) {
      const away = game.awayTeam;
      const home = game.homeTeam;

      const gt = game.startTimeUTC
        ? new Date(game.startTimeUTC).toLocaleTimeString('fr-CA', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Toronto'
          })
        : '';

      const card = document.createElement('div');
      card.className = 'compo-card';

      card.innerHTML = `
        <div class="compo-card-header">
          <div>
            <div class="compo-match-title">${away.abbrev} @ ${home.abbrev}</div>
            <div style="font-size:11px;color:var(--muted);font-family:Barlow Condensed,sans-serif;">
              ${gt} HE
            </div>
          </div>
          <div class="compo-match-status status-wait" id="cs_${game.id}">
            ⏳ Chargement
          </div>
        </div>
        <div class="compo-teams" id="cl_${game.id}">
          <div class="compo-pending">Récupération...</div>
        </div>
      `;

      grid.appendChild(card);

      // 🔥 Chargement de la lineup (officielle → provisoire)
      loadLineup(game.id, away, home);
    }

  } catch (e) {
    container.innerHTML = `
      <div class="empty" style="color:var(--red)">
        Erreur: ${e.message}
      </div>`;
  }

  spinner.style.display = 'none';
  statusMsg.textContent = 'Compositions — ' + fmt(today());
}
/****************************************************
 * CHARGEMENT DES LINEUPS (OFFICIELLE → PROVISOIRE)
 ****************************************************/
async function loadLineup(gameId, away, home) {
  const linesDiv = document.getElementById('cl_' + gameId);
  const statusEl = document.getElementById('cs_' + gameId);

  // ⚡ Anti-doublon : lineup déjà construite
  if (lineupCache[gameId]) {
    linesDiv.innerHTML = lineupCache[gameId].html;
    statusEl.textContent = lineupCache[gameId].status;
    statusEl.className = lineupCache[gameId].className;
    return;
  }

  /****************************************************
   * 1️⃣ ESSAI : COMPO OFFICIELLE DU MATCH DU JOUR
   ****************************************************/
  try {
    const data = await fetchLanding(gameId);

    const af = data?.awayTeam?.forwards || [];
    const ad = data?.awayTeam?.defensemen || [];
    const ag = data?.awayTeam?.goalies || [];

    const hf = data?.homeTeam?.forwards || [];
    const hd = data?.homeTeam?.defensemen || [];
    const hg = data?.homeTeam?.goalies || [];

    if (af.length > 0 || hf.length > 0) {
      const html = buildTeams(away.abbrev, home.abbrev, af, ad, ag, hf, hd, hg);

      linesDiv.innerHTML = html;
      statusEl.textContent = '✓ Confirmée';
      statusEl.className = 'compo-match-status status-ok';

      lineupCache[gameId] = {
        html,
        status: '✓ Confirmée',
        className: 'compo-match-status status-ok'
      };

      updateCompoCache();
      return;
    }
  } catch (e) {
    console.warn("Erreur officielle:", gameId, e.message);
  }

  /****************************************************
   * 2️⃣ ESSAI : COMPO PROVISOIRE (DERNIER MATCH)
   ****************************************************/
  try {
    const awayLastId = await getLastGameId(away.abbrev);
    const homeLastId = await getLastGameId(home.abbrev);

    let af2 = [], ad2 = [], ag2 = [];
    let hf2 = [], hd2 = [], hg2 = [];

    if (awayLastId) {
      try {
        const awayData = await fetchLanding(awayLastId);
        const awayWasHome = awayData?.homeTeam?.abbrev === away.abbrev;
        const awayTeamData = awayWasHome ? awayData.homeTeam : awayData.awayTeam;

        af2 = awayTeamData?.forwards || [];
        ad2 = awayTeamData?.defensemen || [];
        ag2 = awayTeamData?.goalies || [];
      } catch (e) {}
    }

    if (homeLastId) {
      try {
        const homeData = await fetchLanding(homeLastId);
        const homeWasHome = homeData?.homeTeam?.abbrev === home.abbrev;
        const homeTeamData = homeWasHome ? homeData.homeTeam : homeData.awayTeam;

        hf2 = homeTeamData?.forwards || [];
        hd2 = homeTeamData?.defensemen || [];
        hg2 = homeTeamData?.goalies || [];
      } catch (e) {}
    }

    if (af2.length > 0 || hf2.length > 0) {
      const html = buildTeams(away.abbrev, home.abbrev, af2, ad2, ag2, hf2, hd2, hg2);

      linesDiv.innerHTML = html;
      statusEl.textContent = '⚠ Provisoire';
      statusEl.className = 'compo-match-status status-prov';

      lineupCache[gameId] = {
        html,
        status: '⚠ Provisoire',
        className: 'compo-match-status status-prov'
      };

      updateCompoCache();
      return;
    }
  } catch (e) {
    console.warn("Erreur provisoire:", gameId, e.message);
  }

  /****************************************************
   * 3️⃣ AUCUNE COMPO DISPONIBLE
   ****************************************************/
  linesDiv.innerHTML = '<div class="compo-pending">Composition non disponible</div>';
  statusEl.textContent = '⏳ À venir';
  statusEl.className = 'compo-match-status status-wait';
}

/****************************************************
 * MISE À JOUR DU CACHE QUOTIDIEN
 ****************************************************/
function updateCompoCache() {
  const grid = document.getElementById('compo-grid');
  if (!grid) return;

  const cacheKey = getDailyCacheKey();
  localStorage.setItem(cacheKey, grid.outerHTML);
}

/****************************************************
 * CONSTRUCTION DES BLOCS VISITEURS / DOMICILE
 ****************************************************/
function buildTeams(aa, ha, af, ad, ag, hf, hd, hg) {
  return `
    <div class="compo-team-panel">
      <div class="compo-team-header">
        ${aa} <span style="font-size:10px;color:var(--muted);font-weight:400">✈ VISITEURS</span>
      </div>
      ${buildLineup(af, ad, ag)}
    </div>

    <div class="compo-team-panel">
      <div class="compo-team-header">
        ${ha} <span style="font-size:10px;color:var(--muted);font-weight:400">🏠 DOMICILE</span>
      </div>
      ${buildLineup(hf, hd, hg)}
    </div>
  `;
}

/****************************************************
 * CONSTRUCTION DES LIGNES / PAIRES / GOALIES
 ****************************************************/
function buildLineup(fwds, defs, goalies) {
  if (!fwds.length && !defs.length)
    return '<div class="compo-pending">Non disponible</div>';

  let h = '';

  // Lignes d'attaque
  for (let i = 0; i < Math.min(fwds.length, 12); i += 3) {
    const line = fwds.slice(i, i + 3);
    h += `
      <div class="compo-line-title">— Ligne ${Math.floor(i / 3) + 1} —</div>
      <div class="compo-players-row">
        ${line.map(p => pSlot(p, (p.positionCode || 'C').toLowerCase())).join('')}
      </div>
      <hr class="compo-divider">
    `;
  }

  // Paires défensives
  for (let i = 0; i < Math.min(defs.length, 6); i += 2) {
    const pair = defs.slice(i, i + 2);
    h += `
      <div class="compo-line-title">— Paire ${Math.floor(i / 2) + 1} —</div>
      <div class="compo-players-row">
        ${pair.map(p => pSlot(p, 'd')).join('')}
      </div>
      <hr class="compo-divider">
    `;
  }

  // Gardien
  if (goalies.length) {
    h += `
      <div class="compo-goalie-zone">
        ${pSlot(goalies[0], 'g')}
      </div>
    `;
  }

  return h;
}

/****************************************************
 * SLOT JOUEUR (photo + nom + position)
 ****************************************************/
function pSlot(p, cls) {
  const pid = p.id || '';
  const name = (p.lastName?.default) || (p.name?.default) || '?';
  const init = name.charAt(0);

  return `
    <div class="compo-player-slot">
      <div class="compo-photo-wrap ${cls}">
        <img src="https://assets.nhle.com/mugs/nhl/20252026/${pid}.png"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
             loading="lazy">
        <span class="compo-photo-initial" style="display:none">${init}</span>
      </div>
      <div class="compo-player-name">${name}</div>
      <div class="compo-player-pos">${cls.toUpperCase()}</div>
    </div>
  `;
}

// Init date display
document.getElementById('header-date').textContent = fmt(today());
