import { DISHES } from './data/dishes.js';
import {
  DIET_OPTIONS,
  HEAVINESS_OPTIONS,
  SENSORY_ROUNDS,
  getDietCompliantPool,
  getRoundOptions,
  resolveWinnerAndRunnersUp,
  scoreAndRankDishes,
} from './engine/decisionEngine.js';

const PREFS_KEY = 'cravelock_prefs_v1';
const HISTORY_KEY = 'cravelock_history_v1';
const COOLDOWN_MS = 72 * 60 * 60 * 1000;

const DEFAULT_FILTERS = {
  diet: 'veg',
  heaviness: 'balanced',
  highProtein: false,
  travelSafeOnly: false,
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw);
    const validDiet = DIET_OPTIONS.some((d) => d.id === parsed.diet) ? parsed.diet : 'veg';
    const validHeaviness = HEAVINESS_OPTIONS.some((h) => h.id === parsed.heaviness)
      ? parsed.heaviness
      : 'balanced';
    return {
      diet: validDiet,
      heaviness: validHeaviness,
      highProtein: Boolean(parsed.highProtein),
      travelSafeOnly: Boolean(parsed.travelSafeOnly),
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

function savePrefs(filters) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors in restricted browsing contexts
  }
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - COOLDOWN_MS;
    const fresh = parsed.filter((item) => item && item.id && Number(item.lockedAt) > cutoff);
    if (fresh.length !== parsed.length) {
      saveHistory(fresh);
    }
    return fresh;
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

const state = {
  view: 'baseline', // 'baseline' | 'arena' | 'winner'
  filters: loadPrefs(),
  history: loadHistory(),
  showHistoryDrawer: false,
  roundIndex: 0,
  choices: {},
  pocketCandidates: [],
  activeCandidateIdx: 0,
  copiedBlueprint: false,
};

function getRecentHistoryIds() {
  return state.history.map((item) => item.id);
}

function formatHoursAgo(timestamp) {
  const hrs = Math.max(1, Math.round((Date.now() - Number(timestamp)) / (60 * 60 * 1000)));
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getDigestionClass(digestion) {
  if (digestion === 'Easy on Gut') return 'status-good';
  if (digestion === 'Moderate') return 'status-mid';
  return 'status-warn';
}

function getDurabilityClass(durability) {
  if (durability.startsWith('Bulletproof')) return 'status-good';
  if (durability.startsWith('Good')) return 'status-mid';
  return 'status-warn';
}

function getProteinClass(tier) {
  if (tier === 'High') return 'status-good';
  if (tier === 'Moderate') return 'status-mid';
  return 'status-warn';
}

function renderTopbar() {
  const dietButtons = DIET_OPTIONS.map((opt) => {
    const active = state.filters.diet === opt.id ? 'active' : '';
    return `
      <button
        type="button"
        class="sticky-diet-btn ${active}"
        data-action="set-diet"
        data-diet="${escapeHtml(opt.id)}"
        title="${escapeHtml(opt.shortDesc)}"
      >${escapeHtml(opt.label)}</button>
    `;
  }).join('');

  return `
    <header class="topbar">
      <div class="topbar-inner">
        <button type="button" class="brand" data-action="go-home">
          <span class="brand-wordmark">CraveLock</span>
          <span class="brand-sub">Kya Mangaye</span>
        </button>
        <div class="topbar-controls">
          <div class="sticky-diet-strip" role="group" aria-label="Dietary preference">
            ${dietButtons}
          </div>
          <button
            type="button"
            class="history-pill-btn"
            data-action="toggle-history"
            aria-expanded="${state.showHistoryDrawer ? 'true' : 'false'}"
          >
            <span>72h Cooldown</span>
            <strong>(${state.history.length})</strong>
          </button>
        </div>
      </div>
    </header>
  `;
}

function renderHistoryDrawer() {
  if (!state.showHistoryDrawer) return '';

  const chips =
    state.history.length === 0
      ? `<span class="section-hint">No orders locked in the past 72 hours. Lock in a winning dish to avoid repeats tomorrow.</span>`
      : state.history
          .map(
            (item) => `
          <span class="history-chip">
            <span>${escapeHtml(item.name)} <small class="section-hint">(${escapeHtml(formatHoursAgo(item.lockedAt))})</small></span>
            <button type="button" data-action="remove-history" data-id="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">x</button>
          </span>
        `
          )
          .join('');

  const clearBtn =
    state.history.length > 0
      ? `<button type="button" class="btn-ghost" data-action="clear-history">Clear All</button>`
      : '';

  return `
    <section class="history-drawer fade-up" aria-label="Recent 72-hour orders">
      <div class="history-drawer-head">
        <span class="history-drawer-title">Recently Ordered (Deprioritized for 72 Hours)</span>
        ${clearBtn}
      </div>
      <div class="history-list">${chips}</div>
    </section>
  `;
}

function renderBaselineView() {
  const pool = getDietCompliantPool(DISHES, state.filters);

  const dietTiles = DIET_OPTIONS.map((opt) => {
    const selected = state.filters.diet === opt.id ? 'selected' : '';
    return `
      <button
        type="button"
        class="choice-tile ${selected}"
        data-action="set-diet"
        data-diet="${escapeHtml(opt.id)}"
      >
        <div class="choice-tile-title">
          <span>${escapeHtml(opt.label)}</span>
          ${selected ? '<span class="key-shortcut">Active</span>' : ''}
        </div>
        <div class="choice-tile-desc">${escapeHtml(opt.shortDesc)}</div>
      </button>
    `;
  }).join('');

  const heavinessTiles = HEAVINESS_OPTIONS.map((opt) => {
    const selected = state.filters.heaviness === opt.id ? 'selected' : '';
    return `
      <button
        type="button"
        class="choice-tile ${selected}"
        data-action="set-heaviness"
        data-heaviness="${escapeHtml(opt.id)}"
      >
        <div class="choice-tile-title">
          <span>${escapeHtml(opt.label)}</span>
        </div>
        <div class="choice-tile-desc">${escapeHtml(opt.subtitle)}</div>
      </button>
    `;
  }).join('');

  return `
    <main class="main-stage fade-up">
      ${renderHistoryDrawer()}

      <div class="eyebrow">Indian Metro Dish Decision Engine</div>
      <h1 class="hero-title">Stop scrolling menus for 30 minutes. Lock in the exact dish in 5 taps.</h1>
      <p class="hero-lead">
        You already know which kitchens in your city you trust. Set your baseline below, play 5 quick
        craving rounds, and get a complete cart blueprint with protein, gut digestion, and delivery durability scores.
      </p>

      <section class="filter-section">
        <div class="section-label">
          <h2>1. Dietary Boundary</h2>
          <span class="section-hint">Hard-filtered & saved automatically</span>
        </div>
        <div class="option-grid-4">
          ${dietTiles}
        </div>
      </section>

      <section class="filter-section">
        <div class="section-label">
          <h2>2. Appetite & Heaviness</h2>
          <span class="section-hint">Shapes portion & richness ranking</span>
        </div>
        <div class="option-grid-4">
          ${heavinessTiles}
        </div>
      </section>

      <section class="filter-section">
        <div class="section-label">
          <h2>3. Practical Modifiers</h2>
          <span class="section-hint">Optional 1-tap rules</span>
        </div>
        <div class="option-grid-2">
          <button
            type="button"
            class="modifier-toggle ${state.filters.highProtein ? 'active' : ''}"
            data-action="toggle-high-protein"
            aria-pressed="${state.filters.highProtein ? 'true' : 'false'}"
          >
            <div>
              <div class="choice-tile-title">High-Protein Priority (24g+)</div>
              <div class="choice-tile-desc">Boosts paneer, tofu, egg, dal-lentil, and lean tandoor picks.</div>
            </div>
            <div class="switch-track"><div class="switch-thumb"></div></div>
          </button>

          <button
            type="button"
            class="modifier-toggle ${state.filters.travelSafeOnly ? 'active' : ''}"
            data-action="toggle-travel-safe"
            aria-pressed="${state.filters.travelSafeOnly ? 'true' : 'false'}"
          >
            <div>
              <div class="choice-tile-title">Travel-Safe Delivery Only</div>
              <div class="choice-tile-desc">Excludes dosas, pizzas, and snacks that turn soggy past 15 mins.</div>
            </div>
            <div class="switch-track"><div class="switch-thumb"></div></div>
          </button>
        </div>
      </section>

      <div class="launch-bar">
        <div class="pool-counter">
          <span class="pool-count-num">${pool.length} curated dishes ready in tonight's pool</span>
          <span class="pool-count-sub">5 rounds take under 20 seconds (keyboard shortcuts 1 & 2 supported)</span>
        </div>
        <div class="launch-actions">
          <button type="button" class="btn-secondary" data-action="instant-pick">
            Instant Lock (Skip Rounds)
          </button>
          <button type="button" class="btn-primary" data-action="start-arena">
            Start 5-Card Elimination ->
          </button>
        </div>
      </div>
    </main>
  `;
}

function renderSensoryCard(option, sideNum, shortcutHint) {
  const tagsHtml = (option.tags || [])
    .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
    .join('');
  const examplesHtml = (option.examples || [])
    .map((ex) => `<li>${escapeHtml(ex)}</li>`)
    .join('');

  return `
    <button
      type="button"
      class="arena-card"
      data-action="pick-round"
      data-value="${escapeHtml(option.value)}"
    >
      <div class="arena-card-top">
        <div class="arena-card-badge-row">
          <span class="cuisine-badge">Option ${sideNum}</span>
          <span class="key-shortcut">${escapeHtml(shortcutHint)}</span>
        </div>
        <h2 class="arena-card-title">${escapeHtml(option.title)}</h2>
        <p class="arena-card-sub">${escapeHtml(option.subtitle)}</p>
        <div class="tag-row">${tagsHtml}</div>
      </div>

      <div class="arena-examples">
        <div class="arena-examples-label">Matching examples in your diet pool</div>
        <ul class="example-list">${examplesHtml}</ul>
      </div>
    </button>
  `;
}

function renderShowdownCard(option, sideNum, shortcutHint) {
  const { dish } = option;
  return `
    <button
      type="button"
      class="arena-card"
      data-action="pick-round"
      data-value="${escapeHtml(dish.id)}"
    >
      <div class="arena-card-top">
        <div class="arena-card-badge-row">
          <span class="cuisine-badge">${escapeHtml(dish.cuisineTag)}</span>
          <span class="key-shortcut">${escapeHtml(shortcutHint)}</span>
        </div>
        <h2 class="arena-card-title">${escapeHtml(dish.name)}</h2>
        <p class="arena-card-sub">${escapeHtml(dish.cravingHook)}</p>

        <div class="showdown-combo-box">
          <div class="showdown-combo-label">Order Blueprint</div>
          <div>${escapeHtml(dish.comboBlueprint)}</div>
        </div>
      </div>

      <div class="arena-examples">
        <div class="tag-row">
          <span class="status-pill ${getProteinClass(dish.metrics.proteinTier)}">~${dish.metrics.proteinGrams}g Protein</span>
          <span class="status-pill ${getDigestionClass(dish.metrics.digestion)}">${escapeHtml(dish.metrics.digestion)}</span>
          <span class="status-pill ${getDurabilityClass(dish.metrics.deliveryDurability)}">${escapeHtml(dish.metrics.deliveryDurability)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderArenaView() {
  const payload = getRoundOptions(
    state.roundIndex,
    DISHES,
    state.filters,
    state.choices,
    getRecentHistoryIds()
  );

  const segments = [0, 1, 2, 3, 4]
    .map((idx) => {
      const cls =
        idx < state.roundIndex ? 'done' : idx === state.roundIndex ? 'current' : '';
      return `<div class="progress-seg ${cls}"></div>`;
    })
    .join('');

  const leftCard =
    payload.roundType === 'sensory'
      ? renderSensoryCard(payload.optionA, 1, 'Key 1 / Left')
      : renderShowdownCard(payload.optionA, 1, 'Key 1 / Left');

  const rightCard =
    payload.roundType === 'sensory'
      ? renderSensoryCard(payload.optionB, 2, 'Key 2 / Right')
      : renderShowdownCard(payload.optionB, 2, 'Key 2 / Right');

  return `
    <main class="main-stage fade-up">
      ${renderHistoryDrawer()}

      <div class="arena-header">
        <button type="button" class="btn-secondary" data-action="step-back">
          <- ${state.roundIndex === 0 ? 'Edit Filters' : 'Previous Round'}
        </button>
        <button type="button" class="btn-ghost" data-action="go-home">Restart</button>
      </div>

      <div class="progress-track" aria-label="Progress">${segments}</div>

      <div class="eyebrow">${escapeHtml(payload.eyebrow)}</div>
      <h1 class="hero-title">${escapeHtml(payload.prompt)}</h1>

      <div class="arena-split">
        ${leftCard}
        ${rightCard}
      </div>

      <div class="arena-footer-hint">
        Tap a card or use keyboard shortcuts: [1] / Left Arrow for Option 1, [2] / Right Arrow for Option 2
      </div>
    </main>
  `;
}

function renderWinnerView() {
  const activeEntry = state.pocketCandidates[state.activeCandidateIdx] || state.pocketCandidates[0];
  if (!activeEntry) {
    state.view = 'baseline';
    return renderBaselineView();
  }

  const { dish, matchReasons } = activeEntry;
  const { metrics } = dish;
  const isLocked = state.history.some((item) => item.id === dish.id);

  const jainBanner =
    state.filters.diet === 'jain' && dish.jainNote
      ? `
      <div class="jain-callout">
        <strong>Jain Ordering Note</strong>
        <span>${escapeHtml(dish.jainNote)}</span>
      </div>
    `
      : '';

  const reasonTags = (matchReasons || [])
    .slice(0, 4)
    .map((r) => `<span class="tag-pill">${escapeHtml(r)}</span>`)
    .join('');

  const runnerButtons = state.pocketCandidates
    .map((entry, idx) => {
      const isCurrent = idx === state.activeCandidateIdx;
      return `
        <button
          type="button"
          class="runnerup-btn ${isCurrent ? 'active' : ''}"
          data-action="select-candidate"
          data-index="${idx}"
        >
          <div class="runnerup-btn-name">${idx === 0 ? '#1 Top Pick: ' : `#${idx + 1} Alt: `}${escapeHtml(entry.dish.name)}</div>
          <div class="runnerup-btn-meta">~${entry.dish.metrics.proteinGrams}g protein | ${escapeHtml(entry.dish.metrics.digestion)} | ${escapeHtml(entry.dish.metrics.deliveryDurability)}</div>
        </button>
      `;
    })
    .join('');

  const swiggyUrl = `https://www.swiggy.com/search?query=${encodeURIComponent(dish.name)}`;
  const zomatoUrl = `https://www.zomato.com/search?q=${encodeURIComponent(dish.name)}`;

  return `
    <main class="main-stage fade-up">
      ${renderHistoryDrawer()}

      <section class="winner-hero">
        <div class="winner-meta-top">
          <span class="cuisine-badge">${escapeHtml(dish.cuisineTag)}</span>
          <span class="pocket-rank-badge">Option ${state.activeCandidateIdx + 1} of ${state.pocketCandidates.length} in this craving pocket</span>
        </div>

        <h1 class="winner-title">${escapeHtml(dish.name)}</h1>
        <p class="winner-hook">${escapeHtml(dish.cravingHook)}</p>

        <div class="blueprint-box">
          <div class="blueprint-box-label">Complete Cart Order Blueprint</div>
          <div class="blueprint-box-text">${escapeHtml(dish.comboBlueprint)}</div>
        </div>

        ${jainBanner}

        ${reasonTags ? `<div class="tag-row">${reasonTags}</div>` : ''}
      </section>

      <section class="intel-grid" aria-label="Nutritional, digestion, and delivery intelligence">
        <article class="intel-card">
          <div class="intel-eyebrow">Protein & Energy</div>
          <div class="intel-headline">~${metrics.proteinGrams}g Protein</div>
          <span class="status-pill ${getProteinClass(metrics.proteinTier)}">${escapeHtml(metrics.proteinTier)} Protein Tier</span>
          <p class="intel-note">Estimated meal energy: <strong>${escapeHtml(metrics.kcalRange)}</strong>. Designed as a complete balanced order rather than a single side.</p>
        </article>

        <article class="intel-card">
          <div class="intel-eyebrow">Digestion & Late-Night Score</div>
          <div class="intel-headline">${escapeHtml(metrics.digestion)}</div>
          <span class="status-pill ${metrics.lateNightFriendly ? 'status-good' : 'status-warn'}">
            ${metrics.lateNightFriendly ? 'Safe Past 10 PM' : 'Best Ordered Before 9 PM'}
          </span>
          <p class="intel-note">${escapeHtml(metrics.digestionNote)}</p>
        </article>

        <article class="intel-card">
          <div class="intel-eyebrow">Delivery Durability</div>
          <div class="intel-headline">${escapeHtml(metrics.deliveryDurability)}</div>
          <span class="status-pill ${getDurabilityClass(metrics.deliveryDurability)}">
            ${metrics.travelSafe ? 'Travel-Safe Packaging' : 'Short-Distance Order Only'}
          </span>
          <p class="intel-note">${escapeHtml(metrics.deliveryTip)}</p>
        </article>
      </section>

      <div class="winner-actions">
        <button
          type="button"
          class="btn-primary ${isLocked ? 'btn-locked' : ''}"
          data-action="lock-order"
        >
          ${isLocked ? "Locked In for Tonight (72h Cooldown Active)" : "Lock In Tonight's Order"}
        </button>

        <button type="button" class="btn-secondary" data-action="cycle-runnerup">
          Swap With Runner-Up
        </button>

        <button type="button" class="btn-secondary" data-action="copy-blueprint">
          ${state.copiedBlueprint ? 'Copied Blueprint!' : 'Copy Order Blueprint'}
        </button>

        <a class="btn-secondary" href="${swiggyUrl}" target="_blank" rel="noopener noreferrer">
          Search on Swiggy
        </a>

        <a class="btn-secondary" href="${zomatoUrl}" target="_blank" rel="noopener noreferrer">
          Search on Zomato
        </a>

        <button type="button" class="btn-ghost" data-action="go-home">
          Start New Decision
        </button>
      </div>

      <section class="runnerup-panel">
        <div class="runnerup-header">
          <span class="runnerup-title">Close Alternatives in This Exact Craving Pocket</span>
        </div>
        <div class="runnerup-pills">
          ${runnerButtons}
        </div>
      </section>
    </main>
  `;
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  let body = '';
  if (state.view === 'baseline') {
    body = renderBaselineView();
  } else if (state.view === 'arena') {
    body = renderArenaView();
  } else {
    body = renderWinnerView();
  }

  root.innerHTML = `${renderTopbar()}${body}`;
}

function startElimination() {
  state.view = 'arena';
  state.roundIndex = 0;
  state.choices = {};
  state.copiedBlueprint = false;
  render();
}

function instantPickWinner() {
  const ranked = scoreAndRankDishes(DISHES, state.filters, {}, getRecentHistoryIds());
  state.pocketCandidates = ranked.slice(0, 5);
  state.activeCandidateIdx = 0;
  state.copiedBlueprint = false;
  state.view = 'winner';
  render();
}

function handleRoundChoice(value) {
  if (state.roundIndex < SENSORY_ROUNDS.length) {
    const key = SENSORY_ROUNDS[state.roundIndex].key;
    state.choices[key] = value;
    state.roundIndex += 1;
    render();
    return;
  }

  // Round 5 Showdown selection
  const resolved = resolveWinnerAndRunnersUp(
    value,
    DISHES,
    state.filters,
    state.choices,
    getRecentHistoryIds()
  );
  state.pocketCandidates = [resolved.winner, ...resolved.runnersUp].slice(0, 5);
  state.activeCandidateIdx = 0;
  state.copiedBlueprint = false;
  state.view = 'winner';
  render();
}

function lockCurrentOrder() {
  const current = state.pocketCandidates[state.activeCandidateIdx];
  if (!current) return;
  const { dish } = current;
  const remaining = state.history.filter((h) => h.id !== dish.id);
  state.history = [{ id: dish.id, name: dish.name, lockedAt: Date.now() }, ...remaining].slice(
    0,
    12
  );
  saveHistory(state.history);
  render();
}

function copyCurrentBlueprint() {
  const current = state.pocketCandidates[state.activeCandidateIdx];
  if (!current) return;
  const text = `${current.dish.name}\nOrder Blueprint: ${current.dish.comboBlueprint}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  state.copiedBlueprint = true;
  render();
  setTimeout(() => {
    if (state.copiedBlueprint) {
      state.copiedBlueprint = false;
      render();
    }
  }, 2000);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  switch (action) {
    case 'go-home': {
      state.view = 'baseline';
      state.roundIndex = 0;
      state.choices = {};
      state.copiedBlueprint = false;
      render();
      break;
    }
    case 'set-diet': {
      const nextDiet = target.getAttribute('data-diet');
      if (nextDiet && nextDiet !== state.filters.diet) {
        state.filters.diet = nextDiet;
        savePrefs(state.filters);
        // Reset mid-session rounds or winner if dietary rule changes so nothing non-compliant stays shown
        if (state.view !== 'baseline') {
          state.view = 'baseline';
          state.roundIndex = 0;
          state.choices = {};
        }
        render();
      }
      break;
    }
    case 'set-heaviness': {
      const nextHeaviness = target.getAttribute('data-heaviness');
      if (nextHeaviness) {
        state.filters.heaviness = nextHeaviness;
        savePrefs(state.filters);
        render();
      }
      break;
    }
    case 'toggle-high-protein': {
      state.filters.highProtein = !state.filters.highProtein;
      savePrefs(state.filters);
      render();
      break;
    }
    case 'toggle-travel-safe': {
      state.filters.travelSafeOnly = !state.filters.travelSafeOnly;
      savePrefs(state.filters);
      render();
      break;
    }
    case 'toggle-history': {
      state.showHistoryDrawer = !state.showHistoryDrawer;
      render();
      break;
    }
    case 'remove-history': {
      const id = target.getAttribute('data-id');
      state.history = state.history.filter((item) => item.id !== id);
      saveHistory(state.history);
      render();
      break;
    }
    case 'clear-history': {
      state.history = [];
      saveHistory(state.history);
      render();
      break;
    }
    case 'start-arena': {
      startElimination();
      break;
    }
    case 'instant-pick': {
      instantPickWinner();
      break;
    }
    case 'pick-round': {
      const val = target.getAttribute('data-value');
      if (val) handleRoundChoice(val);
      break;
    }
    case 'step-back': {
      if (state.roundIndex > 0) {
        state.roundIndex -= 1;
        const prevKey = SENSORY_ROUNDS[state.roundIndex]?.key;
        if (prevKey) delete state.choices[prevKey];
      } else {
        state.view = 'baseline';
      }
      render();
      break;
    }
    case 'lock-order': {
      lockCurrentOrder();
      break;
    }
    case 'cycle-runnerup': {
      if (state.pocketCandidates.length > 1) {
        state.activeCandidateIdx = (state.activeCandidateIdx + 1) % state.pocketCandidates.length;
        state.copiedBlueprint = false;
        render();
      }
      break;
    }
    case 'select-candidate': {
      const idx = Number(target.getAttribute('data-index'));
      if (!Number.isNaN(idx) && idx >= 0 && idx < state.pocketCandidates.length) {
        state.activeCandidateIdx = idx;
        state.copiedBlueprint = false;
        render();
      }
      break;
    }
    case 'copy-blueprint': {
      copyCurrentBlueprint();
      break;
    }
    default:
      break;
  }
});

document.addEventListener('keydown', (event) => {
  if (state.view !== 'arena') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (event.key === '1' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const payload = getRoundOptions(
      state.roundIndex,
      DISHES,
      state.filters,
      state.choices,
      getRecentHistoryIds()
    );
    if (payload.optionA?.value) handleRoundChoice(payload.optionA.value);
  } else if (event.key === '2' || event.key === 'ArrowRight') {
    event.preventDefault();
    const payload = getRoundOptions(
      state.roundIndex,
      DISHES,
      state.filters,
      state.choices,
      getRecentHistoryIds()
    );
    if (payload.optionB?.value) handleRoundChoice(payload.optionB.value);
  } else if (event.key === 'Backspace' || event.key === 'Escape') {
    event.preventDefault();
    if (state.roundIndex > 0) {
      state.roundIndex -= 1;
      const prevKey = SENSORY_ROUNDS[state.roundIndex]?.key;
      if (prevKey) delete state.choices[prevKey];
    } else {
      state.view = 'baseline';
    }
    render();
  }
});

render();
