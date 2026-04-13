let _composLoaded = false;
function showPage(page) {
  document.getElementById('page-matchs').style.display = page === 'matchs' ? 'block' : 'none';
  document.getElementById('page-compos').style.display = page === 'compos' ? 'block' : 'none';
  document.getElementById('tab-matchs').classList.toggle('active', page === 'matchs');
  document.getElementById('tab-compos').classList.toggle('active', page === 'compos');
  const loadBtn = document.getElementById('load-btn');
  loadBtn.style.display = page === 'matchs' ? '' : 'none';
  if (page === 'compos' && !_composLoaded) {
    _composLoaded = true;
    loadCompos();
  }
}

async function loadCompos() {
  const container = document.getElementById('compos-container');
  const statusMsg = document.getElementById('compos-status-msg');
  const spinner = document.getElementById('compos-spinner');
  const cacheKey = 'mikado_compos_' + today();
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    container.innerHTML = cached;
    statusMsg.textContent = 'Compositions du cache — ' + fmt(today());
    return;
  }
  spinner.style.display = 'block';
  statusMsg.textContent = 'Chargement des compositions...';
  try {
    const schedule = await fetchJSON(NHL_API + '/schedule/' + today());
    const games = schedule?.gameWeek?.[0]?.games || [];
    if (!games.length) {
      container.innerHTML = '<div class="empty"><span class="big">0</span>Aucun match prévu</div>';
      spinner.style.display = 'none';
      statusMsg.textContent = 'Aucun match aujourd\'hui';
      return;
    }
    container.innerHTML = '<div class="compo-grid" id="compo-grid"></div>';
    const grid = document.getElementById('compo-grid');
    for (const game of games) {
      const away = game.awayTeam;
      const home = game.homeTeam;
      const gt = game.startTimeUTC ? new Date(game.startTimeUTC).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit',timeZone:'America/Toronto'}) : '';
      const card = document.createElement('div');
      card.className = 'compo-card';
      card.innerHTML = '<div class="compo-card-header"><div><div class="compo-match-title">' + away.abbrev + ' @ ' + home.abbrev + '</div><div style="font-size:11px;color:var(--muted);font-family:Barlow Condensed,sans-serif;">' + gt + ' HE</div></div><div class="compo-match-status status-wait" id="cs_' + game.id + '">⏳ Chargement</div></div><div class="compo-teams" id="cl_' + game.id + '"><div class="compo-pending">Récupération...</div></div>';
      grid.appendChild(card);
      loadLineup(game.id, away, home);
    }
    setTimeout(function() {
      const h = document.getElementById('compo-grid');
      if (h) localStorage.setItem(cacheKey, h.outerHTML);
    }, 60000);
  } catch(e) {
    container.innerHTML = '<div class="empty" style="color:var(--red)">Erreur: ' + e.message + '</div>';
  }
  spinner.style.display = 'none';
  statusMsg.textContent = 'Compositions — ' + fmt(today());
}

async function getLastGameId(teamAbbrev) {
  try {
    const data = await fetchJSON(NHL_API + '/club-schedule/' + teamAbbrev + '/month/now');
    const games = data.games || [];
    // Chercher le dernier match terminé (gameState OFF ou FINAL)
    const finished = games.filter(function(g) {
      return g.gameState === 'OFF' || g.gameState === 'FINAL' || g.gameState === 'OVER';
    });
    if (finished.length === 0) return null;
    // Retourner le plus récent
    finished.sort(function(a, b) {
      return new Date(b.gameDate) - new Date(a.gameDate);
    });
    return finished[0].id;
  } catch(e) {
    return null;
  }
}

async function loadLineup(gameId, away, home) {
  const linesDiv = document.getElementById('cl_' + gameId);
  const statusEl = document.getElementById('cs_' + gameId);

  // Essai 1 — alignement officiel du match d'aujourd'hui
  try {
    const data = await fetchJSON(NHL_API + '/game/' + gameId + '/landing');
    const af = data?.awayTeam?.forwards || [];
    const ad = data?.awayTeam?.defensemen || [];
    const ag = data?.awayTeam?.goalies || [];
    const hf = data?.homeTeam?.forwards || [];
    const hd = data?.homeTeam?.defensemen || [];
    const hg = data?.homeTeam?.goalies || [];
    if (af.length > 0 || hf.length > 0) {
      linesDiv.innerHTML = buildTeams(away.abbrev, home.abbrev, af, ad, ag, hf, hd, hg);
      if (statusEl) { statusEl.textContent = '✓ Confirmée'; statusEl.className = 'compo-match-status status-ok'; }
      return;
    }
  } catch(e) {}

  // Essai 2 — dernier match joué de chaque équipe
  try {
    const awayLastId = await getLastGameId(away.abbrev);
    const homeLastId = await getLastGameId(home.abbrev);

    let af2 = [], ad2 = [], ag2 = [];
    let hf2 = [], hd2 = [], hg2 = [];

    if (awayLastId) {
      try {
        const awayData = await fetchJSON(NHL_API + '/game/' + awayLastId + '/landing');
        // Trouver si l'équipe était visiteur ou domicile
        const awayWasHome = awayData?.homeTeam?.abbrev === away.abbrev;
        const awayTeamData = awayWasHome ? awayData?.homeTeam : awayData?.awayTeam;
        af2 = awayTeamData?.forwards || [];
        ad2 = awayTeamData?.defensemen || [];
        ag2 = awayTeamData?.goalies || [];
      } catch(e) {}
    }

    if (homeLastId) {
      try {
        const homeData = await fetchJSON(NHL_API + '/game/' + homeLastId + '/landing');
        const homeWasHome = homeData?.homeTeam?.abbrev === home.abbrev;
        const homeTeamData = homeWasHome ? homeData?.homeTeam : homeData?.awayTeam;
        hf2 = homeTeamData?.forwards || [];
        hd2 = homeTeamData?.defensemen || [];
        hg2 = homeTeamData?.goalies || [];
      } catch(e) {}
    }

    if (af2.length > 0 || hf2.length > 0) {
      linesDiv.innerHTML = buildTeams(away.abbrev, home.abbrev, af2, ad2, ag2, hf2, hd2, hg2);
      if (statusEl) { statusEl.textContent = '⚠ Provisoire'; statusEl.className = 'compo-match-status status-prov'; }
      return;
    }
  } catch(e) {}

  // Rien trouvé
  if (linesDiv) linesDiv.innerHTML = '<div class="compo-pending">Composition non disponible</div>';
  if (statusEl) { statusEl.textContent = '⏳ À venir'; statusEl.className = 'compo-match-status status-wait'; }
}

function buildTeams(aa, ha, af, ad, ag, hf, hd, hg) {
  return '<div class="compo-team-panel"><div class="compo-team-header">' + aa + ' <span style="font-size:10px;color:var(--muted);font-weight:400">✈ VISITEURS</span></div>' + buildLineup(af,ad,ag) + '</div><div class="compo-team-panel"><div class="compo-team-header">' + ha + ' <span style="font-size:10px;color:var(--muted);font-weight:400">🏠 DOMICILE</span></div>' + buildLineup(hf,hd,hg) + '</div>';
}

function pSlot(p, cls) {
  const pid = p.id || '';
  const name = (p.lastName && p.lastName.default) ? p.lastName.default : (p.name && p.name.default ? p.name.default : '?');
  const init = name.charAt(0);
  return '<div class="compo-player-slot"><div class="compo-photo-wrap ' + cls + '"><img src="https://assets.nhle.com/mugs/nhl/20252026/' + pid + '.png" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" loading="lazy"><span class="compo-photo-initial" style="display:none">' + init + '</span></div><div class="compo-player-name">' + name + '</div><div class="compo-player-pos">' + cls.toUpperCase() + '</div></div>';
}

function buildLineup(fwds, defs, goalies) {
  if (!fwds.length && !defs.length) return '<div class="compo-pending">Non disponible</div>';
  let h = '';
  for (let i = 0; i < Math.min(fwds.length,12); i+=3) {
    const line = fwds.slice(i,i+3);
    h += '<div class="compo-line-title">— Ligne ' + (Math.floor(i/3)+1) + ' —</div><div class="compo-players-row">' + line.map(function(p){return pSlot(p,(p.positionCode||'C').toLowerCase());}).join('') + '</div><hr class="compo-divider">';
  }
  for (let i = 0; i < Math.min(defs.length,6); i+=2) {
    const pair = defs.slice(i,i+2);
    h += '<div class="compo-line-title">— Paire ' + (Math.floor(i/2)+1) + ' —</div><div class="compo-players-row">' + pair.map(function(p){return pSlot(p,'d');}).join('') + '</div><hr class="compo-divider">';
  }
  if (goalies.length) h += '<div class="compo-goalie-zone">' + pSlot(goalies[0],'g') + '</div>';
  return h;
}

// Init date display
document.getElementById('header-date').textContent = fmt(today());
