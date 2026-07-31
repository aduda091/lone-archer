/* ============================================================
   LONE ARCHER — a stationary-ballista horde-defense game.
   Vanilla Canvas 2D, no dependencies.  Runs from file://.
   ============================================================ */
(() => {
  "use strict";

  // ---------- canvas setup ----------
  // The game runs in a FIXED logical play field (W x H, virtual units) that is
  // scaled to fit the window and letterboxed. Gameplay never depends on the
  // real window size, so resizing only rescales the view — it can't break a run.
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;                        // W,H = VIRTUAL field size
  const FIELD = { H: 720, VW_MIN: 1024, VW_MAX: 1600 };
  const view = { scale: 1, ox: 0, oy: 0, winW: 0, winH: 0 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Font stack for canvas text. Canvas does the same per-glyph fallback as CSS,
  // so the emoji families have to sit before the generic or icons render as tofu.
  const CANVAS_FONT = '"Segoe UI", system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  // The gold coin as inline SVG, geometry matched to drawCoin() below so the DOM
  // and the canvas show the same coin. Avoids depending on a system font shipping
  // any particular emoji (🪙 is Emoji 12 and missing on older Windows builds).
  const COIN_SVG =
    '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="12" fill="#d99a2b"/>' +
    '<circle cx="12" cy="12" r="8.88" fill="#ffd95c"/>' +
    '<rect x="10.56" y="7.2" width="2.88" height="9.6" fill="#d99a2b"/></svg>';

  // Virtual pixels per in-world metre — only used to phrase stats for the player.
  // The play field is ~53 m wide, so a bolt's reach reads like real archery range.
  const PX_PER_M = 24;
  const metres = (px) => px / PX_PER_M;

  // Pick a clamped logical size that fits the current window's aspect ratio.
  function computeVirtualDims() {
    const aspect = window.innerWidth / window.innerHeight;
    const vw = clamp(Math.round(FIELD.H * aspect), FIELD.VW_MIN, FIELD.VW_MAX);
    return { w: vw, h: FIELD.H };
  }

  // Establish (or re-fit) the logical field to the current window. Called on
  // boot and whenever a fresh run/menu begins — NOT on every resize, so the
  // field stays constant for the duration of a run.
  function establishField() {
    const d = computeVirtualDims();
    W = d.w; H = d.h;
    updateView();
  }

  // Recompute only the display scale/offset + backing store. Safe mid-run:
  // it leaves W/H (and therefore all gameplay) untouched.
  function updateView() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const winW = window.innerWidth, winH = window.innerHeight;
    canvas.width = Math.floor(winW * DPR);
    canvas.height = Math.floor(winH * DPR);
    canvas.style.width = winW + "px";
    canvas.style.height = winH + "px";
    view.scale = Math.min(winW / W, winH / H);       // "contain" fit
    view.ox = (winW - W * view.scale) / 2;
    view.oy = (winH - H * view.scale) / 2;
    view.winW = winW; view.winH = winH;
    layout();
  }

  // Set the canvas transform so drawing happens in virtual units, scaled and
  // centered inside the window (letterbox offset baked in).
  function applyView() {
    ctx.setTransform(DPR * view.scale, 0, 0, DPR * view.scale,
                     DPR * view.ox, DPR * view.oy);
  }

  window.addEventListener("resize", updateView);

  // ---------- world layout ----------
  const world = {
    groundY: 0,     // y of the ground line
    wallX: 0,       // x of the castle wall (enemies damage it here)
    ballista: { x: 0, y: 0 }, // pivot of the ballista
  };
  function layout() {
    world.groundY = H - Math.min(120, H * 0.16);
    world.wallX = W - Math.min(150, W * 0.16);
    world.ballista.x = W - Math.min(78, W * 0.09);
    world.ballista.y = world.groundY - 46;
  }

  // ---------- upgrade definitions ----------
  // Each upgrade: base value, per-level delta, cost curve, max level, category.
  const UPGRADE_CATS = {
    offense: "Offense",
    craft: "Arrowcraft",
    defense: "Defense",
    econ: "Economy",
  };

  const UPGRADES = [
    {
      id: "damage", name: "Arrow Power", ico: "🏹", max: 40, cat: "offense",
      base: 10, step: 6, baseCost: 25, costMul: 1.32,
      fmt: (v) => `${v} dmg`,
      desc: "Damage dealt by each arrow.",
    },
    {
      id: "fireRate", name: "Draw Speed", ico: "⚡", max: 30, cat: "offense",
      base: 0.9, step: 0.22, baseCost: 30, costMul: 1.36,
      fmt: (v) => `${v.toFixed(2)} /s`,
      desc: "Arrows fired per second while holding.",
    },
    {
      id: "arrowSpeed", name: "Bolt Velocity", ico: "💨", max: 20, cat: "offense",
      base: 720, step: 70, baseCost: 20, costMul: 1.28,
      fmt: (v) => `${Math.round(metres(v))} m/s · ${Math.round(metres(v * FLAT_TIME))} m reach`,
      desc: "Arrow speed — faster bolts also fly flat farther before dropping, and hit runners more easily.",
    },
    {
      id: "multishot", name: "Multi-Shot", ico: "🎯", max: 6, cat: "offense",
      base: 1, step: 1, baseCost: 120, costMul: 2.0,
      fmt: (v) => `${v} arrow${v > 1 ? "s" : ""}`,
      desc: "Fire extra arrows in a spread each shot.",
    },
    {
      id: "focus", name: "Focused Volley", ico: "🔭", max: 7, cat: "offense",
      base: 0, step: 0.12, baseCost: 90, costMul: 1.5,
      fmt: (v) => `${Math.round(v * 100)}% tighter`,
      desc: "Narrows the multi-shot spread so arrows stay grouped at long range.",
    },
    {
      id: "pierce", name: "Piercing", ico: "🗡️", max: 8, cat: "offense",
      base: 0, step: 1, baseCost: 90, costMul: 1.7,
      fmt: (v) => `${v} enem${v === 1 ? "y" : "ies"}`,
      desc: "Arrows pass through this many extra foes.",
    },
    {
      id: "crit", name: "Critical Eye", ico: "✨", max: 20, cat: "offense",
      base: 0, step: 0.03, baseCost: 60, costMul: 1.4,
      fmt: (v) => `${Math.round(v * 100)}% (x2)`,
      desc: "Chance to deal double damage.",
    },
    {
      id: "apierce", name: "Armor Piercing", ico: "🔩", max: 12, cat: "craft",
      base: 0, step: 0.05, baseCost: 90, costMul: 1.42,
      fmt: (v) => v > 0 ? `${Math.round(v * 100)}% bypass` : "none",
      desc: "Needle tips punch through plating — this share of every hit skips armor and bites health directly.",
    },
    {
      id: "blunt", name: "Blunt Heads", ico: "🔨", max: 9, cat: "craft",
      base: 1, step: 0.18, baseCost: 75, costMul: 1.4,
      fmt: (v) => `x${v.toFixed(2)} vs armor`,
      desc: "Heavy heads batter armor apart much faster. Does nothing once the plating is gone.",
    },
    {
      id: "explosive", name: "Explosive Tips", ico: "💥", max: 10, cat: "craft",
      base: 0, step: 0.09, baseCost: 150, costMul: 1.5,
      fmt: (v) => v > 0 ? `${Math.round(v * 100)}% within ${metres(blastRadius(v)).toFixed(1)} m` : "none",
      desc: "Hits burst, splashing every foe nearby. Armor soaks the blast just like a normal hit.",
    },
    {
      id: "poison", name: "Toxic Coating", ico: "🧪", max: 10, cat: "craft",
      base: 0, step: 0.06, baseCost: 115, costMul: 1.46,
      fmt: (v) => v > 0 ? `${Math.round(v * 100)}% dmg/s · 4s` : "none",
      desc: "Poisons on hit for 4s. Toxins seep under plating and always damage health.",
    },
    {
      id: "chill", name: "Frost Arrows", ico: "❄️", max: 10, cat: "craft",
      base: 0, step: 0.06, baseCost: 75, costMul: 1.45,
      fmt: (v) => `${Math.round(v * 100)}% slow`,
      desc: "Hits chill foes, slowing them for 2s. Stronger hits stagger the horde.",
    },
    {
      id: "wallHp", name: "Fortify Wall", ico: "🧱", max: 30, cat: "defense",
      base: 100, step: 40, baseCost: 35, costMul: 1.3,
      fmt: (v) => `${v} HP`,
      desc: "Maximum castle wall integrity (also heals on buy).",
    },
    {
      id: "regen", name: "Masons", ico: "🛠️", max: 20, cat: "defense",
      base: 0, step: 0.6, baseCost: 80, costMul: 1.45,
      fmt: (v) => `${v.toFixed(1)} HP/s`,
      desc: "Wall slowly repairs itself over time.",
    },
    {
      id: "gold", name: "Bounty", ico: COIN_SVG, max: 20, cat: "econ",
      base: 1, step: 0.12, baseCost: 70, costMul: 1.5,
      fmt: (v) => `x${v.toFixed(2)}`,
      desc: "Multiplier on gold earned from kills.",
    },
    {
      id: "tribute", name: "Tribute", ico: "📜", max: 20, cat: "econ",
      base: 0, step: 0.6, baseCost: 55, costMul: 1.4,
      fmt: (v) => `${v.toFixed(1)} ${COIN_SVG}/s`,
      desc: "Villagers pay a steady tribute every second.",
    },
    {
      id: "interest", name: "Coin Vault", ico: "🏦", max: 12, cat: "econ",
      base: 0, step: 0.005, baseCost: 160, costMul: 1.6,
      fmt: (v) => v > 0 ? `${(v * 100).toFixed(1)}% / 5s · max ${vaultCap(v)}` : "none",
      desc: "Interest on the gold you hold, every 5 seconds — but the vault only pays out up to its capacity.",
    },
  ];

  // physics / economy constants
  const GRAVITY = 900;          // px/s² applied to spent arrows
  const INTEREST_PERIOD = 5;    // seconds between interest payouts
  const CHILL_DURATION = 2;     // seconds an enemy stays chilled after a hit
  const POISON_DURATION = 4;    // seconds a poison stack lasts (refreshed on re-hit)
  const REFUND_RATE = 0.75;     // fraction of a level's cost returned when sold
  const FLAT_TIME = 0.85;       // seconds an arrow flies flat before gravity (reach = speed x this)
  const DIVE_DIST = 300;        // px before the wall where flyers start their swoop

  // Armor: a separate pool that must be chewed through before health takes hits.
  // A plain arrow only lands this fraction of its damage on plating, so armor is
  // worth ~2x its number in effective HP until you invest in Blunt Heads.
  const ARMOR_SOAK = 0.5;
  // Coin Vault payout ceiling. Interest is capped per payout so it can no longer
  // compound into infinite gold — it is a strong stipend, not a money printer.
  const INTEREST_STEP = 0.005;
  const VAULT_CAP_PER_LEVEL = 26;
  function vaultCap(rate) { return Math.round((rate / INTEREST_STEP) * VAULT_CAP_PER_LEVEL); }
  function blastRadius(v) { return 44 + v * 95; }

  function upgValue(u, lvl) { return u.base + u.step * lvl; }
  function upgCost(u, lvl) { return Math.round(u.baseCost * Math.pow(u.costMul, lvl)); }

  // ---------- game state ----------
  const state = {
    mode: "endless",
    running: false,
    paused: false,
    over: false,
    time: 0,
    gold: 0,
    wave: 0,
    wallHp: 100,
    wallMax: 100,
    levels: {},          // upgrade id -> level
    // per-run stats
    kills: 0,
    goldEarned: 0,
    shake: 0,
    // spawning
    spawnQueue: [],      // enemies pending in current wave
    spawnTimer: 0,
    waveTotal: 0,        // enemies in the current wave (for progress bar)
    betweenWaves: 0,     // countdown before next wave
    aiming: false,
    autoFire: false,     // fire continuously without holding
    aim: { x: 0, y: 0 },
    fireCooldown: 0,
    interestTimer: INTEREST_PERIOD,   // countdown to next interest payout
    dayPhase: 0,         // 0 = midnight at wave start, 1 = dawn as it clears
  };

  const MINIBOSS_EVERY = 5;   // endless: a mini-boss appears on every Nth wave

  const arrows = [];
  const enemies = [];
  const particles = [];
  const floaters = [];   // floating damage / gold text
  const blasts = [];     // expanding explosion rings

  function stat(id) { return upgValue(UPGRADES.find(u => u.id === id), state.levels[id] || 0); }

  // ---------- sound (procedural, no assets) ----------
  const sound = {
    on: true,
    ctx: null,
    ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; } } },
    blip(freq, dur, type = "square", vol = 0.06) {
      if (!this.on) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + dur);
    },
    shoot() { this.blip(520 + Math.random() * 40, 0.07, "square", 0.04); },
    hit() { this.blip(260, 0.06, "triangle", 0.05); },
    kill() { this.blip(160, 0.14, "sawtooth", 0.05); },
    hurt() { this.blip(90, 0.22, "sawtooth", 0.09); },
    crack() { this.blip(1200, 0.05, "square", 0.05); setTimeout(() => this.blip(300, 0.12, "square", 0.05), 40); },
    boom() { this.blip(70, 0.18, "sawtooth", 0.07); },
    wave() { this.blip(440, 0.12, "sine", 0.06); setTimeout(() => this.blip(660, 0.14, "sine", 0.06), 110); },
    buy() { this.blip(700, 0.08, "sine", 0.06); setTimeout(() => this.blip(950, 0.09, "sine", 0.06), 70); },
    sell() { this.blip(520, 0.08, "sine", 0.05); setTimeout(() => this.blip(360, 0.09, "sine", 0.05), 60); },
  };

  // ---------- enemy archetypes ----------
  // `armor` is a plated pool in front of health (see ARMOR_SOAK).
  // `fly` marks an airborne foe: lo/hi are its cruising band as a fraction of
  // the sky, amp/freq drive the bob. Flyers ignore the ground and must be aimed at.
  const ENEMY_TYPES = {
    grunt:  { r: 16, speed: 42,  hp: 30,  dmg: 8,  gold: 5,  color: "#8a6f4e", eye: "#ffd27f", name: "Grunt" },
    runner: { r: 12, speed: 96,  hp: 18,  dmg: 6,  gold: 6,  color: "#4e7a8a", eye: "#9ff0ff", name: "Runner" },
    brute:  { r: 26, speed: 28,  hp: 120, dmg: 20, gold: 16, color: "#6b3b45", eye: "#ff9aa7", name: "Brute" },
    shaman: { r: 15, speed: 52,  hp: 55,  dmg: 10, gold: 12, color: "#5a4a86", eye: "#c9a6ff", name: "Shaman" },
    // siege line — most of their bulk is plating, not flesh
    sapper: { r: 18, speed: 46,  hp: 40,  armor: 60,  dmg: 12, gold: 16, color: "#6d6a5c", eye: "#ffe9a8", name: "Sapper" },
    ram:    { r: 30, speed: 20,  hp: 150, armor: 200, dmg: 44, gold: 42, color: "#575046", eye: "#ffc27a", name: "Siege Ram" },
    // flyers — no legs on the ground, they cruise in and dive at the battlements
    bat:    { r: 11, speed: 118, hp: 20,  dmg: 7,  gold: 8,  color: "#4a3a63", eye: "#ffb0f0", name: "Bat",
              fly: { lo: 0.32, hi: 0.74, amp: 26, freq: 3.0 } },
    harpy:  { r: 16, speed: 76,  hp: 65,  dmg: 14, gold: 18, color: "#7a5a3a", eye: "#ffe08a", name: "Harpy",
              fly: { lo: 0.24, hi: 0.62, amp: 40, freq: 1.6 } },
    wyvern: { r: 22, speed: 56,  hp: 150, armor: 80, dmg: 26, gold: 34, color: "#3f6b52", eye: "#b6ffdd", name: "Wyvern",
              fly: { lo: 0.16, hi: 0.52, amp: 34, freq: 1.1 } },
    // bosses
    miniboss: { r: 34, speed: 26, hp: 420, dmg: 30, gold: 120, color: "#3a5a3f", eye: "#c7ff9a", name: "Ogre" },
    siegeboss:{ r: 36, speed: 20, hp: 260, armor: 300, dmg: 55, gold: 150, color: "#5b5347", eye: "#ffd08a", name: "Siege Tower" },
    skyboss:  { r: 30, speed: 46, hp: 380, armor: 90,  dmg: 40, gold: 160, color: "#2f4d6b", eye: "#9fe8ff", name: "Sky Terror",
                fly: { lo: 0.14, hi: 0.50, amp: 50, freq: 0.9 } },
    boss:     { r: 46, speed: 22, hp: 2600, armor: 700, dmg: 60, gold: 400, color: "#7a1f2b", eye: "#ffdd55", name: "Warlord" },
  };

  const BOSS_TYPES = new Set(["miniboss", "siegeboss", "skyboss", "boss"]);
  // endless cycles its mini-boss so each one demands a different answer:
  // raw HP, then heavy plating, then an airborne target.
  const MINIBOSS_ROTATION = ["miniboss", "siegeboss", "skyboss"];

  // ---------- wave generation ----------
  // Spawn table: `at` is the wave the type unlocks, `cost` its share of the wave
  // budget, `w` its pick weight once available.
  const SPAWN_TABLE = [
    { type: "grunt",  at: 1,  cost: 1.0, w: 3.0 },
    { type: "runner", at: 2,  cost: 1.1, w: 2.2 },
    { type: "bat",    at: 3,  cost: 1.4, w: 2.0 },
    { type: "brute",  at: 4,  cost: 3.2, w: 1.6 },
    { type: "sapper", at: 5,  cost: 2.6, w: 1.8 },
    { type: "shaman", at: 6,  cost: 2.2, w: 1.4 },
    { type: "harpy",  at: 8,  cost: 3.0, w: 1.5 },
    { type: "ram",    at: 11, cost: 6.0, w: 1.2 },
    { type: "wyvern", at: 13, cost: 5.2, w: 1.3 },
  ];

  // Returns an array of {type} to spawn for a given wave number.
  function buildWave(n) {
    const q = [];
    if (state.mode === "levels" && n === 10) {
      // boss finale
      for (let i = 0; i < 12; i++) q.push({ type: "grunt" });
      for (let i = 0; i < 6; i++) q.push({ type: "runner" });
      for (let i = 0; i < 5; i++) q.push({ type: "bat" });
      for (let i = 0; i < 3; i++) q.push({ type: "sapper" });
      shuffleLight(q);
      q.push({ type: "boss" });
      return q;
    }
    const pool = SPAWN_TABLE.filter(e => n >= e.at);
    const totalW = pool.reduce((s, e) => s + e.w, 0);
    let pts = 6 + n * 2.6;                 // "points" to spend on enemies
    let guard = 0;
    while (pts > 0 && guard++ < 400) {
      let roll = Math.random() * totalW;
      let pick = pool[0];
      for (const e of pool) { roll -= e.w; if (roll <= 0) { pick = e; break; } }
      if (pick.cost > pts + 0.5) { break; }
      q.push({ type: pick.type });
      pts -= pick.cost;
    }
    shuffleLight(q);
    // mini-bosses headline their wave and spawn last
    if (isMiniBossWave(n)) q.push({ type: miniBossFor(n) });
    else if (state.mode === "levels" && n === 5) q.push({ type: "miniboss" });
    return q;
  }
  function isMiniBossWave(n) {
    return state.mode === "endless" && n > 0 && n % MINIBOSS_EVERY === 0;
  }
  // Which mini-boss belongs to an endless mini-boss wave (5 -> Ogre, 10 -> Tower, ...).
  function miniBossFor(n) {
    const idx = Math.floor(n / MINIBOSS_EVERY) - 1;
    return MINIBOSS_ROTATION[idx % MINIBOSS_ROTATION.length];
  }
  function shuffleLight(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Enemy scaling. HP (and armor) climb geometrically so stacking Arrow Power
  // alone can never keep pace — you have to answer with the right tool. Damage
  // and especially gold grow far slower, so the economy can't outrun the horde.
  function waveScale(n) { return Math.pow(1.13, n - 1) * (1 + (n - 1) * 0.05); }
  const DMG_SCALE_POW = 0.6;
  const GOLD_SCALE_POW = 0.55;

  function spawnEnemy(type) {
    const base = ENEMY_TYPES[type];
    const scale = waveScale(state.wave);
    const fixed = type === "boss";              // campaign boss is balanced as a fixed fight
    const isBoss = BOSS_TYPES.has(type);
    const bulk = fixed ? 1 : scale;
    const hp = Math.round(base.hp * bulk);
    const armor = Math.round((base.armor || 0) * bulk);
    const fly = base.fly || null;
    // pick a cruising altitude inside this type's band
    const homeY = fly
      ? world.groundY * (fly.lo + Math.random() * (fly.hi - fly.lo))
      : world.groundY - base.r;
    enemies.push({
      type,
      x: -40,
      y: homeY,
      homeY,            // altitude it cruises at before the dive
      fly,
      phase: Math.random() * Math.PI * 2,   // desync the wing bob between flyers
      r: base.r,
      speed: base.speed * (0.9 + Math.random() * 0.2),
      hp,
      maxHp: hp,
      armor,
      armorMax: armor,
      dmg: Math.round(base.dmg * (fixed ? 1 : Math.pow(scale, DMG_SCALE_POW))),
      gold: Math.round(base.gold * (fixed ? 1 : Math.pow(scale, GOLD_SCALE_POW))),
      color: base.color,
      eye: base.eye,
      name: base.name,
      boss: isBoss,
      wob: Math.random() * Math.PI * 2,     // walk animation phase
      hitFlash: 0,
      armorFlash: 0,    // white plating flash when armor takes a hit
      slowTimer: 0,     // remaining seconds of chill
      slowFactor: 0,    // fraction of speed removed while chilled
      poisonTimer: 0,   // remaining seconds of poison
      poisonDps: 0,     // health damage per second while poisoned
      poisonTick: 0,    // accumulator so poison floaters don't spam
    });
  }

  // ---------- wave control ----------
  function startWave(n) {
    state.wave = n;
    state.spawnQueue = buildWave(n);
    state.waveTotal = state.spawnQueue.length;
    state.spawnTimer = 0;
    state.betweenWaves = 0;
    state.dayPhase = 0;   // reset the sky to midnight for the new wave
    ui.setWave(n);
    ui.setProgress();
    if (state.mode === "levels" && n === 10) banner("FINAL WAVE", "10 / 10 — the Warlord");
    else if (isMiniBossWave(n)) {
      const mb = ENEMY_TYPES[miniBossFor(n)];
      banner("Mini-Boss Wave", `Wave ${n} — ${mb.name} approaches`);
    } else if (state.mode === "levels" && n === 5) banner("Mini-Boss Wave", "5 / 10 — an Ogre approaches");
    else banner("Wave " + n, state.mode === "levels" ? `${n} / 10` : "Endless");
    sound.wave();
  }

  function onWaveCleared() {
    if (state.mode === "levels" && state.wave >= 10) { endGame(true); return; }
    // reward for clearing
    const bonus = 20 + state.wave * 8;
    addGold(bonus, world.ballista.x, world.ballista.y - 40, true);
    state.betweenWaves = 3.0;   // breather before next wave
    banner("Wave cleared!", `+${bonus} ${COIN_SVG}  ·  next in 3s`);
  }

  // ---------- shooting ----------
  function tryFire(dt) {
    state.fireCooldown -= dt;
    if ((!state.aiming && !state.autoFire) || state.fireCooldown > 0) return;
    const rate = stat("fireRate");
    state.fireCooldown = 1 / rate;

    const bx = world.ballista.x, by = world.ballista.y;
    let ang = Math.atan2(state.aim.y - by, state.aim.x - bx);
    // face left-ish only (can't shoot behind the wall)
    const speed = stat("arrowSpeed");
    const dmg = stat("damage");
    const range = speed * FLAT_TIME;   // flat reach derives from arrow speed
    const shots = Math.round(stat("multishot"));
    // angular gap between adjacent arrows, tightened by the Focused Volley upgrade
    const spread = 0.12 * (1 - stat("focus"));
    const start = -(shots - 1) / 2;
    for (let i = 0; i < shots; i++) {
      const a = ang + (start + i) * spread;
      arrows.push({
        x: bx + Math.cos(a) * 34,
        y: by + Math.sin(a) * 34,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        dmg,
        pierceLeft: Math.round(stat("pierce")),
        hitIds: new Set(),
        angle: a,
        range,           // flat-flight distance before gravity kicks in
        traveled: 0,     // distance flown so far
        falling: false,  // true once range is spent
        life: 6,         // safety cap so arrows never live forever
      });
    }
    sound.shoot();
  }

  // ---------- damage / effects ----------
  // Routes a hit through armor first. `splash` hits are quieter (no crit text,
  // no on-hit effects) so an explosion doesn't blanket the field in status.
  function damageEnemy(e, dmg, isCrit, splash) {
    let toHp = dmg, toArmor = 0;
    if (e.armor > 0) {
      const ap = stat("apierce");
      const blunt = stat("blunt");
      toHp = dmg * ap;                               // armor piercing skips the plating
      toArmor = dmg * (1 - ap) * ARMOR_SOAK * blunt;
      if (toArmor >= e.armor) {
        // plating shatters — the surplus carries on to health at its raw value
        toHp += (toArmor - e.armor) / (ARMOR_SOAK * blunt);
        toArmor = e.armor;
        e.armor = 0;
        e.armorFlash = 0.3;
        breakArmor(e);
      } else {
        e.armor -= toArmor;
        e.armorFlash = 0.12;
      }
    }
    e.hp -= toHp;
    e.hitFlash = 0.12;

    if (!splash) {
      // frost arrows chill the target (bosses resist, only half the slow)
      const chill = stat("chill");
      if (chill > 0) {
        e.slowFactor = e.boss ? chill * 0.5 : chill;
        e.slowTimer = CHILL_DURATION;
      }
      // toxins bypass plating entirely — the siege answer that armor can't stop
      const tox = stat("poison");
      if (tox > 0) {
        e.poisonDps = Math.max(e.poisonDps, dmg * tox);
        e.poisonTimer = POISON_DURATION;
      }
    }

    // one floater per hit — steel-coloured while the plating is still soaking it
    const armorHit = toArmor > toHp;
    floaters.push({
      x: e.x, y: e.y - e.r - 6,
      text: Math.round(Math.max(toArmor, toHp)) + (isCrit ? "!" : ""),
      color: armorHit ? "#aebdd4" : isCrit ? "#ffd94a" : "#ffffff",
      vy: -34, life: splash ? 0.4 : 0.6, size: isCrit ? 20 : 14,
    });
    for (let i = 0; i < (isCrit ? 8 : 4); i++) {
      particles.push(spark(e.x, e.y, armorHit ? "#dfe6f2" : e.eye));
    }
    if (e.hp <= 0) killEnemy(e);
    else if (!splash) sound.hit();
  }

  // plating gives way — steel shards and a distinct crack
  function breakArmor(e) {
    for (let i = 0; i < 14; i++) particles.push(spark(e.x, e.y, "#e6ecf7", 1.3));
    floaters.push({ x: e.x, y: e.y - e.r - 22, text: "ARMOR BROKEN", color: "#cfd8ea",
      vy: -26, life: 0.8, size: 13 });
    sound.crack();
  }

  // Explosive tips: splash everything around the impact, falling off with range.
  function explode(x, y, dmg, radius, source) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e === source) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d <= radius) {
        const falloff = 1 - Math.max(0, d) / radius * 0.6;
        damageEnemy(e, dmg * falloff, false, true);
      }
    }
    blasts.push({ x, y, r: radius, life: 0.3, max: 0.3 });
    for (let i = 0; i < 10; i++) particles.push(spark(x, y, "#ffb14a", 1.4));
    sound.boom();
  }

  function killEnemy(e) {
    e.dead = true;
    state.kills++;
    const g = Math.max(1, Math.round(e.gold * stat("gold")));
    addGold(g, e.x, e.y - e.r, false);
    for (let i = 0; i < (e.boss ? 40 : 10); i++) particles.push(spark(e.x, e.y, e.color, e.boss ? 2 : 1));
    sound.kill();
    if (e.boss) state.shake = Math.min(state.shake + 18, 22);
  }

  function addGold(amount, x, y, big) {
    state.gold += amount;
    state.goldEarned += amount;
    floaters.push({ x, y, text: "+" + amount, color: "#ffcf5c", vy: -30, life: big ? 1.1 : 0.7,
      size: big ? 22 : 15, coin: true });
    ui.setGold();
  }

  function spark(x, y, color, scale = 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = (40 + Math.random() * 130) * scale;
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.4 + Math.random() * 0.4,
      max: 0.8, color, r: (1.5 + Math.random() * 2.5) * scale };
  }

  function damageWall(amount, atY) {
    state.wallHp -= amount;
    state.shake = Math.min(state.shake + amount * 0.4, 16);
    sound.hurt();
    for (let i = 0; i < 12; i++) {
      const p = spark(world.wallX, atY, "#c9b48c");
      p.vx = -Math.abs(p.vx) * 0.6 - 20;
      particles.push(p);
    }
    ui.setWall();
    if (state.wallHp <= 0) { state.wallHp = 0; ui.setWall(); endGame(false); }
  }

  // ---------- main update ----------
  let lastT = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    if (state.running && !state.paused && !state.over) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);

    // wall regen
    const regen = stat("regen");
    if (regen > 0 && state.wallHp > 0 && state.wallHp < state.wallMax) {
      state.wallHp = Math.min(state.wallMax, state.wallHp + regen * dt);
      ui.setWall();
    }

    // passive income — steady tribute + periodic interest on held gold
    const tribute = stat("tribute");
    if (tribute > 0) {
      const g = tribute * dt;           // fractional; accumulates silently
      state.gold += g;
      state.goldEarned += g;
      ui.setGold();
    }
    const iRate = stat("interest");
    if (iRate > 0) {
      state.interestTimer -= dt;
      if (state.interestTimer <= 0) {
        state.interestTimer += INTEREST_PERIOD;
        // capped payout — the vault holds only so much, so interest can't compound away
        const gain = Math.floor(Math.min(state.gold * iRate, vaultCap(iRate)));
        if (gain >= 1) addGold(gain, world.ballista.x - 6, world.ballista.y - 64, true);
      }
    } else {
      state.interestTimer = INTEREST_PERIOD;
    }

    // spawn logic
    if (state.betweenWaves > 0) {
      state.betweenWaves -= dt;
      if (state.betweenWaves <= 0) startWave(state.wave + 1);
    } else if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const next = state.spawnQueue.shift();
        spawnEnemy(next.type);
        // spawn faster in later waves
        const gap = Math.max(0.32, 1.15 - state.wave * 0.03);
        state.spawnTimer = gap * (0.7 + Math.random() * 0.6);
      }
    } else if (enemies.length === 0) {
      onWaveCleared();
    }
    ui.setProgress();
    // ease the day/night phase toward the current wave progress
    const dayTarget = ui.waveFraction();
    state.dayPhase += (dayTarget - state.dayPhase) * Math.min(1, dt * 1.8);

    tryFire(dt);

    // arrows
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      // once the arrow has flown its full range, gravity takes over and it arcs down
      if (!a.falling) {
        a.traveled += Math.hypot(a.vx, a.vy) * dt;
        if (a.traveled >= a.range) a.falling = true;
      }
      if (a.falling) {
        a.vy += GRAVITY * dt;
        a.angle = Math.atan2(a.vy, a.vx); // nose follows the trajectory
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
      // remove when it strikes the ground or leaves the field
      if (a.life <= 0 || a.x < -40 || a.x > W + 40 || a.y >= world.groundY - 1) {
        if (a.y >= world.groundY - 6 && a.x > 0 && a.x < W) {
          for (let k = 0; k < 3; k++) {
            const pp = spark(a.x, world.groundY - 2, "#b7a377");
            pp.vy = -Math.abs(pp.vy) * 0.4;
            particles.push(pp);
          }
        }
        arrows.splice(i, 1);
        continue;
      }
      // collide with enemies
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead || a.hitIds.has(e)) continue;
        const dx = e.x - a.x, dy = e.y - a.y;
        if (dx * dx + dy * dy <= (e.r + 4) * (e.r + 4)) {
          const isCrit = Math.random() < stat("crit");
          const hit = a.dmg * (isCrit ? 2 : 1);
          damageEnemy(e, hit, isCrit);
          const aoe = stat("explosive");
          if (aoe > 0) explode(a.x, a.y, hit * aoe, blastRadius(aoe), e);
          a.hitIds.add(e);
          if (a.pierceLeft <= 0) { arrows.splice(i, 1); break; }
          a.pierceLeft--;
          a.dmg *= 0.85; // slight falloff through bodies
        }
      }
    }

    // enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.armorFlash > 0) e.armorFlash -= dt;

      // poison burns health directly, straight through any plating
      if (e.poisonTimer > 0) {
        e.poisonTimer -= dt;
        const tick = e.poisonDps * dt;
        e.hp -= tick;
        e.poisonTick += tick;
        if (e.poisonTick >= Math.max(4, e.maxHp * 0.02)) {
          floaters.push({ x: e.x + (Math.random() - 0.5) * e.r, y: e.y - e.r - 2,
            text: Math.round(e.poisonTick), color: "#9ff06a", vy: -26, life: 0.5, size: 13 });
          e.poisonTick = 0;
        }
        if (Math.random() < dt * 8) particles.push(spark(e.x, e.y, "#8fdc5a", 0.7));
        if (e.hp <= 0) { killEnemy(e); enemies.splice(i, 1); continue; }
      }

      // chill: reduce effective speed while the slow timer is active
      let sp = e.speed;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        sp *= Math.max(0.1, 1 - e.slowFactor);
      }
      e.x += sp * dt;

      if (e.fly) {
        // cruise in, then swoop down onto the battlements over the last stretch
        const dive = clamp((e.x - (world.wallX - DIVE_DIST)) / DIVE_DIST, 0, 1);
        const target = e.homeY + (world.groundY - 110 - e.homeY) * dive;
        e.wob += dt * e.fly.freq * 7;                 // wing beat
        e.y = target + Math.sin(state.time * e.fly.freq * 2 + e.phase) * e.fly.amp * (1 - dive * 0.7);
      } else {
        e.wob += dt * (sp * 0.06);   // waddle slows with them
      }

      // reached wall?
      if (e.x + e.r >= world.wallX) {
        damageWall(e.dmg, e.y);
        e.dead = true;
        enemies.splice(i, 1);
      }
    }

    // explosion rings
    for (let i = blasts.length - 1; i >= 0; i--) {
      blasts[i].life -= dt;
      if (blasts[i].life <= 0) blasts.splice(i, 1);
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 320 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    // floaters
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += f.vy * dt;
      f.vy *= 0.92;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  // ---------- rendering ----------
  function render() {
    // fill the whole backing store (covers the letterbox bars) in device space
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, view.winW, view.winH);

    // switch to the scaled, centered virtual field
    applyView();
    ctx.save();
    // clip so nothing spills into the letterbox bars
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    // camera shake (in virtual units)
    let sx = 0, sy = 0;
    if (state.shake > 0) {
      sx = (Math.random() - 0.5) * state.shake;
      sy = (Math.random() - 0.5) * state.shake;
    }
    ctx.translate(sx, sy);

    drawBackground();
    drawWall();
    enemies.forEach(drawEnemy);
    arrows.forEach(drawArrow);
    drawBallista();
    blasts.forEach(drawBlast);
    particles.forEach(drawParticle);
    floaters.forEach(drawFloater);
    drawAimGuide();

    ctx.restore();
  }

  // ---- day/night helpers ----
  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lerpColor(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  }
  // fixed star field in normalized coords (upper part of the sky)
  const STARS = Array.from({ length: 68 }, () => ({
    x: Math.random(), y: Math.random() * 0.62, r: Math.random() * 1.3 + 0.3, tw: Math.random() * Math.PI * 2,
  }));

  function drawBackground() {
    const p = Math.max(0, Math.min(1, state.dayPhase)); // 0 midnight -> 1 dawn
    const gy = world.groundY;

    // sky gradient, interpolated from a midnight to a dawn palette
    const sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0.0, lerpColor("#05070f", "#1a2444", p));  // zenith
    sky.addColorStop(0.55, lerpColor("#0b1226", "#544a86", p)); // mid sky
    sky.addColorStop(1.0, lerpColor("#182247", "#ffb066", p));  // horizon glow
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, gy + 2);

    // stars twinkle at night, fade out toward dawn
    const starA = Math.max(0, 1 - p * 1.6);
    if (starA > 0.01) {
      ctx.save();
      ctx.fillStyle = "#eaf0ff";
      for (const s of STARS) {
        const tw = 0.6 + 0.4 * Math.sin(state.time * 2 + s.tw);
        ctx.globalAlpha = starA * tw * 0.9;
        ctx.beginPath(); ctx.arc(s.x * W, s.y * gy, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // moon: high at midnight, sinks and fades as dawn approaches
    const moonA = Math.max(0, 1 - p * 1.5);
    if (moonA > 0.01) {
      const mx = W * 0.22, my = gy * (0.26 + p * 0.5);
      ctx.save();
      ctx.globalAlpha = moonA;
      ctx.fillStyle = "#e9eeff";
      ctx.beginPath(); ctx.arc(mx, my, 32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lerpColor("#0b1226", "#544a86", p);   // carve a crescent
      ctx.beginPath(); ctx.arc(mx + 13, my - 8, 30, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // sun: rises from the horizon toward dawn
    const sunUp = (p - 0.35) / 0.65;   // 0 below horizon -> 1 fully risen
    if (sunUp > 0.01) {
      const sx = W * 0.5, sy = gy - sunUp * gy * 0.42;
      ctx.save();
      ctx.globalAlpha = Math.min(1, sunUp * 1.4);
      const glow = ctx.createRadialGradient(sx, sy, 6, sx, sy, 150);
      glow.addColorStop(0, "rgba(255,214,140,0.85)");
      glow.addColorStop(1, "rgba(255,150,80,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 150, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd884";
      ctx.beginPath(); ctx.arc(sx, sy, 40, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // far hills silhouette (drawn over the sun so it appears to rise behind them)
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = lerpColor("#0a0f20", "#241a33", p);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    const hbase = gy - 40;
    for (let x = 0; x <= W; x += 60) {
      ctx.lineTo(x, hbase - Math.sin(x * 0.01) * 26 - 18);
    }
    ctx.lineTo(W, gy); ctx.closePath(); ctx.fill();
    ctx.restore();

    // ground, warming slightly at dawn
    const gr = ctx.createLinearGradient(0, gy, 0, H);
    gr.addColorStop(0, lerpColor("#2a2416", "#3a2c1a", p));
    gr.addColorStop(1, lerpColor("#15110a", "#1b130b", p));
    ctx.fillStyle = gr;
    ctx.fillRect(0, gy, W, H - gy);
    // ground top line
    ctx.strokeStyle = `rgba(255,220,150,${0.15 + p * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  function drawWall() {
    const wx = world.wallX;
    const topY = world.groundY - Math.min(220, H * 0.34);
    // wall body
    const g = ctx.createLinearGradient(wx, 0, W, 0);
    g.addColorStop(0, "#4a4030");
    g.addColorStop(1, "#2c2619");
    ctx.fillStyle = g;
    ctx.fillRect(wx, topY, W - wx, world.groundY - topY);
    // battlements
    ctx.fillStyle = "#3c331f";
    const bw = 26;
    for (let x = wx; x < W; x += bw * 1.6) {
      ctx.fillRect(x, topY - 20, bw, 20);
    }
    // brick lines
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    for (let y = topY; y < world.groundY; y += 24) {
      ctx.beginPath(); ctx.moveTo(wx, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // damage tint based on wall hp
    const frac = state.wallMax > 0 ? state.wallHp / state.wallMax : 0;
    if (frac < 0.999) {
      ctx.fillStyle = `rgba(255,60,60,${(1 - frac) * 0.28})`;
      ctx.fillRect(wx, topY - 20, W - wx, world.groundY - topY + 20);
    }
    // boundary marker (where enemies deal damage)
    ctx.strokeStyle = "rgba(255,93,108,0.35)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wx, topY - 24); ctx.lineTo(wx, world.groundY); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBallista() {
    const bx = world.ballista.x, by = world.ballista.y;
    let ang = state.aiming
      ? Math.atan2(state.aim.y - by, state.aim.x - bx)
      : Math.PI; // face left by default
    // clamp so it looks left-ish
    // base / platform
    ctx.fillStyle = "#2a2013";
    ctx.fillRect(bx - 20, by + 8, 44, world.groundY - (by + 8));
    // wheel
    ctx.fillStyle = "#3a2c19";
    ctx.beginPath(); ctx.arc(bx - 4, world.groundY - 14, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#5a4327"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx - 4, world.groundY - 14, 16, 0, Math.PI * 2); ctx.stroke();

    // rotating arm
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    // bow limbs
    ctx.strokeStyle = "#caa66a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(30, -18); ctx.quadraticCurveTo(40, 0, 30, 18);
    ctx.stroke();
    // string
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(30, -18); ctx.lineTo(30, 18); ctx.stroke();
    // stock
    ctx.fillStyle = "#6a4f2c";
    ctx.fillRect(-6, -5, 40, 10);
    ctx.restore();

    // pivot mount
    ctx.fillStyle = "#8a6a3c";
    ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
  }

  function drawArrow(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    // shaft
    ctx.strokeStyle = "#e9d9a8";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(6, 0); ctx.stroke();
    // head
    ctx.fillStyle = "#fff2c8";
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    // fletching
    ctx.strokeStyle = "#ff8a5c";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-18, -4); ctx.moveTo(-14, 0); ctx.lineTo(-18, 4); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    const bob = e.fly ? 0 : Math.sin(e.wob) * (e.r * 0.12);
    const x = e.x, y = e.y + bob;
    // ground shadow — flyers cast a faint, flattened one from altitude
    const alt = e.fly ? clamp((world.groundY - y) / world.groundY, 0, 1) : 0;
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - alt * 0.75)})`;
    ctx.beginPath();
    ctx.ellipse(x, world.groundY - 2, e.r * (0.9 - alt * 0.35), e.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    const tint = e.hitFlash > 0 ? "#ffffff" : e.color;
    if (e.fly) {
      // wings beat behind the body
      const flap = Math.sin(e.wob);
      ctx.strokeStyle = tint;
      ctx.lineWidth = Math.max(2, e.r * 0.2);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - e.r * 0.3, y);
      ctx.quadraticCurveTo(x - e.r * 1.4, y - e.r * (0.5 + flap * 0.8), x - e.r * 2.0, y + e.r * flap * 0.5);
      ctx.moveTo(x + e.r * 0.3, y);
      ctx.quadraticCurveTo(x + e.r * 1.4, y - e.r * (0.5 + flap * 0.8), x + e.r * 2.0, y + e.r * flap * 0.5);
      ctx.stroke();
      ctx.lineCap = "butt";
      // body
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.ellipse(x, y, e.r, e.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // body
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(x, y, e.r, 0, Math.PI * 2);
      ctx.fill();
      // little legs
      ctx.strokeStyle = tint;
      ctx.lineWidth = Math.max(2, e.r * 0.16);
      const legSwing = Math.sin(e.wob) * e.r * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - e.r * 0.4, y + e.r * 0.7); ctx.lineTo(x - e.r * 0.4 + legSwing, world.groundY - 1);
      ctx.moveTo(x + e.r * 0.4, y + e.r * 0.7); ctx.lineTo(x + e.r * 0.4 - legSwing, world.groundY - 1);
      ctx.stroke();
    }
    ctx.restore();

    // armor plating — a steel shell that thins out as it's battered away
    if (e.armor > 0) {
      const frac = e.armor / e.armorMax;
      ctx.save();
      ctx.strokeStyle = e.armorFlash > 0 ? "#ffffff" : "#b9c4d6";
      ctx.lineWidth = Math.max(2, e.r * 0.22 * (0.4 + frac * 0.6));
      ctx.beginPath();
      ctx.arc(x, y, e.r + 3, -Math.PI * 0.62, Math.PI * 0.62);
      ctx.stroke();
      // rivets along the plate
      ctx.fillStyle = e.armorFlash > 0 ? "#ffffff" : "#8f9bb0";
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.44;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (e.r + 3), y + Math.sin(a) * (e.r + 3), Math.max(1.2, e.r * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // frost overlay while chilled — fades as the slow wears off
    if (e.slowTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.slowTimer / CHILL_DURATION) * 0.45;
      ctx.fillStyle = "#9fe8ff";
      ctx.beginPath(); ctx.arc(x, y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, e.slowTimer / CHILL_DURATION) * 0.8;
      ctx.strokeStyle = "#d6f6ff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, e.r + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // poison haze while the toxin is working
    if (e.poisonTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.poisonTimer / POISON_DURATION) * 0.32;
      ctx.fillStyle = "#8fdc5a";
      ctx.beginPath(); ctx.arc(x, y, e.r + 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // eye(s) — facing right toward the wall
    ctx.fillStyle = e.eye;
    ctx.beginPath(); ctx.arc(x + e.r * 0.4, y - e.r * 0.15, e.r * 0.2, 0, Math.PI * 2); ctx.fill();
    if (e.boss) {
      ctx.beginPath(); ctx.arc(x + e.r * 0.4, y - e.r * 0.5, e.r * 0.16, 0, Math.PI * 2); ctx.fill();
      // horns
      ctx.strokeStyle = "#2a0d12"; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - e.r * 0.3, y - e.r * 0.8); ctx.lineTo(x - e.r * 0.6, y - e.r * 1.25);
      ctx.moveTo(x + e.r * 0.1, y - e.r * 0.85); ctx.lineTo(x + e.r * 0.2, y - e.r * 1.3);
      ctx.stroke();
    }

    // hp bar, with a steel armor bar stacked above it while plating remains
    if (e.hp < e.maxHp || e.armor > 0) {
      const bw = e.r * 2.1, bh = e.boss ? 7 : 4;
      const bx = x - bw / 2;
      // keep the health bar where it always sat and stack armor on top of it
      let byy = y - e.r - (e.boss ? 16 : 10) - (e.armorMax > 0 ? bh + 3 : 0);
      if (e.armorMax > 0) {
        const af = Math.max(0, e.armor / e.armorMax);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(bx - 1, byy - 1, bw + 2, bh + 2);
        ctx.fillStyle = "#c3cede";
        ctx.fillRect(bx, byy, bw * af, bh);
        byy += bh + 3;
      }
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx - 1, byy - 1, bw + 2, bh + 2);
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = frac > 0.5 ? "#7be08a" : frac > 0.25 ? "#ffcf5c" : "#ff5d6c";
      ctx.fillRect(bx, byy, bw * frac, bh);
    }
    if (e.boss) {
      ctx.fillStyle = "#ffdd55";
      ctx.font = `bold 13px ${CANVAS_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(e.name, x, y - e.r - (e.armorMax > 0 ? 34 : 24));
    }
  }

  function drawBlast(b) {
    const t = 1 - b.life / b.max;          // 0 at ignition -> 1 as it dissipates
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.6;
    ctx.strokeStyle = "#ffb14a";
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.35 + t * 0.75), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - t) * 0.22;
    ctx.fillStyle = "#ff8a3c";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.3 + t * 0.6), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.max(0, p.life / (p.max || 0.8));
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The gold indicator is drawn with paths, never as an emoji. U+1FA99 🪙 is an
  // Emoji-12 codepoint that older Segoe UI Emoji builds don't ship, so it lands
  // as a tofu box; a vector coin can't be broken by a missing glyph.
  function drawCoin(x, y, r) {
    ctx.fillStyle = "#d99a2b";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd95c";
    ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d99a2b";
    ctx.fillRect(x - r * 0.12, y - r * 0.4, r * 0.24, r * 0.8);
  }

  function drawFloater(f) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
    ctx.font = `bold ${f.size}px ${CANVAS_FONT}`;
    ctx.textAlign = "left";
    const tw = ctx.measureText(f.text).width;
    const cr = f.size * 0.34, gap = 4;
    const total = f.coin ? cr * 2 + gap + tw : tw;
    let tx = f.x - total / 2;            // centre the coin + text as one unit
    if (f.coin) {
      drawCoin(tx + cr, f.y - f.size * 0.3, cr);
      tx += cr * 2 + gap;
    }
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, tx, f.y);
    ctx.globalAlpha = 1;
  }

  function drawAimGuide() {
    if ((!state.aiming && !state.autoFire) || !state.running || state.paused) return;
    const bx = world.ballista.x, by = world.ballista.y;
    const ang = Math.atan2(state.aim.y - by, state.aim.x - bx);
    // simulate the real projectile arc (flat until range, then gravity) for honest feedback
    const speed = stat("arrowSpeed");
    const range = speed * FLAT_TIME;
    let x = bx + Math.cos(ang) * 34, y = by + Math.sin(ang) * 34;
    let vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
    let traveled = 0, falling = false, landX = null, landY = null;
    const step = 1 / 60;
    ctx.save();
    ctx.strokeStyle = "rgba(110,231,255,0.28)";
    ctx.setLineDash([4, 9]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 260; i++) {
      if (!falling) { traveled += Math.hypot(vx, vy) * step; if (traveled >= range) falling = true; }
      if (falling) vy += GRAVITY * step;
      x += vx * step; y += vy * step;
      ctx.lineTo(x, y);
      if (y >= world.groundY - 1 || x < -20 || x > W + 20) { landX = x; landY = Math.min(y, world.groundY - 1); break; }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // mark the predicted landing spot
    if (landX != null && landX > 0 && landX < W) {
      ctx.strokeStyle = "rgba(110,231,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(landX, landY, 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function banner(text, small) {
    const el = document.getElementById("wave-banner");
    el.innerHTML = text + (small ? `<span class="small">${small}</span>` : "");
    el.classList.remove("hidden");
    // restart animation
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  // ============================================================
  //  UI / DOM wiring
  // ============================================================
  const ui = {
    el: {
      hud: document.getElementById("hud"),
      menu: document.getElementById("menu"),
      upModal: document.getElementById("upgrade-modal"),
      endModal: document.getElementById("end-modal"),
      wallFill: document.getElementById("wall-fill"),
      wallText: document.getElementById("wall-text"),
      goldText: document.getElementById("gold-text"),
      goldBig: document.getElementById("gold-big-text"),
      waveText: document.getElementById("wave-text"),
      modeText: document.getElementById("mode-text"),
      bestText: document.getElementById("best-text"),
      upList: document.getElementById("upgrade-list"),
      progressFill: document.getElementById("progress-fill"),
      progressLabel: document.getElementById("progress-label"),
      btnAutofire: document.getElementById("btn-autofire"),
    },
    setWall() {
      const f = state.wallMax > 0 ? Math.max(0, state.wallHp / state.wallMax) : 0;
      this.el.wallFill.style.width = (f * 100) + "%";
      this.el.wallFill.style.background = f > 0.5
        ? "linear-gradient(90deg,#4be08a,#2fbf6f)"
        : f > 0.25 ? "linear-gradient(90deg,#ffd95c,#e0a52f)"
        : "linear-gradient(90deg,#ff7d8a,#e03a4c)";
      this.el.wallText.textContent = `${Math.ceil(state.wallHp)} / ${state.wallMax}`;
    },
    setGold() {
      this.el.goldText.textContent = Math.floor(state.gold);
      this.el.goldBig.textContent = Math.floor(state.gold);
      if (!ui.el.upModal.classList.contains("hidden")) refreshUpgradeList();
    },
    setWave(n) {
      this.el.waveText.textContent = state.mode === "levels" ? `Wave ${n}/10` : `Wave ${n}`;
    },
    // fraction [0..1] of the current wave that has been dealt with
    waveFraction() {
      if (state.wave < 1) return 0;
      if (state.waveTotal <= 0) return state.betweenWaves > 0 ? 1 : 0;
      const remaining = state.spawnQueue.length + enemies.length;
      return Math.max(0, Math.min(1, 1 - remaining / state.waveTotal));
    },
    // the bar tracks how far through the CURRENT wave the player is
    setProgress() {
      const frac = this.waveFraction();
      const remaining = state.spawnQueue.length + enemies.length;
      const special = (state.mode === "levels" && (state.wave >= 10 || state.wave === 5))
        || isMiniBossWave(state.wave);
      let label;
      if (state.wave < 1) label = "Get ready…";
      else if (state.betweenWaves > 0 && remaining === 0) label = "Wave cleared — next incoming";
      else label = `${remaining} foe${remaining === 1 ? "" : "s"} left` + (special ? " · Boss" : "");
      this.el.progressFill.style.width = (frac * 100) + "%";
      this.el.progressFill.classList.toggle("boss", special);
      this.el.progressLabel.textContent = label;
    },
    setAutofire() {
      this.el.btnAutofire.classList.toggle("active", state.autoFire);
      const cb = document.getElementById("autofire-toggle");
      if (cb) cb.checked = state.autoFire;
    },
  };

  // ---------- best score persistence ----------
  function loadBest() {
    try {
      const v = localStorage.getItem("loneArcherBest");
      const best = v ? JSON.parse(v) : { endless: 0, levels: 0 };
      ui.el.bestText.textContent = "Wave " + (best.endless || 0)
        + (best.levels ? "  ·  Campaign " + (best.levels >= 10 ? "★" : best.levels) : "");
      return best;
    } catch (e) { return { endless: 0, levels: 0 }; }
  }
  function saveBest() {
    try {
      const best = loadBestRaw();
      if (state.mode === "endless") best.endless = Math.max(best.endless, state.wave);
      else best.levels = Math.max(best.levels, state.wave);
      localStorage.setItem("loneArcherBest", JSON.stringify(best));
    } catch (e) {}
  }
  function loadBestRaw() {
    try { const v = localStorage.getItem("loneArcherBest"); return v ? JSON.parse(v) : { endless: 0, levels: 0 }; }
    catch (e) { return { endless: 0, levels: 0 }; }
  }

  // ---------- upgrade list rendering ----------
  function refreshUpgradeList() {
    ui.el.goldBig.textContent = Math.floor(state.gold);
    UPGRADES.forEach(u => {
      const lvl = state.levels[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : upgCost(u, lvl);
      const cur = upgValue(u, lvl);
      const next = maxed ? null : upgValue(u, lvl + 1);
      const card = document.getElementById("upg-" + u.id);
      if (!card) return;
      card.querySelector(".upg-lvl").textContent = maxed ? "MAX" : `Lv ${lvl}/${u.max}`;
      const statLine = card.querySelector(".upg-stat");
      statLine.innerHTML = next != null
        ? `<b>${u.fmt(cur)}</b> → ${u.fmt(next)}`
        : `<b>${u.fmt(cur)}</b>`;
      const btn = card.querySelector(".upg-buy");
      if (maxed) {
        btn.textContent = "Maxed";
        btn.classList.add("maxed");
        btn.disabled = true;
      } else {
        btn.classList.remove("maxed");
        btn.innerHTML = `${COIN_SVG} ${cost}`;
        btn.disabled = state.gold < cost;
      }
      const sell = card.querySelector(".upg-sell");
      if (lvl <= 0) {
        sell.textContent = "Sell";
        sell.disabled = true;
      } else {
        sell.disabled = false;
        sell.innerHTML = `↩ ${Math.floor(upgCost(u, lvl - 1) * REFUND_RATE)}`;
      }
    });
  }

  function buildUpgradeCards() {
    ui.el.upList.innerHTML = "";
    let lastCat = null;
    UPGRADES.forEach(u => {
      if (u.cat !== lastCat) {
        lastCat = u.cat;
        const head = document.createElement("div");
        head.className = "upg-group";
        head.textContent = UPGRADE_CATS[u.cat] || u.cat;
        ui.el.upList.appendChild(head);
      }
      const card = document.createElement("div");
      card.className = "upg";
      card.id = "upg-" + u.id;
      card.innerHTML = `
        <div class="upg-top">
          <span class="upg-ico">${u.ico}</span>
          <span class="upg-name">${u.name}</span>
          <span class="upg-lvl"></span>
        </div>
        <div class="upg-desc">${u.desc}</div>
        <div class="upg-stat"></div>
        <div class="upg-actions">
          <button class="upg-buy"></button>
          <button class="upg-sell" title="Sell one level for a ${Math.round(REFUND_RATE * 100)}% refund"></button>
        </div>`;
      card.querySelector(".upg-buy").addEventListener("click", () => buyUpgrade(u.id));
      card.querySelector(".upg-sell").addEventListener("click", () => sellUpgrade(u.id));
      ui.el.upList.appendChild(card);
    });
  }

  function buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    const lvl = state.levels[id] || 0;
    if (lvl >= u.max) return;
    const cost = upgCost(u, lvl);
    if (state.gold < cost) return;
    state.gold -= cost;
    state.levels[id] = lvl + 1;
    // special handling
    if (id === "wallHp") {
      const newMax = stat("wallHp");
      const gained = newMax - state.wallMax;
      state.wallMax = newMax;
      state.wallHp = Math.min(newMax, state.wallHp + gained); // heal by the gained amount
    }
    sound.buy();
    ui.setWall();
    ui.setGold();
    refreshUpgradeList();
  }

  function sellUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    const lvl = state.levels[id] || 0;
    if (lvl <= 0) return;
    const refund = Math.floor(upgCost(u, lvl - 1) * REFUND_RATE);
    // wall HP mirrors the buy-time heal so selling can't be abused to heal cheaply
    if (id === "wallHp") {
      const oldMax = state.wallMax;
      state.levels[id] = lvl - 1;
      const newMax = stat("wallHp");
      state.wallMax = newMax;
      state.wallHp = Math.max(1, Math.min(newMax, state.wallHp - (oldMax - newMax)));
    } else {
      state.levels[id] = lvl - 1;
    }
    state.gold += refund;
    sound.sell();
    ui.setWall();
    ui.setGold();
    refreshUpgradeList();
  }

  // ---------- modal open/close ----------
  function openUpgrades() {
    if (!state.running || state.over) return;
    state.paused = true;
    ui.el.upModal.classList.remove("hidden");
    refreshUpgradeList();
  }
  function closeUpgrades() {
    ui.el.upModal.classList.add("hidden");
    state.paused = false;
    lastT = performance.now();
  }

  // ---------- game flow ----------
  function startGame(mode) {
    establishField();          // re-fit the logical field to the current window
    state.mode = mode;
    state.running = true;
    state.paused = false;
    state.over = false;
    state.time = 0;
    state.gold = 0;
    state.goldEarned = 0;
    state.kills = 0;
    state.wave = 0;
    state.levels = {};
    state.shake = 0;
    state.wallMax = upgValue(UPGRADES.find(u => u.id === "wallHp"), 0);
    state.wallHp = state.wallMax;
    state.aiming = false;
    state.fireCooldown = 0;
    state.interestTimer = INTEREST_PERIOD;
    state.waveTotal = 0;
    state.dayPhase = 0;
    // default aim points left toward the incoming horde until the cursor moves
    state.aim.x = world.ballista.x - 320;
    state.aim.y = world.ballista.y;
    arrows.length = 0; enemies.length = 0; particles.length = 0; floaters.length = 0; blasts.length = 0;

    ui.el.menu.classList.add("hidden");
    ui.el.endModal.classList.add("hidden");
    ui.el.upModal.classList.add("hidden");
    ui.el.hud.classList.remove("hidden");
    ui.el.modeText.textContent = mode === "levels" ? "Campaign" : "Endless";
    ui.setWall();
    ui.setGold();
    ui.setAutofire();
    ui.setProgress();
    buildUpgradeCards();

    // little grace period, then wave 1
    state.betweenWaves = 1.2;
    state.wave = 0;
    ui.setWave(1);
    banner("Get ready", state.autoFire ? "Auto-fire ON · U for upgrades" : "Hold to shoot · F auto-fire · U upgrades");
    lastT = performance.now();
  }

  function endGame(win) {
    state.over = true;
    state.running = false;
    state.aiming = false;
    saveBest();
    const titleEl = document.getElementById("end-title");
    const subEl = document.getElementById("end-sub");
    const statsEl = document.getElementById("end-stats");
    titleEl.textContent = win ? "Victory!" : "The wall has fallen";
    titleEl.className = win ? "win" : "lose";
    subEl.textContent = win
      ? "You cleared all 10 waves and slew the Warlord."
      : (state.mode === "levels"
          ? `You held until wave ${state.wave} of 10.`
          : `You survived ${state.wave} wave${state.wave === 1 ? "" : "s"}.`);
    statsEl.innerHTML = `
      <div class="end-stat"><div class="v">${state.wave}</div><div class="l">Wave</div></div>
      <div class="end-stat"><div class="v">${state.kills}</div><div class="l">Kills</div></div>
      <div class="end-stat"><div class="v">${Math.floor(state.goldEarned)}</div><div class="l">Gold</div></div>`;
    ui.el.endModal.classList.remove("hidden");
  }

  function quitToMenu() {
    state.running = false;
    state.over = false;
    state.paused = false;
    ui.el.upModal.classList.add("hidden");
    ui.el.endModal.classList.add("hidden");
    ui.el.hud.classList.add("hidden");
    ui.el.menu.classList.remove("hidden");
    loadBest();
  }

  // ============================================================
  //  Input
  // ============================================================
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    // map from screen (CSS px) into virtual field coordinates, undoing the
    // letterbox offset and scale, and clamp to the field so bar clicks behave
    const x = clamp((p.clientX - rect.left - view.ox) / view.scale, 0, W);
    const y = clamp((p.clientY - rect.top - view.oy) / view.scale, 0, H);
    return { x, y };
  }
  function onDown(e) {
    if (!state.running || state.paused || state.over) return;
    sound.ensure();
    state.aiming = true;
    const p = pointerPos(e);
    state.aim.x = p.x; state.aim.y = p.y;
    e.preventDefault();
  }
  function onMove(e) {
    // always track the cursor so auto-fire can aim without a button held
    const p = pointerPos(e);
    state.aim.x = p.x; state.aim.y = p.y;
  }
  function onUp() { state.aiming = false; }

  // ---------- auto-fire ----------
  function setAutoFire(on) {
    state.autoFire = on;
    ui.setAutofire();
    try { localStorage.setItem("loneArcherAuto", on ? "1" : "0"); } catch (e) {}
  }
  function toggleAutoFire() { sound.ensure(); setAutoFire(!state.autoFire); }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", (e) => { onMove(e); e.preventDefault(); }, { passive: false });
  window.addEventListener("touchend", onUp);

  window.addEventListener("keydown", (e) => {
    if (e.key === "u" || e.key === "U") {
      if (!state.running || state.over) return;
      if (ui.el.upModal.classList.contains("hidden")) openUpgrades();
      else closeUpgrades();
    } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (!state.running || state.over) return;
      if (ui.el.upModal.classList.contains("hidden")) openUpgrades();
      else closeUpgrades();
    } else if (e.key === "f" || e.key === "F") {
      toggleAutoFire();
    }
  });

  // menu / buttons
  document.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => startGame(card.dataset.mode));
  });
  document.getElementById("btn-upgrade").addEventListener("click", openUpgrades);
  document.getElementById("btn-resume").addEventListener("click", closeUpgrades);
  document.getElementById("btn-quit").addEventListener("click", quitToMenu);
  document.getElementById("btn-menu").addEventListener("click", quitToMenu);
  document.getElementById("btn-retry").addEventListener("click", () => startGame(state.mode));
  document.getElementById("btn-autofire").addEventListener("click", toggleAutoFire);
  document.getElementById("autofire-toggle").addEventListener("change", (e) => setAutoFire(e.target.checked));

  // sound toggles (kept in sync)
  function bindSound(id) {
    const el = document.getElementById(id);
    el.checked = sound.on;
    el.addEventListener("change", () => {
      sound.on = el.checked;
      document.getElementById("sound-toggle").checked = sound.on;
      document.getElementById("sound-toggle-2").checked = sound.on;
      if (sound.on) sound.ensure();
    });
  }
  bindSound("sound-toggle");
  bindSound("sound-toggle-2");

  // ---------- boot ----------
  try { state.autoFire = localStorage.getItem("loneArcherAuto") === "1"; } catch (e) {}
  ui.setAutofire();
  establishField();
  loadBest();
  requestAnimationFrame(frame);
})();
