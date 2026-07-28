(()=>{
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const D = {
    easy: { n: 6, label: 'Easy', base: 3500 },
    classic: { n: 8, label: 'Classic', base: 6000 },
    hard: { n: 10, label: 'Hard', base: 9000 }
  };
  const KEY = 'stardoku-v3';
  const HISTORY_LIMIT = 40;
  const REPLAY_TICK_MS = 50;
  const MAX_REPLAY_EVENTS = 6000;
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const PASTELS = ['#f7cbd6','#cfe4ff','#d1f0cf','#ffeda6','#e2d0ff','#ffd2b5','#c8efeb','#f4cdec','#e3f0b6','#ead8c2'];
  const ACCENT = '#6557d9';

  let profile = loadProfile();
  let selected = D[profile.selected] ? profile.selected : 'classic';
  let g = null;
  let rp = null;
  let timer = null;
  let replayFrame = 0;
  let pending = new Map();
  let toastTimer = 0;
  let starting = false;
  let drag = null;
  let exportObjectUrl = '';
  let exporting = false;

  function defaults(){
    return {
      levels: { easy: 1, classic: 1, hard: 1 },
      solved: 0,
      total: 0,
      streak: 0,
      best: 0,
      selected: 'classic',
      history: []
    };
  }

  function normalizeRecord(record){
    if(!record || !D[record.d] || typeof record.seed !== 'string') return null;
    const timeMs = Math.max(0, Number(record.timeMs) || (Number(record.time) || 0) * 1000);
    return {
      v: 1,
      id: String(record.id || `${Number(record.date) || Date.now()}-${record.seed.slice(0,8)}`),
      d: record.d,
      seed: record.seed.slice(0,80),
      level: Math.max(1, Number(record.level) || 1),
      timeMs,
      score: Math.max(0, Number(record.score) || 0),
      strikes: Math.max(0, Math.min(3, Number(record.strikes) || 0)),
      date: Math.max(0, Number(record.date) || 0),
      replay: typeof record.replay === 'string' ? record.replay : ''
    };
  }

  function loadProfile(){
    const base = defaults();
    try{
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      const history = Array.isArray(raw.history) ? raw.history.map(normalizeRecord).filter(Boolean).slice(0,HISTORY_LIMIT) : [];
      return {
        ...base,
        ...raw,
        levels: { ...base.levels, ...(raw.levels || {}) },
        history
      };
    }catch{
      return base;
    }
  }

  function saveProfile(){
    let history = (profile.history || []).slice(0,HISTORY_LIMIT);
    for(;;){
      try{
        localStorage.setItem(KEY, JSON.stringify({ ...profile, history }));
        profile.history = history;
        return true;
      }catch(error){
        const quota = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
        if(!quota || history.length <= 5) return false;
        history = history.slice(0,-1);
      }
    }
  }

  function rng(seed){
    let x = seed >>> 0;
    return () => {
      x = (x + 0x6D2B79F5) >>> 0;
      let t = x;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hash(value){
    let h = 2166136261;
    for(const char of String(value)){
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffle(array, random){
    for(let i = array.length - 1; i; i--){
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function randomSeed(){
    try{
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);
      return values[0].toString(36) + values[1].toString(36);
    }catch{
      return Date.now().toString(36) + Math.random().toString(36).slice(2,10);
    }
  }

  function neighbors(index, n){
    const row = Math.floor(index / n);
    const col = index % n;
    const out = [];
    for(const [dr, dc] of DIRS){
      const nextRow = row + dr;
      const nextCol = col + dc;
      if(nextRow >= 0 && nextRow < n && nextCol >= 0 && nextCol < n) out.push(nextRow * n + nextCol);
    }
    return out;
  }

  function randomSolution(n, random){
    const solution = [];
    const used = Array(n).fill(false);

    function place(row){
      if(row === n) return true;
      const candidates = shuffle([...Array(n).keys()], random);
      for(const col of candidates){
        if(used[col] || (row && Math.abs(col - solution[row - 1]) < 2)) continue;
        used[col] = true;
        solution.push(col);
        if(place(row + 1)) return true;
        solution.pop();
        used[col] = false;
      }
      return false;
    }

    if(place(0)) return solution;
    let fallback = [...Array(n).keys()].filter(x => x % 2 === 0).concat([...Array(n).keys()].filter(x => x % 2 === 1));
    if(random() < .5) fallback.reverse();
    if(random() < .5) fallback = fallback.map(col => n - 1 - col);
    return fallback;
  }

  function connected(regions, n, regionId){
    const start = regions.indexOf(regionId);
    if(start < 0) return false;
    const seen = new Set([start]);
    const stack = [start];
    while(stack.length){
      const index = stack.pop();
      for(const next of neighbors(index, n)){
        if(regions[next] === regionId && !seen.has(next)){
          seen.add(next);
          stack.push(next);
        }
      }
    }
    let total = 0;
    for(const region of regions) if(region === regionId) total++;
    return seen.size === total;
  }

  function articulationPoints(regions, n, regionId){
    const count = n * n;
    const discovered = Array(count).fill(-1);
    const low = Array(count).fill(0);
    const parent = Array(count).fill(-1);
    const articulation = new Set();
    let time = 0;

    function visit(index){
      discovered[index] = low[index] = time++;
      let children = 0;
      for(const next of neighbors(index, n)){
        if(regions[next] !== regionId) continue;
        if(discovered[next] < 0){
          parent[next] = index;
          children++;
          visit(next);
          low[index] = Math.min(low[index], low[next]);
          if(parent[index] < 0 && children > 1) articulation.add(index);
          if(parent[index] >= 0 && low[next] >= discovered[index]) articulation.add(index);
        }else if(next !== parent[index]){
          low[index] = Math.min(low[index], discovered[next]);
        }
      }
    }

    const start = regions.indexOf(regionId);
    if(start >= 0) visit(start);
    return articulation;
  }

  function candidateScore(sizes, n){
    let score = 0;
    let max = 0;
    for(const size of sizes){
      score += (size - n) * (size - n);
      max = Math.max(max, size);
    }
    return score + max * 2;
  }

  function buildCandidate(n, seed){
    const random = rng(seed);
    const last = n - 1;
    let solution;
    let regions;
    let anchors;

    for(let attempt = 0; attempt < 24; attempt++){
      solution = randomSolution(n, random);
      anchors = solution.map((col, row) => row * n + col);
      regions = Array(n * n).fill(last);
      for(let region = 0; region < last; region++) regions[anchors[region]] = region;
      if(connected(regions, n, last)) break;
    }

    if(!regions || !connected(regions, n, last)){
      solution = [...Array(n).keys()].filter(x => x % 2 === 0).concat([...Array(n).keys()].filter(x => x % 2 === 1));
      anchors = solution.map((col, row) => row * n + col);
      regions = Array(n * n).fill(last);
      for(let region = 0; region < last; region++) regions[anchors[region]] = region;
    }

    const columnRank = Array(n);
    for(let row = 0; row < n; row++) columnRank[solution[row]] = row;

    const sizes = Array(n).fill(1);
    sizes[last] = n * n - last;

    for(let guard = 0; guard < n * n * 4; guard++){
      const articulation = articulationPoints(regions, n, last);
      const moves = [];

      for(let index = 0; index < regions.length; index++){
        if(regions[index] !== last || index === anchors[last] || articulation.has(index)) continue;
        const row = Math.floor(index / n);
        const col = index % n;
        const adjacent = new Map();

        for(const next of neighbors(index, n)){
          const region = regions[next];
          if(region === last) continue;
          if(row < region || columnRank[col] < region) adjacent.set(region, (adjacent.get(region) || 0) + 1);
        }

        for(const [region, touching] of adjacent){
          const before = (sizes[region] - n) ** 2 + (sizes[last] - n) ** 2;
          const after = (sizes[region] + 1 - n) ** 2 + (sizes[last] - 1 - n) ** 2;
          const delta = after - before;
          if(delta < 0) moves.push({ index, region, score: delta - touching * .22 + random() * .35 });
        }
      }

      if(!moves.length) break;
      moves.sort((a,b) => a.score - b.score);
      const best = moves[0].score;
      const top = moves.filter(move => move.score <= best + .8).slice(0,8);
      const move = top[Math.floor(random() * top.length)];
      regions[move.index] = move.region;
      sizes[move.region]++;
      sizes[last]--;
    }

    return { n, sol: solution, reg: regions, sizes, score: candidateScore(sizes, n) };
  }

  function mapCoordinate(row, col, n, transform){
    if(transform >= 4) col = n - 1 - col;
    for(let turn = 0; turn < transform % 4; turn++){
      const nextRow = col;
      const nextCol = n - 1 - row;
      row = nextRow;
      col = nextCol;
    }
    return [row, col];
  }

  function transformPuzzle(puzzle, transform, random){
    const { n } = puzzle;
    const regions = Array(n * n);
    const solution = Array(n);

    for(let row = 0; row < n; row++){
      for(let col = 0; col < n; col++){
        const [nextRow, nextCol] = mapCoordinate(row, col, n, transform);
        regions[nextRow * n + nextCol] = puzzle.reg[row * n + col];
      }
    }

    for(let row = 0; row < n; row++){
      const [nextRow, nextCol] = mapCoordinate(row, puzzle.sol[row], n, transform);
      solution[nextRow] = nextCol;
    }

    return {
      n,
      reg: regions,
      sol: solution,
      order: shuffle([...Array(n).keys()], random),
      sizes: puzzle.sizes
    };
  }

  function make(difficulty, seed){
    const n = D[difficulty].n;
    const base = hash(`${difficulty}:${seed}:stardoku-v5`);
    const tries = n === 10 ? 6 : 5;
    let best = null;

    for(let attempt = 0; attempt < tries; attempt++){
      const candidate = buildCandidate(n, (base ^ Math.imul(attempt + 1, 0x9E3779B9)) >>> 0);
      if(!best || candidate.score < best.score) best = candidate;
    }

    const random = rng(base ^ 0xA5A5A5A5);
    return transformPuzzle(best, Math.floor(random() * 8), random);
  }

  function countSolutions(regions, n, limit = 2){
    let count = 0;
    let usedColumns = 0;
    let usedRegions = 0;

    function place(row, previousColumn){
      if(count >= limit) return;
      if(row === n){
        count++;
        return;
      }
      for(let col = 0; col < n; col++){
        const columnBit = 1 << col;
        const regionBit = 1 << regions[row * n + col];
        if((usedColumns & columnBit) || (usedRegions & regionBit) || (row && Math.abs(col - previousColumn) < 2)) continue;
        usedColumns |= columnBit;
        usedRegions |= regionBit;
        place(row + 1, col);
        usedColumns ^= columnBit;
        usedRegions ^= regionBit;
      }
    }

    place(0, -99);
    return count;
  }

  function validatePuzzle(puzzle){
    const { n, sol, reg } = puzzle;
    if(sol.length !== n || new Set(sol).size !== n) return false;
    for(let row = 1; row < n; row++) if(Math.abs(sol[row] - sol[row - 1]) < 2) return false;
    const solutionRegions = new Set();
    for(let row = 0; row < n; row++) solutionRegions.add(reg[row * n + sol[row]]);
    if(solutionRegions.size !== n) return false;
    for(let region = 0; region < n; region++) if(!connected(reg, n, region)) return false;
    return countSolutions(reg, n, 2) === 1;
  }

  function writeVarint(bytes, value){
    let number = Math.max(0, Math.floor(value));
    while(number >= 128){
      bytes.push((number & 127) | 128);
      number = Math.floor(number / 128);
    }
    bytes.push(number);
  }

  function readVarint(bytes, cursor){
    let value = 0;
    let multiplier = 1;
    let steps = 0;
    while(cursor.index < bytes.length && steps++ < 6){
      const byte = bytes[cursor.index++];
      value += (byte & 127) * multiplier;
      if(!(byte & 128)) return value;
      multiplier *= 128;
    }
    throw new Error('Invalid replay data');
  }

  function bytesToBase64Url(bytes){
    let binary = '';
    for(let offset = 0; offset < bytes.length; offset += 8192){
      binary += String.fromCharCode(...bytes.slice(offset, offset + 8192));
    }
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function base64UrlToBytes(value){
    const clean = String(value || '').replace(/-/g,'+').replace(/_/g,'/');
    const padded = clean + '='.repeat((4 - clean.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function encodeReplay(events){
    const bytes = [];
    let previousTick = 0;
    for(const event of events.slice(0, MAX_REPLAY_EVENTS)){
      const tick = Math.max(previousTick, Math.round(event.t / REPLAY_TICK_MS));
      writeVarint(bytes, tick - previousTick);
      writeVarint(bytes, event.i);
      bytes.push(event.v & 3);
      previousTick = tick;
    }
    return bytesToBase64Url(bytes);
  }

  function decodeReplay(code, n){
    if(!code || code.length > 50000) return [];
    const bytes = base64UrlToBytes(code);
    const cursor = { index: 0 };
    const events = [];
    let tick = 0;

    while(cursor.index < bytes.length && events.length < MAX_REPLAY_EVENTS){
      tick += readVarint(bytes, cursor);
      const cell = readVarint(bytes, cursor);
      if(cursor.index >= bytes.length) throw new Error('Invalid replay data');
      const state = bytes[cursor.index++];
      if(cell >= n * n || state > 3 || tick * REPLAY_TICK_MS > 6 * 60 * 60 * 1000) throw new Error('Invalid replay data');
      events.push({ t: tick * REPLAY_TICK_MS, i: cell, v: state });
    }

    return events;
  }

  function showView(id){
    for(const viewId of ['intro','gameview','replayview']) $(`#${viewId}`).hidden = viewId !== id;
  }

  function formatSeconds(seconds){
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2,'0')}:${String(safe % 60).padStart(2,'0')}`;
  }

  function formatMilliseconds(milliseconds, tenths = false){
    const safe = Math.max(0, Math.round(Number(milliseconds) || 0));
    const totalSeconds = Math.floor(safe / 1000);
    const base = formatSeconds(totalSeconds);
    return tenths ? `${base}.${Math.floor((safe % 1000) / 100)}` : base;
  }

  function formatHistoryDate(timestamp){
    if(!timestamp) return '';
    try{
      return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date(timestamp));
    }catch{
      return new Date(timestamp).toLocaleString();
    }
  }

  function buildBoard(container, puzzle, states){
    const { n, reg, order } = puzzle;
    container.style.setProperty('--n', n);
    container.classList.remove('dragging');
    container.innerHTML = '';

    for(let row = 0; row < n; row++){
      for(let col = 0; col < n; col++){
        const index = row * n + col;
        const region = reg[index];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `cell p${order[region]}`;
        cell.dataset.i = index;
        cell.dataset.state = states[index] === 1 ? 'x' : states[index] === 2 ? 'star' : 'blank';
        cell.setAttribute('role','gridcell');
        cell.setAttribute('aria-label',`Row ${row + 1}, column ${col + 1}`);
        if(!row || reg[index - n] !== region) cell.classList.add('bt');
        if(!col || reg[index - 1] !== region) cell.classList.add('bl');
        if(col === n - 1) cell.classList.add('lastc');
        if(row === n - 1) cell.classList.add('lastr');
        cell.innerHTML = '<span class="x">×</span><span class="star">★</span>';
        container.appendChild(cell);
      }
    }
  }

  function setBoardCell(container, index, state){
    const cell = container.querySelector(`.cell[data-i="${index}"]`);
    if(cell) cell.dataset.state = state === 1 ? 'x' : state === 2 ? 'star' : 'blank';
  }

  function renderIntro(){
    stopTimer();
    stopReplay();
    clearPending();
    drag = null;
    starting = false;
    $('#complete').classList.remove('open');
    $$('.mode').forEach(button => button.setAttribute('aria-pressed', button.dataset.d === selected));
    for(const difficulty in D) $(`[data-level="${difficulty}"]`).textContent = `Level ${profile.levels[difficulty]}`;
    $('#start').textContent = `Start level ${profile.levels[selected]}`;
    $('#start').disabled = false;
    $('#solved').textContent = profile.solved;
    $('#total').textContent = Number(profile.total || 0).toLocaleString();
    $('#best').textContent = profile.best;
    renderHistory();
    showView('intro');
  }

  function renderHistory(){
    const list = $('#historyList');
    const history = profile.history || [];
    list.innerHTML = '';
    $('#clearHistory').hidden = !history.length;

    if(!history.length){
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No recorded wins yet.';
      list.appendChild(empty);
      return;
    }

    for(const record of history){
      const item = document.createElement('article');
      item.className = 'history-item';
      item.dataset.id = record.id;

      const main = document.createElement('div');
      main.className = 'history-main';
      const title = document.createElement('strong');
      title.textContent = `${D[record.d].n}×${D[record.d].n} ${D[record.d].label} · ${formatMilliseconds(record.timeMs, true)}`;
      const detail = document.createElement('span');
      const date = formatHistoryDate(record.date);
      detail.textContent = `${Number(record.score || 0).toLocaleString()} points · ${record.strikes} strike${record.strikes === 1 ? '' : 's'}${date ? ` · ${date}` : ''}`;
      main.append(title, detail);

      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const share = document.createElement('button');
      share.type = 'button';
      share.className = 'btn share';
      share.dataset.action = 'share';
      share.textContent = 'Share';
      const replay = document.createElement('button');
      replay.type = 'button';
      replay.className = 'btn camera';
      replay.dataset.action = 'replay';
      replay.textContent = '📷';
      replay.setAttribute('aria-label','Watch replay');
      replay.disabled = !record.replay;
      actions.append(share, replay);

      item.append(main, actions);
      list.appendChild(item);
    }
  }

  function start(difficulty = selected, level = profile.levels[difficulty], seed = randomSeed(), challengeTimeMs = null, shared = false){
    if(starting) return;
    starting = true;
    stopReplay();
    clearPending();
    const startButton = $('#start');
    if(!$('#intro').hidden){
      startButton.disabled = true;
      startButton.textContent = 'Generating…';
    }

    requestAnimationFrame(() => setTimeout(() => {
      try{
        const puzzle = make(difficulty, seed);
        g = {
          d: difficulty,
          level,
          seed: String(seed),
          challengeTimeMs: Number.isFinite(challengeTimeMs) && challengeTimeMs > 0 ? Math.floor(challengeTimeMs) : null,
          shared,
          p: puzzle,
          cells: Array(puzzle.n * puzzle.n).fill(0),
          strikes: 3,
          hints: 2,
          moves: 0,
          start: performance.now(),
          finalTimeMs: null,
          done: false,
          events: [],
          record: null
        };
        renderGameBoard();
        showView('gameview');
        window.scrollTo(0,0);
        startTimer();
      }catch(error){
        console.error(error);
        toast('Level generation error');
        renderIntro();
      }finally{
        starting = false;
      }
    },20));
  }

  function renderGameBoard(){
    buildBoard($('#board'), g.p, g.cells);
    $('#diff').textContent = `${D[g.d].label} / ${g.p.n}×${g.p.n}`;
    $('#level').textContent = g.shared ? 'LINK' : String(g.level).padStart(3,'0');
    $('#challengeTarget').hidden = !g.challengeTimeMs;
    $('#challengeTarget').textContent = g.challengeTimeMs ? `Beat ${formatMilliseconds(g.challengeTimeMs, true)}` : '';
    setMessage(g.challengeTimeMs ? `Challenge: beat ${formatMilliseconds(g.challengeTimeMs, true)}.` : 'Tap × · double tap ★ · drag to mark');
    updateGameUi();
  }

  function resetCurrent(message = 'Level reset'){
    if(!g) return;
    clearPending();
    drag = null;
    g.cells.fill(0);
    g.strikes = 3;
    g.hints = 2;
    g.moves = 0;
    g.start = performance.now();
    g.finalTimeMs = null;
    g.done = false;
    g.events = [];
    g.record = null;
    $('#complete').classList.remove('open');
    renderGameBoard();
    startTimer();
    toast(message);
  }

  function eventTime(){
    return g ? Math.max(0, Math.round(performance.now() - g.start)) : 0;
  }

  function recordEvent(index, state){
    if(!g || g.done) return;
    g.events.push({ t: eventTime(), i: index, v: state });
  }

  function clearPending(){
    for(const value of pending.values()) clearTimeout(value.id);
    pending.clear();
  }

  function queueTap(index){
    if(!g || g.done) return;
    const now = performance.now();
    const old = pending.get(index);
    if(old && now - old.t < 390){
      clearTimeout(old.id);
      pending.delete(index);
      placeStar(index);
      return;
    }
    const id = setTimeout(() => {
      pending.delete(index);
      toggleMark(index);
    },300);
    pending.set(index,{ t: now, id });
  }

  function toggleMark(index){
    if(!g || g.done) return;
    g.cells[index] = g.cells[index] === 1 ? 0 : 1;
    g.moves++;
    recordEvent(index, g.cells[index]);
    setBoardCell($('#board'), index, g.cells[index]);
    updateGameUi();
  }

  function paintX(index, mode){
    if(!g || g.done || drag?.visited.has(index) || g.cells[index] === 2) return;
    if(drag) drag.visited.add(index);
    const next = mode ? 1 : 0;
    if(g.cells[index] !== next){
      g.cells[index] = next;
      g.moves++;
      recordEvent(index, next);
      setBoardCell($('#board'), index, next);
    }
  }

  function paintLine(from, to, mode){
    const n = g.p.n;
    const row0 = Math.floor(from / n);
    const col0 = from % n;
    const row1 = Math.floor(to / n);
    const col1 = to % n;
    const steps = Math.max(Math.abs(row1 - row0), Math.abs(col1 - col0));
    for(let step = 0; step <= steps; step++){
      const ratio = steps ? step / steps : 0;
      const row = Math.round(row0 + (row1 - row0) * ratio);
      const col = Math.round(col0 + (col1 - col0) * ratio);
      paintX(row * n + col, mode);
    }
    updateGameUi();
  }

  function cellAtPoint(x, y){
    const cell = document.elementFromPoint(x,y)?.closest?.('.cell');
    return cell && $('#board').contains(cell) ? cell : null;
  }

  function pointerDown(event){
    const cell = event.target.closest('.cell');
    if(!cell || !g || g.done || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    drag = {
      id: event.pointerId,
      start: Number(cell.dataset.i),
      last: Number(cell.dataset.i),
      x: event.clientX,
      y: event.clientY,
      moved: false,
      mode: null,
      visited: new Set()
    };
    try{ $('#board').setPointerCapture(event.pointerId); }catch{}
  }

  function pointerMove(event){
    if(!drag || event.pointerId !== drag.id || !g || g.done) return;
    const cell = cellAtPoint(event.clientX,event.clientY);
    const index = cell ? Number(cell.dataset.i) : drag.last;
    const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);

    if(!drag.moved && (index !== drag.start || distance > 8)){
      drag.moved = true;
      drag.mode = g.cells[drag.start] === 1 ? 0 : 1;
      clearPending();
      $('#board').classList.add('dragging');
      paintLine(drag.start, index, drag.mode);
    }else if(drag.moved && index !== drag.last){
      paintLine(drag.last, index, drag.mode);
    }
    drag.last = index;
  }

  function pointerUp(event){
    if(!drag || event.pointerId !== drag.id) return;
    pointerMove(event);
    const moved = drag.moved;
    const startIndex = drag.start;
    try{ $('#board').releasePointerCapture(event.pointerId); }catch{}
    $('#board').classList.remove('dragging');
    drag = null;
    if(!moved) queueTap(startIndex);
  }

  function pointerCancel(event){
    if(!drag || event.pointerId !== drag.id) return;
    $('#board').classList.remove('dragging');
    drag = null;
  }

  function placeStar(index, fromHint = false){
    if(!g || g.done) return;
    const n = g.p.n;
    const row = Math.floor(index / n);
    const correct = g.p.sol[row] === index % n;

    if(g.cells[index] === 2){
      g.cells[index] = 0;
      g.moves++;
      recordEvent(index, 0);
      setBoardCell($('#board'), index, 0);
      updateGameUi();
      return;
    }

    if(!correct && !fromHint){
      wrongStar(index);
      return;
    }

    g.cells[index] = 2;
    g.moves++;
    recordEvent(index, 2);
    setBoardCell($('#board'), index, 2);
    updateGameUi();
    if(g.cells.filter(value => value === 2).length === n) completeLevel();
  }

  function wrongStar(index){
    g.strikes--;
    g.moves++;
    recordEvent(index, 3);
    const cell = $(`.cell[data-i="${index}"]`);
    cell?.classList.add('flash');
    setTimeout(() => cell?.classList.remove('flash'),380);
    updateGameUi();

    if(g.strikes){
      setMessage(`Wrong square. ${g.strikes} strike${g.strikes === 1 ? '' : 's'} left.`,'err');
      toast(`${g.strikes} strike${g.strikes === 1 ? '' : 's'} left`);
    }else{
      setMessage('Out of strikes. Restarting…','err');
      setTimeout(() => {
        if(g && !g.done) resetCurrent('Level restarted · 3 strikes');
      },700);
    }
  }

  function hint(){
    if(!g || g.done || !g.hints) return;
    const choices = [];
    for(let row = 0; row < g.p.n; row++){
      const index = row * g.p.n + g.p.sol[row];
      if(g.cells[index] !== 2) choices.push(index);
    }
    if(!choices.length) return;
    g.hints--;
    placeStar(choices[Math.floor(Math.random() * choices.length)], true);
    setMessage('A correct star was placed.');
  }

  function elapsedMilliseconds(){
    if(!g) return 0;
    return g.finalTimeMs ?? Math.max(0, performance.now() - g.start);
  }

  function points(){
    const seconds = Math.floor(elapsedMilliseconds() / 1000);
    return Math.max(100, D[g.d].base - seconds * 4 - (3 - g.strikes) * 200 - (2 - g.hints) * 250 - g.moves * 3);
  }

  function updateGameUi(){
    if(!g) return;
    const placed = g.cells.filter(value => value === 2).length;
    $('#stars').textContent = `${placed} / ${g.p.n} stars`;
    $('#score').textContent = points().toLocaleString();
    $('#hint').textContent = `Hint · ${g.hints}`;
    $('#hint').disabled = !g.hints || g.done;
    $$('.strike').forEach((element,index) => element.classList.toggle('lost', index >= g.strikes));
    $('#time').textContent = formatMilliseconds(elapsedMilliseconds());
  }

  function completeLevel(){
    g.finalTimeMs = Math.max(1, Math.round(performance.now() - g.start));
    g.done = true;
    stopTimer();
    const score = points();
    const record = normalizeRecord({
      id: `${Date.now().toString(36)}-${g.seed.slice(0,8)}`,
      d: g.d,
      seed: g.seed,
      level: g.level,
      timeMs: g.finalTimeMs,
      score,
      strikes: g.strikes,
      date: Date.now(),
      replay: encodeReplay(g.events)
    });
    g.record = record;

    profile.total = Number(profile.total || 0) + score;
    profile.solved = Number(profile.solved || 0) + 1;
    profile.streak = Number(profile.streak || 0) + 1;
    profile.best = Math.max(Number(profile.best || 0), profile.streak);
    if(!g.shared) profile.levels[g.d] = Math.max(profile.levels[g.d], g.level + 1);
    profile.history.unshift(record);
    profile.history = profile.history.slice(0,HISTORY_LIMIT);
    saveProfile();

    let text = `${score.toLocaleString()} points · ${formatMilliseconds(g.finalTimeMs, true)} · ${g.strikes} strike${g.strikes === 1 ? '' : 's'} left`;
    if(g.challengeTimeMs){
      const delta = g.finalTimeMs - g.challengeTimeMs;
      text += delta < 0 ? ` · ${formatMilliseconds(-delta, true)} faster` : delta === 0 ? ' · tied the challenge' : ` · ${formatMilliseconds(delta, true)} slower`;
    }
    setMessage('Level complete.','ok');
    $('#result').textContent = text;
    $('#complete').classList.add('open');
  }

  function setMessage(text, className = ''){
    $('#msg').textContent = text;
    $('#msg').className = `msg${className ? ` ${className}` : ''}`;
  }

  function toast(text){
    clearTimeout(toastTimer);
    $('#toast').textContent = text;
    $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'),1500);
  }

  function startTimer(){
    stopTimer();
    timer = setInterval(updateGameUi,1000);
  }

  function stopTimer(){
    clearInterval(timer);
    timer = null;
  }

  function cleanBaseUrl(){
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    return url;
  }

  function boardUrl(record, withTime = false){
    const url = cleanBaseUrl();
    url.searchParams.set('d',record.d);
    url.searchParams.set('s',record.seed);
    if(withTime) url.searchParams.set('tm',String(Math.max(1, Math.round(record.timeMs))));
    return url.toString();
  }

  function replayUrl(record){
    const url = cleanBaseUrl();
    url.searchParams.set('v','replay');
    url.searchParams.set('d',record.d);
    url.searchParams.set('s',record.seed);
    url.searchParams.set('tm',String(Math.max(1, Math.round(record.timeMs))));
    url.searchParams.set('sc',String(Math.max(0, Math.round(record.score || 0))));
    url.searchParams.set('st',String(Math.max(0, Math.round(record.strikes || 0))));
    url.searchParams.set('lv',String(Math.max(1, Math.round(record.level || 1))));
    url.searchParams.set('r',record.replay);
    return url.toString();
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch{
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try{ copied = document.execCommand('copy'); }catch{}
      area.remove();
      return copied;
    }
  }

  async function shareOrCopy(title, text){
    if(navigator.share){
      try{
        await navigator.share({ title, text });
        return true;
      }catch(error){
        if(error?.name === 'AbortError') return false;
      }
    }
    const copied = await copyText(text);
    toast(copied ? 'Copied' : 'Could not copy');
    return copied;
  }

  async function copyLevel(){
    if(!g?.record) return;
    const copied = await copyText(boardUrl(g.record,false));
    toast(copied ? 'Level link copied' : 'Could not copy link');
  }

  async function shareChallengeRecord(record){
    const url = boardUrl(record,true);
    const text = `I solved ${D[record.d].n}×${D[record.d].n} Stardoku in ${formatMilliseconds(record.timeMs,true)}. Beat my time: ${url}`;
    await shareOrCopy('Stardoku challenge',text);
  }

  async function shareChallenge(){
    if(g?.record) await shareChallengeRecord(g.record);
  }

  function clearRoute(){
    try{ history.replaceState(null,'',location.pathname); }catch{}
  }

  function goHome(){
    clearRoute();
    renderIntro();
  }

  function parseRoute(){
    const params = new URLSearchParams(location.search);
    const difficulty = params.get('d');
    const seed = params.get('s');
    if(!D[difficulty] || !seed || seed.length > 80) return null;

    const milliseconds = Number.parseInt(params.get('tm') || '',10);
    const legacySeconds = Number.parseInt(params.get('t') || '',10);
    const timeMs = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : Number.isFinite(legacySeconds) && legacySeconds > 0 ? legacySeconds * 1000 : 0;

    if(params.get('v') === 'replay'){
      const replay = params.get('r') || '';
      if(!replay || replay.length > 50000) return null;
      return {
        type: 'replay',
        record: normalizeRecord({
          id: 'shared-replay',
          d: difficulty,
          seed,
          level: Number.parseInt(params.get('lv') || '1',10),
          timeMs,
          score: Number.parseInt(params.get('sc') || '0',10),
          strikes: Number.parseInt(params.get('st') || '0',10),
          replay,
          date: 0
        })
      };
    }

    return { type:'challenge', difficulty, seed, timeMs };
  }

  function replayDuration(record, events){
    const lastEvent = events.length ? events[events.length - 1].t : 0;
    return Math.max(record.timeMs || 0, lastEvent + 550, 1000);
  }

  function showReplay(record, fromShared = false){
    stopTimer();
    stopReplay();
    clearPending();
    $('#complete').classList.remove('open');

    try{
      const puzzle = make(record.d,record.seed);
      const events = decodeReplay(record.replay,puzzle.n);
      if(!events.length) throw new Error('Replay is empty');
      rp = {
        record,
        fromShared,
        puzzle,
        events,
        states: Array(puzzle.n * puzzle.n).fill(0),
        duration: replayDuration(record,events),
        position: 0,
        index: 0,
        speed: Number($('#replaySpeed').value) || 8,
        playing: false,
        wallStart: 0,
        basePosition: 0,
        flashTimers: new Map()
      };
      buildBoard($('#replayBoard'),puzzle,rp.states);
      $('#replayMeta').textContent = `${D[record.d].label} / ${puzzle.n}×${puzzle.n}`;
      $('#replayResultTime').textContent = formatMilliseconds(record.timeMs,true);
      $('#replayProgress').value = '0';
      $('#replayClock').textContent = `${formatMilliseconds(0)} / ${formatMilliseconds(record.timeMs)}`;
      $('#replayToggle').textContent = 'Pause';
      const mime = mp4MimeType();
      $('#exportMp4').disabled = !mime || exporting;
      $('#exportMp4').title = mime ? '' : 'MP4 export is not supported by this browser';
      showView('replayview');
      window.scrollTo(0,0);
      setTimeout(playReplay,250);
    }catch(error){
      console.error(error);
      toast('Replay could not be loaded');
      if(fromShared) clearRoute();
      renderIntro();
    }
  }

  function clearReplayFlashes(){
    if(!rp) return;
    for(const timeout of rp.flashTimers.values()) clearTimeout(timeout);
    rp.flashTimers.clear();
    $$('#replayBoard .cell.flash').forEach(cell => cell.classList.remove('flash'));
  }

  function flashReplayCell(index){
    if(!rp) return;
    const cell = $(`#replayBoard .cell[data-i="${index}"]`);
    if(!cell) return;
    const old = rp.flashTimers.get(index);
    if(old) clearTimeout(old);
    cell.classList.add('flash');
    const timeout = setTimeout(() => {
      cell.classList.remove('flash');
      rp?.flashTimers.delete(index);
    },220);
    rp.flashTimers.set(index,timeout);
  }

  function applyReplayEvent(event, animate = true){
    if(event.v === 3){
      if(animate) flashReplayCell(event.i);
      return;
    }
    rp.states[event.i] = event.v;
    setBoardCell($('#replayBoard'),event.i,event.v);
  }

  function resetReplayState(){
    if(!rp) return;
    clearReplayFlashes();
    rp.states.fill(0);
    rp.index = 0;
    buildBoard($('#replayBoard'),rp.puzzle,rp.states);
  }

  function seekReplay(position, animate = false){
    if(!rp) return;
    const target = Math.max(0,Math.min(rp.duration,position));
    if(target < rp.position){
      resetReplayState();
      rp.position = 0;
    }
    while(rp.index < rp.events.length && rp.events[rp.index].t <= target){
      applyReplayEvent(rp.events[rp.index],animate);
      rp.index++;
    }
    rp.position = target;
    $('#replayProgress').value = String(Math.round(target / rp.duration * 1000));
    $('#replayClock').textContent = `${formatMilliseconds(target)} / ${formatMilliseconds(rp.record.timeMs)}`;
  }

  function replayTick(now){
    if(!rp?.playing) return;
    const position = Math.min(rp.duration,rp.basePosition + (now - rp.wallStart) * rp.speed);
    seekReplay(position,true);
    if(position >= rp.duration){
      rp.playing = false;
      $('#replayToggle').textContent = 'Play';
      replayFrame = 0;
      return;
    }
    replayFrame = requestAnimationFrame(replayTick);
  }

  function playReplay(){
    if(!rp || rp.playing) return;
    if(rp.position >= rp.duration - 1){
      resetReplayState();
      rp.position = 0;
      seekReplay(0,false);
    }
    rp.playing = true;
    rp.basePosition = rp.position;
    rp.wallStart = performance.now();
    $('#replayToggle').textContent = 'Pause';
    replayFrame = requestAnimationFrame(replayTick);
  }

  function pauseReplay(){
    if(!rp?.playing) return;
    const position = Math.min(rp.duration,rp.basePosition + (performance.now() - rp.wallStart) * rp.speed);
    rp.playing = false;
    cancelAnimationFrame(replayFrame);
    replayFrame = 0;
    seekReplay(position,false);
    $('#replayToggle').textContent = 'Play';
  }

  function stopReplay(){
    if(rp?.playing) pauseReplay();
    cancelAnimationFrame(replayFrame);
    replayFrame = 0;
    clearReplayFlashes();
    rp = null;
  }

  function restartReplay(){
    if(!rp) return;
    const shouldPlay = rp.playing;
    if(shouldPlay) pauseReplay();
    resetReplayState();
    rp.position = 0;
    seekReplay(0,false);
    if(shouldPlay || !rp.playing) playReplay();
  }

  function toggleReplay(){
    if(!rp) return;
    rp.playing ? pauseReplay() : playReplay();
  }

  function changeReplaySpeed(){
    if(!rp) return;
    const wasPlaying = rp.playing;
    if(wasPlaying) pauseReplay();
    rp.speed = Number($('#replaySpeed').value) || 8;
    if(wasPlaying) playReplay();
  }

  function scrubReplay(){
    if(!rp) return;
    const wasPlaying = rp.playing;
    if(wasPlaying) pauseReplay();
    seekReplay(Number($('#replayProgress').value) / 1000 * rp.duration,false);
    if(wasPlaying) playReplay();
  }

  async function shareReplayRecord(record){
    const url = replayUrl(record);
    const text = `Stardoku replay · ${D[record.d].n}×${D[record.d].n} · ${formatMilliseconds(record.timeMs,true)}: ${url}`;
    await shareOrCopy('Stardoku replay',text);
  }

  function mp4MimeType(){
    if(typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return '';
    const candidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4;codecs="avc1.42E01E"',
      'video/mp4;codecs=h264',
      'video/mp4'
    ];
    if(typeof MediaRecorder.isTypeSupported !== 'function') return 'video/mp4';
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function drawStar(context,cx,cy,outer,inner,fill){
    context.beginPath();
    for(let point = 0; point < 10; point++){
      const radius = point % 2 ? inner : outer;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if(point) context.lineTo(x,y); else context.moveTo(x,y);
    }
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  }

  function drawReplayFrame(context,canvas,puzzle,states,sourceTime,duration,record,flashes,speed){
    const width = canvas.width;
    const height = canvas.height;
    const margin = 40;
    const boardTop = 130;
    const boardSize = width - margin * 2;
    const cellSize = boardSize / puzzle.n;

    context.fillStyle = '#f5f5f2';
    context.fillRect(0,0,width,height);

    context.fillStyle = ACCENT;
    context.fillRect(margin,30,48,48);
    drawStar(context,margin + 24,54,14,6.2,'#fff');
    context.fillStyle = '#111';
    context.font = '800 30px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    context.textBaseline = 'middle';
    context.fillText('STARDOKU',margin + 64,54);
    context.font = '600 18px ui-monospace,SFMono-Regular,Menlo,monospace';
    context.fillStyle = '#6b6b68';
    context.textAlign = 'right';
    context.fillText(`${D[record.d].label} · ${puzzle.n}×${puzzle.n} · ${speed.toFixed(speed % 1 ? 1 : 0)}×`,width - margin,54);
    context.textAlign = 'left';

    for(let row = 0; row < puzzle.n; row++){
      for(let col = 0; col < puzzle.n; col++){
        const index = row * puzzle.n + col;
        const colorIndex = puzzle.order[puzzle.reg[index]];
        context.fillStyle = PASTELS[colorIndex];
        context.fillRect(margin + col * cellSize,boardTop + row * cellSize,cellSize,cellSize);
      }
    }

    context.strokeStyle = 'rgba(17,17,17,.25)';
    context.lineWidth = 1;
    context.beginPath();
    for(let line = 1; line < puzzle.n; line++){
      const offset = line * cellSize;
      context.moveTo(margin + offset,boardTop);
      context.lineTo(margin + offset,boardTop + boardSize);
      context.moveTo(margin,boardTop + offset);
      context.lineTo(margin + boardSize,boardTop + offset);
    }
    context.stroke();

    context.strokeStyle = '#111';
    context.lineWidth = 4;
    context.strokeRect(margin,boardTop,boardSize,boardSize);
    context.beginPath();
    for(let row = 0; row < puzzle.n; row++){
      for(let col = 0; col < puzzle.n; col++){
        const index = row * puzzle.n + col;
        const region = puzzle.reg[index];
        const x = margin + col * cellSize;
        const y = boardTop + row * cellSize;
        if(row && puzzle.reg[index - puzzle.n] !== region){
          context.moveTo(x,y);
          context.lineTo(x + cellSize,y);
        }
        if(col && puzzle.reg[index - 1] !== region){
          context.moveTo(x,y);
          context.lineTo(x,y + cellSize);
        }
      }
    }
    context.stroke();

    for(let index = 0; index < states.length; index++){
      const row = Math.floor(index / puzzle.n);
      const col = index % puzzle.n;
      const cx = margin + (col + .5) * cellSize;
      const cy = boardTop + (row + .5) * cellSize;
      if(states[index] === 1){
        const radius = cellSize * .19;
        context.strokeStyle = 'rgba(17,17,17,.58)';
        context.lineWidth = Math.max(2,cellSize * .035);
        context.beginPath();
        context.moveTo(cx - radius,cy - radius);
        context.lineTo(cx + radius,cy + radius);
        context.moveTo(cx + radius,cy - radius);
        context.lineTo(cx - radius,cy + radius);
        context.stroke();
      }else if(states[index] === 2){
        drawStar(context,cx,cy,cellSize * .29,cellSize * .13,ACCENT);
      }
      if(flashes.has(index)){
        context.strokeStyle = '#b42318';
        context.lineWidth = 4;
        context.strokeRect(margin + col * cellSize + 4,boardTop + row * cellSize + 4,cellSize - 8,cellSize - 8);
      }
    }

    const footerY = boardTop + boardSize + 40;
    context.fillStyle = '#111';
    context.font = '800 24px ui-monospace,SFMono-Regular,Menlo,monospace';
    context.fillText(formatMilliseconds(sourceTime,true),margin,footerY);
    context.textAlign = 'right';
    context.fillStyle = '#6b6b68';
    context.fillText(formatMilliseconds(record.timeMs,true),width - margin,footerY);
    context.textAlign = 'left';

    const barY = footerY + 28;
    context.fillStyle = '#d7d7d1';
    context.fillRect(margin,barY,boardSize,8);
    context.fillStyle = ACCENT;
    context.fillRect(margin,barY,boardSize * Math.min(1,sourceTime / duration),8);
  }

  async function exportReplayMp4(){
    if(!rp || exporting) return;
    const mimeType = mp4MimeType();
    if(!mimeType){
      toast('MP4 export is not supported by this browser');
      return;
    }

    exporting = true;
    const button = $('#exportMp4');
    const originalText = button.textContent;
    button.disabled = true;
    pauseReplay();

    try{
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1040;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream,{ mimeType, videoBitsPerSecond: 5_000_000 });
      const chunks = [];
      recorder.ondataavailable = event => { if(event.data?.size) chunks.push(event.data); };
      const stopped = new Promise((resolve,reject) => {
        recorder.onstop = resolve;
        recorder.onerror = event => reject(event.error || new Error('Recording failed'));
      });

      const states = Array(rp.puzzle.n * rp.puzzle.n).fill(0);
      const flashes = new Map();
      let eventIndex = 0;
      const selectedSpeed = Number($('#replaySpeed').value) || 8;
      const minimumSpeed = rp.duration / 60000;
      const speed = Math.max(selectedSpeed,minimumSpeed);
      const playbackDuration = rp.duration / speed;
      const holdDuration = 900;
      const totalDuration = playbackDuration + holdDuration;
      let startedAt = 0;

      drawReplayFrame(context,canvas,rp.puzzle,states,0,rp.duration,rp.record,new Set(),speed);
      recorder.start();

      await new Promise(resolve => {
        function frame(now){
          if(!startedAt) startedAt = now;
          const wallTime = now - startedAt;
          const sourceTime = Math.min(rp.duration,wallTime * speed);

          while(eventIndex < rp.events.length && rp.events[eventIndex].t <= sourceTime){
            const event = rp.events[eventIndex++];
            if(event.v === 3) flashes.set(event.i,event.t + 320);
            else states[event.i] = event.v;
          }
          for(const [index,until] of flashes) if(until < sourceTime) flashes.delete(index);

          drawReplayFrame(context,canvas,rp.puzzle,states,sourceTime,rp.duration,rp.record,new Set(flashes.keys()),speed);
          const percent = Math.min(100,Math.round(wallTime / totalDuration * 100));
          button.textContent = `Exporting ${percent}%`;

          if(wallTime < totalDuration){
            requestAnimationFrame(frame);
          }else{
            recorder.stop();
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });

      await stopped;
      const blob = new Blob(chunks,{ type:'video/mp4' });
      if(!blob.size) throw new Error('Empty MP4');
      if(exportObjectUrl) URL.revokeObjectURL(exportObjectUrl);
      exportObjectUrl = URL.createObjectURL(blob);
      const link = $('#saveMp4');
      link.href = exportObjectUrl;
      link.download = `stardoku-${rp.record.d}-${rp.record.seed.slice(0,8)}-replay.mp4`;
      $('#exportModal').classList.add('open');
    }catch(error){
      console.error(error);
      toast('MP4 export failed');
    }finally{
      exporting = false;
      button.textContent = originalText;
      button.disabled = !mp4MimeType();
    }
  }

  function closeExportModal(){
    $('#exportModal').classList.remove('open');
    if(exportObjectUrl){
      setTimeout(() => {
        URL.revokeObjectURL(exportObjectUrl);
        exportObjectUrl = '';
        $('#saveMp4').href = '#';
      },500);
    }
  }

  function historyRecord(id){
    return profile.history.find(record => record.id === id) || null;
  }

  $$('.mode').forEach(button => {
    button.onclick = () => {
      selected = button.dataset.d;
      profile.selected = selected;
      saveProfile();
      renderIntro();
    };
  });

  $('#start').onclick = () => start(selected,profile.levels[selected],randomSeed(),null,false);
  $('#home').onclick = goHome;
  $('#reset').onclick = () => resetCurrent('Level reset');
  $('#hint').onclick = hint;
  $('#rules').onclick = () => $('#rulesModal').classList.add('open');
  $('.close-rules').onclick = () => $('#rulesModal').classList.remove('open');
  $('#completeHome').onclick = goHome;
  $('#next').onclick = () => {
    const difficulty = g.d;
    $('#complete').classList.remove('open');
    clearRoute();
    start(difficulty,profile.levels[difficulty],randomSeed(),null,false);
  };
  $('#copyLink').onclick = copyLevel;
  $('#shareChallenge').onclick = shareChallenge;

  $('#board').addEventListener('pointerdown',pointerDown);
  $('#board').addEventListener('pointermove',pointerMove);
  $('#board').addEventListener('pointerup',pointerUp);
  $('#board').addEventListener('pointercancel',pointerCancel);
  $('#board').addEventListener('lostpointercapture',pointerCancel);
  $('#board').addEventListener('contextmenu',event => event.preventDefault());

  $('#historyList').addEventListener('click',async event => {
    const button = event.target.closest('button[data-action]');
    const item = event.target.closest('.history-item');
    if(!button || !item) return;
    const record = historyRecord(item.dataset.id);
    if(!record) return;
    if(button.dataset.action === 'share') await shareChallengeRecord(record);
    if(button.dataset.action === 'replay') showReplay(record,false);
  });

  $('#clearHistory').onclick = () => {
    if(!profile.history.length || !confirm('Clear recorded wins and replays?')) return;
    profile.history = [];
    saveProfile();
    renderHistory();
  };

  $('#replayBack').onclick = goHome;
  $('#replayToggle').onclick = toggleReplay;
  $('#replayRestart').onclick = restartReplay;
  $('#replaySpeed').onchange = changeReplaySpeed;
  $('#replayProgress').oninput = scrubReplay;
  $('#shareReplay').onclick = () => { if(rp) shareReplayRecord(rp.record); };
  $('#exportMp4').onclick = exportReplayMp4;
  $('#closeExport').onclick = closeExportModal;
  $('#saveMp4').onclick = () => setTimeout(closeExportModal,250);

  renderIntro();
  const route = parseRoute();
  if(route?.type === 'challenge'){
    selected = route.difficulty;
    profile.selected = selected;
    saveProfile();
    setTimeout(() => start(route.difficulty,profile.levels[route.difficulty],route.seed,route.timeMs,true),30);
  }else if(route?.type === 'replay' && route.record){
    selected = route.record.d;
    profile.selected = selected;
    saveProfile();
    setTimeout(() => showReplay(route.record,true),30);
  }

  window.__stardoku = {
    make,
    countSolutions,
    validatePuzzle,
    encodeReplay,
    decodeReplay,
    randomSeed,
    start,
    showReplay,
    boardUrl,
    replayUrl,
    get game(){ return g; },
    get replay(){ return rp; },
    get profile(){ return profile; },
    solve(){
      if(!g) return;
      for(let row = 0; row < g.p.n; row++){
        const index = row * g.p.n + g.p.sol[row];
        if(g.cells[index] !== 2) placeStar(index);
      }
    },
    newLevel(difficulty = selected){ start(difficulty,profile.levels[difficulty],randomSeed(),null,false); }
  };
})();
