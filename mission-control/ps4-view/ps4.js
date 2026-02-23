const el = {
  rows: document.getElementById('rows'),
  counts: document.getElementById('counts'),
  freshness: document.getElementById('freshness'),
  refreshBtn: document.getElementById('refreshBtn'),
  exportCategoriesBtn: document.getElementById('exportCategoriesBtn'),
  inspector: document.getElementById('inspector'),
  iTitle: document.getElementById('iTitle'),
  iMeta: document.getElementById('iMeta'),
  closeInspector: document.getElementById('closeInspector'),
  cmdBtn: document.getElementById('cmdBtn'),
  palette: document.getElementById('palette'),
  paletteInput: document.getElementById('paletteInput'),
  paletteList: document.getElementById('paletteList'),
};

const state = {
  layout: null,
  activeCategory: 'home',
  categoryCursor: 0,
  gameCursor: 0,
  focusRow: 'categories',
};

let laneSwapTimer = null;
let paletteActions = [];
let paletteCursor = 0;

async function loadLayout() {
  const res = await fetch('/api/ps4-layout');
  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error || 'Failed loading layout');
  state.layout = payload.layout;
  state.activeCategory = 'home';
  state.categoryCursor = 0;
  state.gameCursor = 0;
  state.focusRow = 'categories';
  render();
}

function updateTopbar(activeCat) {
  if (!state.layout) return;
  const cat = activeCat || categories().find((c) => c.id === state.activeCategory) || categories()[0];
  if (cat) {
    el.counts.textContent = `${state.layout.counts.games} games · ${state.layout.counts.folders} folders · Viewing ${cat.title}`;
  }
  if (el.freshness) {
    const dt = state.layout.generatedAt ? new Date(state.layout.generatedAt) : null;
    const stamp = dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleString()
      : 'Unknown';
    el.freshness.textContent = `Data freshness: ${stamp}`;
  }
}

function categories() {
  if (!state.layout) return [];
  const homeThumb = state.layout.rootGames[0]?.thumbUrl || '';
  return [
    { id: 'home', title: 'Home', gameCount: state.layout.rootGames.length, thumbUrl: homeThumb },
    ...state.layout.folders.map((f) => ({
      id: f.id,
      title: f.name,
      gameCount: f.games.length,
      thumbUrl: f.games[0]?.thumbUrl || '',
    })),
  ];
}

function activeGames() {
  if (!state.layout) return [];
  if (state.activeCategory === 'home') return state.layout.rootGames;
  const folder = state.layout.folders.find((f) => f.id === state.activeCategory);
  return folder ? folder.games : [];
}

function render() {
  if (!state.layout) return;
  const cats = categories();
  if (state.categoryCursor >= cats.length) state.categoryCursor = Math.max(0, cats.length - 1);
  const games = activeGames();
  if (state.gameCursor >= games.length) state.gameCursor = Math.max(0, games.length - 1);

  const activeCat = cats.find((c) => c.id === state.activeCategory) || cats[0];
  updateTopbar(activeCat);

  el.rows.innerHTML = `
    <section class="shell-head">
      <div class="breadcrumbs"><span class="crumb active">Home Screen</span></div>
      <div class="hint">Controls: ← → move · ↑ ↓ switch rows · Enter select · Esc back to Home</div>
    </section>

    <section class="lane-row">
      <h3>Categories</h3>
      <div class="scroller category-lane ${cats.length <= 8 ? "fit-all" : ""}" id="categoryLane" style="--cat-count:${cats.length}">
        ${cats.map((c, idx) => categoryTile(c, idx)).join('')}
      </div>
    </section>

    <section class="lane-row">
      <h3 id="gameLaneTitle">${escapeHtml(activeCat.title)} (${games.length})</h3>
      <div class="grid-lane" id="gameLane">
        ${games.map((g, idx) => gameTile(g, idx)).join('')}
      </div>
    </section>
  `;

  wireCategoryClicks(cats);
  wireGameClicks(games);
  ensureVisible();
  if (games.length) updateInspector(games[state.gameCursor]);
}

function categoryTile(c, idx) {
  const active = c.id === state.activeCategory;
  const focused = state.focusRow === 'categories' && idx === state.categoryCursor;
  const cls = `${active ? 'active' : ''} ${focused ? 'focused' : ''}`.trim();
  const thumb = c.thumbUrl
    ? `<img loading="lazy" draggable="false" src="${escapeHtml(c.thumbUrl)}" alt="${escapeHtml(c.title)}" />`
    : `<span>${escapeHtml(c.title)}</span>`;
  return `<article class="cat-tile ${cls}" data-id="${escapeHtml(c.id)}" data-idx="${idx}">
    <div class="thumb">${thumb}</div>
    <div class="meta">
      <div class="title">${escapeHtml(c.title)}</div>
      <div class="sub">${c.gameCount} games</div>
    </div>
  </article>`;
}

function gameTile(g, idx) {
  const active = state.focusRow === 'games' && idx === state.gameCursor;
  const cls = `${active ? 'active focused' : ''}`.trim();
  const thumb = g.thumbUrl
    ? `<img loading="lazy" draggable="false" src="${escapeHtml(g.thumbUrl)}" alt="${escapeHtml(g.title)}" />`
    : `<span>${escapeHtml(g.titleId || '')}</span>`;
  const playedDate = (g.lastPlayed || '').slice(0, 10) || '-';
  return `<article class="tile ${cls}" data-idx="${idx}">
    <div class="thumb">${thumb}</div>
    <div class="meta">
      <div class="title">${escapeHtml(g.title)}</div>
      <div class="sub">v${escapeHtml(g.currentVer)}</div>
      <div class="sub date">${escapeHtml(playedDate)}</div>
    </div>
  </article>`;
}

function wireCategoryClicks(cats) {
  document.querySelectorAll('.cat-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const idx = Number(tile.dataset.idx || 0);
      selectCategory(cats[idx]?.id || 'home', idx, true);
    });
  });

  const lane = document.getElementById('categoryLane');
  if (!lane) return;
  lane.addEventListener('dragstart', (e) => e.preventDefault());
  enableDragScroll(lane);
}

function wireGameClicks(games) {
  document.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      setGameFocus(Number(tile.dataset.idx || 0), true);
    });
  });
}

function refreshCategoryClasses() {
  document.querySelectorAll('.cat-tile').forEach((tile) => {
    const idx = Number(tile.dataset.idx || 0);
    const id = String(tile.dataset.id || '');
    tile.classList.toggle('active', id === state.activeCategory);
    tile.classList.toggle('focused', state.focusRow === 'categories' && idx === state.categoryCursor);
  });
}

function refreshGameClasses() {
  document.querySelectorAll('.tile').forEach((tile, idx) => {
    const on = state.focusRow === 'games' && idx === state.gameCursor;
    tile.classList.toggle('active', on);
    tile.classList.toggle('focused', on);
  });
}

function setGameFocus(idx, reveal) {
  const games = activeGames();
  if (!games.length) return;
  state.focusRow = 'games';
  state.gameCursor = Math.max(0, Math.min(games.length - 1, idx));
  refreshGameClasses();
  updateInspector(games[state.gameCursor]);
  if (reveal) {
    const lane = document.getElementById('gameLane');
    const tile = lane?.querySelectorAll('.tile')[state.gameCursor];
    if (lane && tile) scrollHorizIntoView(lane, tile);
  }
}

function renderGamesLane(animate = true) {
  const cats = categories();
  const activeCat = cats.find((c) => c.id === state.activeCategory) || cats[0];
  const games = activeGames();
  if (state.gameCursor >= games.length) state.gameCursor = Math.max(0, games.length - 1);

  const titleEl = document.getElementById('gameLaneTitle');
  const lane = document.getElementById('gameLane');
  if (!titleEl || !lane) return;

  titleEl.textContent = `${activeCat.title} (${games.length})`;
  const nextHtml = games.map((g, idx) => gameTile(g, idx)).join('');

  const swap = () => {
    lane.innerHTML = nextHtml;
    wireGameClicks(games);
    refreshGameClasses();
    ensureVisible();
    if (games.length) updateInspector(games[state.gameCursor]);
  };

  if (!animate) {
    swap();
    return;
  }

  if (laneSwapTimer) {
    clearTimeout(laneSwapTimer);
    laneSwapTimer = null;
  }
  lane.classList.remove('lane-enter');
  lane.classList.add('lane-leave');
  laneSwapTimer = setTimeout(() => {
    swap();
    lane.classList.remove('lane-leave');
    lane.classList.add('lane-enter');
    setTimeout(() => lane.classList.remove('lane-enter'), 190);
    laneSwapTimer = null;
  }, 90);
}

function selectCategory(id, idx, moveFocusToGames) {
  if (id === state.activeCategory && idx === state.categoryCursor) {
    if (moveFocusToGames) {
      state.focusRow = 'games';
      refreshCategoryClasses();
      refreshGameClasses();
    }
    return;
  }
  state.activeCategory = id;
  state.categoryCursor = idx;
  state.gameCursor = 0;
  state.focusRow = moveFocusToGames ? 'games' : 'categories';
  updateTopbar(categories()[idx]);
  refreshCategoryClasses();
  renderGamesLane(true);
}

function updateInspector(g) {
  if (!g) return;
  el.iTitle.textContent = g.title || g.titleId || 'Game';
  el.iMeta.innerHTML = `
    <div class="inspector-grid">
      <div class="col">
        <div class="kv"><span class="k">Title ID</span><span class="v">${escapeHtml(g.titleId || '-')}</span></div>
        <div class="kv"><span class="k">Version</span><span class="v">${escapeHtml(g.currentVer || '-')}</span></div>
      </div>
      <div class="col">
        <div class="kv"><span class="k">Size</span><span class="v">${escapeHtml(String(g.sizeGb || 0))} GB</span></div>
        <div class="kv"><span class="k">VR</span><span class="v">${escapeHtml(g.isVr ? 'Yes' : 'No')}</span></div>
      </div>
    </div>
  `;

  el.inspector.classList.add('open');
  el.inspector.setAttribute('aria-hidden', 'false');
}

function closeInspector() {
  el.inspector.classList.remove('open');
  el.inspector.setAttribute('aria-hidden', 'true');
}

function ensureVisible() {
  const catLane = document.getElementById('categoryLane');
  if (catLane) {
    const cat = catLane.querySelectorAll('.cat-tile')[state.categoryCursor];
    if (cat) scrollHorizIntoView(catLane, cat);
  }

  const gameLane = document.getElementById('gameLane');
  if (gameLane) {
    const game = gameLane.querySelectorAll('.tile')[state.gameCursor];
    if (game) scrollHorizIntoView(gameLane, game);
  }
}

function scrollHorizIntoView(container, child) {
  const cLeft = container.scrollLeft;
  const cRight = cLeft + container.clientWidth;
  const eLeft = child.offsetLeft;
  const eRight = eLeft + child.offsetWidth;
  const pad = 24;
  if (eLeft - pad < cLeft) {
    container.scrollTo({ left: Math.max(0, eLeft - pad), behavior: 'smooth' });
    return;
  }
  if (eRight + pad > cRight) {
    const left = eRight - container.clientWidth + pad;
    container.scrollTo({ left, behavior: 'smooth' });
  }
}

function enableDragScroll(elm) {
  let isMouseDown = false;
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  const onMove = (e) => {
    if (!isMouseDown || (e.buttons & 1) !== 1) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) isDragging = true;
    if (!isDragging) return;
    e.preventDefault();
    elm.scrollLeft = startScrollLeft - dx;
  };

  const onUp = () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    elm.classList.remove('dragging');
    if (isDragging) {
      const stopClick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      elm.addEventListener('click', stopClick, { capture: true, once: true });
    }
    isDragging = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  elm.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // left click only
    isMouseDown = true;
    isDragging = false;
    startX = e.clientX;
    startScrollLeft = elm.scrollLeft;
    elm.classList.add('dragging');
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
  });

  elm.addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartScrollLeft = elm.scrollLeft;
  }, { passive: true });

  elm.addEventListener('touchmove', (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    elm.scrollLeft = touchStartScrollLeft - dx;
  }, { passive: true });

  elm.addEventListener('wheel', (e) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 1) return;
    e.preventDefault();
    elm.scrollBy({ left: delta, behavior: 'smooth' });
  }, { passive: false });
}

function onKey(e) {
  if (el.palette.classList.contains('open')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
    return;
  }
  const cats = categories();
  const games = activeGames();

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.focusRow = 'games';
    refreshCategoryClasses();
    refreshGameClasses();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.focusRow = 'categories';
    refreshCategoryClasses();
    refreshGameClasses();
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (state.focusRow === 'categories') {
      const nextIdx = Math.min(cats.length - 1, state.categoryCursor + 1);
      if (nextIdx !== state.categoryCursor) {
        state.categoryCursor = nextIdx;
        state.activeCategory = cats[state.categoryCursor]?.id || 'home';
        state.gameCursor = 0;
        updateTopbar(cats[state.categoryCursor]);
        refreshCategoryClasses();
        renderGamesLane(true);
      }
    } else {
      setGameFocus(Math.min(games.length - 1, state.gameCursor + 1), true);
    }
    return;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (state.focusRow === 'categories') {
      const nextIdx = Math.max(0, state.categoryCursor - 1);
      if (nextIdx !== state.categoryCursor) {
        state.categoryCursor = nextIdx;
        state.activeCategory = cats[state.categoryCursor]?.id || 'home';
        state.gameCursor = 0;
        updateTopbar(cats[state.categoryCursor]);
        refreshCategoryClasses();
        renderGamesLane(true);
      }
    } else {
      setGameFocus(Math.max(0, state.gameCursor - 1), true);
    }
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (state.focusRow === 'categories') {
      const c = cats[state.categoryCursor];
      selectCategory(c?.id || 'home', state.categoryCursor, true);
    } else if (games[state.gameCursor]) {
      updateInspector(games[state.gameCursor]);
    }
    return;
  }

  if (e.key === 'Escape' || e.key === 'Backspace') {
    if (el.inspector.classList.contains('open')) {
      e.preventDefault();
      closeInspector();
      return;
    }
    if (state.activeCategory !== 'home') {
      e.preventDefault();
      state.activeCategory = 'home';
      state.categoryCursor = 0;
      state.gameCursor = 0;
      state.focusRow = 'categories';
      updateTopbar(cats[0]);
      refreshCategoryClasses();
      renderGamesLane(true);
    }
  }
}

function buildPaletteActions(query) {
  if (!state.layout) return [];
  const q = String(query || '').toLowerCase().trim();
  const actions = [];
  const seen = new Set();

  const addFromGames = (games, catId, catLabel) => {
    games.forEach((g, idx) => {
      const title = String(g.title || '').trim();
      if (!title) return;
      const cusa = String(g.titleId || '').trim();
      const hay = `${title} ${cusa} ${catLabel}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const key = `${title.toLowerCase()}|${cusa}|${catId}|${idx}`;
      if (seen.has(key)) return;
      seen.add(key);
      actions.push({
        label: title,
        meta: `${catLabel}${cusa ? ` • ${cusa}` : ''}`,
        run: () => jumpToGame(catId, idx),
      });
    });
  };

  addFromGames(state.layout.rootGames || [], 'home', 'Home');
  (state.layout.folders || []).forEach((f) => addFromGames(f.games || [], f.id, f.name || 'Folder'));

  actions.sort((a, b) => a.label.localeCompare(b.label));
  return actions.slice(0, 60);
}

function jumpToGame(catId, gameIdx) {
  const cats = categories();
  const catIdx = Math.max(0, cats.findIndex((c) => c.id === catId));
  selectCategory(catId, catIdx, true);
  setTimeout(() => setGameFocus(gameIdx, true), 120);
}

function renderPalette() {
  const q = (el.paletteInput.value || '').trim();
  paletteActions = buildPaletteActions(q);
  if (paletteCursor >= paletteActions.length) paletteCursor = 0;
  el.paletteList.innerHTML = paletteActions.map((a, idx) => {
    const active = idx === paletteCursor ? 'active' : '';
    return `<li class="${active}" data-idx="${idx}"><span>${escapeHtml(a.label)}</span><small>${escapeHtml(a.meta || '')}</small></li>`;
  }).join('');
  el.paletteList.querySelectorAll('li').forEach((item) => {
    item.addEventListener('click', () => {
      const idx = Number(item.dataset.idx || 0);
      const act = paletteActions[idx];
      if (!act) return;
      act.run();
      closePalette();
    });
  });
}

function openPalette() {
  el.palette.classList.add('open');
  el.palette.setAttribute('aria-hidden', 'false');
  el.paletteInput.value = '';
  paletteCursor = 0;
  renderPalette();
  el.paletteInput.focus();
}

function closePalette() {
  el.palette.classList.remove('open');
  el.palette.setAttribute('aria-hidden', 'true');
}

function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function csvCell(v) {
  const s = String(v ?? '');
  return `"${s.replaceAll('"', '""')}"`;
}

function exportCategoriesCsv() {
  if (!state.layout) return;
  const rows = [];

  state.layout.rootGames.forEach((g) => {
    rows.push({
      title: g.title || '',
      titleId: g.titleId || '',
      category: 'Home',
    });
  });

  state.layout.folders.forEach((f) => {
    (f.games || []).forEach((g) => {
      rows.push({
        title: g.title || '',
        titleId: g.titleId || '',
        category: f.name || 'Unknown',
      });
    });
  });

  rows.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.title.localeCompare(b.title) ||
    a.titleId.localeCompare(b.titleId)
  );

  const lines = ['Title,CUSA,Category'];
  for (const r of rows) {
    lines.push(`${csvCell(r.title)},${csvCell(r.titleId)},${csvCell(r.category)}`);
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `ps4-game-categories-${stamp}.csv`;

  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

el.refreshBtn.addEventListener('click', async () => {
  if (el.refreshBtn.disabled) return;
  el.refreshBtn.disabled = true;
  el.refreshBtn.classList.add('loading');
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const payload = await res.json();
    if (!payload.ok) {
      const msg = payload?.snapshot?.stderr || payload?.runs?.find((r) => !r.ok)?.stderr || 'Refresh failed';
      throw new Error(msg);
    }
    await loadLayout();
  } catch (err) {
    el.counts.textContent = `Refresh failed: ${err.message}`;
  } finally {
    el.refreshBtn.disabled = false;
    el.refreshBtn.classList.remove('loading');
  }
});
el.exportCategoriesBtn?.addEventListener('click', exportCategoriesCsv);
el.cmdBtn?.addEventListener('click', openPalette);
el.closeInspector.addEventListener('click', closeInspector);
document.addEventListener('click', (e) => {
  if (!el.inspector.classList.contains('open')) return;
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (el.inspector.contains(t)) return;
  if (t.closest('.tile')) return;
  closeInspector();
});
el.palette?.addEventListener('click', (e) => {
  if (e.target === el.palette) closePalette();
});
el.paletteInput?.addEventListener('input', renderPalette);
el.paletteInput?.addEventListener('keydown', (e) => {
  if (!paletteActions.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    paletteCursor = (paletteCursor + 1) % paletteActions.length;
    renderPalette();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    paletteCursor = (paletteCursor - 1 + paletteActions.length) % paletteActions.length;
    renderPalette();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const action = paletteActions[paletteCursor];
    if (!action) return;
    action.run();
    closePalette();
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && String(e.key || '').toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  }
});
document.addEventListener('keydown', onKey);

loadLayout().catch((err) => {
  el.counts.textContent = `Load failed: ${err.message}`;
});
