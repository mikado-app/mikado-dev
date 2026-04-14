const CACHE_KEY = `mikado_nhl_cache_${today()}`;

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));

    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('mikado_nhl_cache_') && key !== CACHE_KEY) {
        localStorage.removeItem(key);
      }
    }
  } catch(e) {}
}

function loadCache() {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch(e) { return null; }
}
