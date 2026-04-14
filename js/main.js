document.getElementById('header-date').textContent = fmt(today());
document.getElementById('load-btn').onclick = () => loadAll();

async function loadAll(forceReload = false) {
  const btn = document.getElementById('load-btn');
  btn.disabled = true;

  const dateStr = today();
  const season = '20252026';

  const cached = !forceReload ? loadCache() : null;

  if (cached) {
    renderAllMatches(cached);
    btn.disabled = false;
    btn.textContent = '↻ Actualiser';
    btn.onclick = () => loadAll(true);
    return;
  }

  let schedule;
  try {
    schedule = await fetchJSON(`${NHL_API}/schedule/${dateStr}`);
  } catch {
    alert("Erreur API NHL");
    btn.disabled = false;
    return;
  }

  const games = schedule?.gameWeek?.[0]?.games || [];
  const allMatchesData = [];

  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi];
    const home = game.homeTeam;
    const away = game.awayTeam;

    const ar = await cachedFetchJSON(`${NHL_API}/roster/${away.abbrev}/${season}`);
    const hr = await cachedFetchJSON(`${NHL_API}/roster/${home.abbrev}/${season}`);

    const awayRoster = [...(ar.forwards||[]), ...(ar.defensemen||[]), ...(ar.goalies||[])];
    const homeRoster = [...(hr.forwards||[]), ...(hr.defensemen||[]), ...(hr.goalies||[])];

    const teamsData = {};
    teamsData[away.abbrev] = await buildTeamTable(awayRoster, away.abbrev, home.abbrev, season);
    teamsData[home.abbrev] = await buildTeamTable(homeRoster, home.abbrev, away.abbrev, season);

    allMatchesData.push({ game, away, home, teamsData, dateStr });
  }

  saveCache(allMatchesData);
  renderAllMatches(allMatchesData);

  btn.disabled = false;
  btn.textContent = '↻ Actualiser';
  btn.onclick = () => loadAll(true);
}

function renderAllMatches(allMatchesData) {
  const container = document.getElementById('matches-container');
  container.innerHTML = '';

  for (const match of allMatchesData) {
    const { away, home, teamsData, dateStr } = match;

    const section = document.createElement('div');
    section.className = 'match-section';

    section.innerHTML = `
      <div class="match-header">
        <div class="match-title">${away.abbrev} @ ${home.abbrev}</div>
      </div>
      <div class="team-tabs">
        <button class="team-tab" data-abbrev="${away.abbrev}">✈ ${away.abbrev}</button>
        <button class="team-tab" data-abbrev="${home.abbrev}">🏠 ${home.abbrev}</button>
      </div>
      <div class="team-content"></div>
    `;

    const tabs = section.querySelectorAll('.team-tab');
    const content = section.querySelector('.team-content');

    function showTeam(abbrev) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.abbrev === abbrev));
      const rows = teamsData[abbrev];
      const tid = `tbl_${abbrev}_${dateStr}`;
      content.innerHTML = renderTable(rows, tid);
    }

    tabs.forEach(t => t.onclick = () => showTeam(t.dataset.abbrev));
    showTeam(away.abbrev);

    container.appendChild(section);
  }
}
