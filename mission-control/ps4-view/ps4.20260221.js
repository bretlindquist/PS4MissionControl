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
};

const state = {
  layout: null,
  activeCategory: 'home',
  categoryCursor: 0,
  gameCursor: 0,
  focusRow: 'categories',
};

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
  el.counts.textContent = `${state.layout.counts.games} games · ${state.layout.counts.folders} folders · Viewing ${activeCat.title}`;
  if (el.freshness) {
    const dt = state.layout.generatedAt ? new Date(state.layout.generatedAt) : null;
    const stamp = dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleString()
      : 'Unknown';
    el.freshness.textContent = `Data freshness: ${stamp}`;
  }

  el.rows.innerHTML = `
    <section class="shell-head">
      <div class="breadcrumbs"><span class="crumb active">Home Screen</span></div>
      <div class="hint">Controls: ← → move · ↑ ↓ switch rows · Enter select · Esc back to Home</div>
    </section>

    <section class="lane-row">
      <h3>Categories</h3>
      <div class="scroller category-lane" id="categoryLane">
        ${cats.map((c, idx) => categoryTile(c, idx)).join('')}
      </div>
    </section>

    <section class="lane-row">
      <h3>${escapeHtml(activeCat.title)} (${games.length})</h3>
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
      state.focusRow = 'games';
      state.gameCursor = Number(tile.dataset.idx || 0);
      document.querySelectorAll('.tile').forEach((t, idx) => {
        t.classList.toggle('active', idx === state.gameCursor);
        t.classList.toggle('focused', idx === state.gameCursor);
      });
      updateInspector(games[state.gameCursor]);
      const lane = document.getElementById('gameLane');
      if (lane) scrollHorizIntoView(lane, tile);
    });
  });
}

function selectCategory(id, idx, moveFocusToGames) {
  state.activeCategory = id;
  state.categoryCursor = idx;
  state.gameCursor = 0;
  state.focusRow = moveFocusToGames ? 'games' : 'categories';
  render();
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
}

function onKey(e) {
  const cats = categories();
  const games = activeGames();

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.focusRow = 'games';
    render();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.focusRow = 'categories';
    render();
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (state.focusRow === 'categories') {
      state.categoryCursor = Math.min(cats.length - 1, state.categoryCursor + 1);
      state.activeCategory = cats[state.categoryCursor]?.id || 'home';
      state.gameCursor = 0;
    } else {
      state.gameCursor = Math.min(games.length - 1, state.gameCursor + 1);
    }
    render();
    return;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (state.focusRow === 'categories') {
      state.categoryCursor = Math.max(0, state.categoryCursor - 1);
      state.activeCategory = cats[state.categoryCursor]?.id || 'home';
      state.gameCursor = 0;
    } else {
      state.gameCursor = Math.max(0, state.gameCursor - 1);
    }
    render();
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
    if (state.activeCategory !== 'home') {
      e.preventDefault();
      state.activeCategory = 'home';
      state.categoryCursor = 0;
      state.gameCursor = 0;
      state.focusRow = 'categories';
      render();
    }
  }
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
el.closeInspector.addEventListener('click', () => {
  el.inspector.classList.remove('open');
  el.inspector.setAttribute('aria-hidden', 'true');
});
document.addEventListener('keydown', onKey);

loadLayout().catch((err) => {
  el.counts.textContent = `Load failed: ${err.message}`;
});
