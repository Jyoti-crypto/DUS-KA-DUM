// ── STATE ──
let MODE        = 'single';
let Q_INDEX     = 0;
let PHASE       = 'p1';        // two-player: 'p1' or 'p2'
let P1_ANSWERS  = [];
let P2_ANSWERS  = [];
let QUESTIONS   = [];
let ANSWERED    = false;
let DOUBLE_ACTIVE = false;
let FIRST_GUESS   = null;
let LIFELINES   = { dum: true, double: true, flip: true };
const PRIZE     = 100000;
const TOTAL_Q   = 10;
const MARGIN    = 20;

// ── CANVAS BACKGROUND ──────────────────────────────────────────
(function bg() {
  const c = document.getElementById('bg-canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  let pts = [];
  function resize() { c.width = innerWidth; c.height = innerHeight; }
  resize(); window.addEventListener('resize', resize);
  for (let i = 0; i < 60; i++) pts.push({
    x: Math.random() * c.width, y: Math.random() * c.height,
    vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
    r: Math.random() * 1.2 + .3, a: Math.random() * .4 + .05,
  });
  function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
      if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${p.a})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── PAGES ──────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() { showPage('pg-home'); }

// ── SLIDER SYNC ────────────────────────────────────────────────
function syncSlider(v) {
  v = Math.max(0, Math.min(100, parseInt(v) || 0));
  document.getElementById('g-input').value = v;
  updateSliderBubble(v);
  updateSliderGradient(v);
}
function syncInput(v) {
  v = Math.max(0, Math.min(100, parseInt(v) || 0));
  document.getElementById('g-slider').value = v;
  updateSliderBubble(v);
  updateSliderGradient(v);
}
function updateSliderBubble(v) {
  const s = document.getElementById('g-slider');
  const b = document.getElementById('slider-bubble');
  const pct = v / 100;
  const sliderW = s.offsetWidth;
  const thumbR = 9;
  const pos = thumbR + pct * (sliderW - 2 * thumbR);
  b.style.left = pos + 'px';
  b.textContent = v + '%';
}
function updateSliderGradient(v) {
  document.getElementById('g-slider').style.setProperty('--val', v + '%');
}

// ── START GAME ─────────────────────────────────────────────────
async function startGame(mode) {
  MODE = mode;
  Q_INDEX = 0; PHASE = 'p1';
  P1_ANSWERS = []; P2_ANSWERS = [];
  ANSWERED = false; DOUBLE_ACTIVE = false; FIRST_GUESS = null;
  LIFELINES = { dum: true, double: true, flip: true };

  try {
    const r = await fetch('/api/new_game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const d = await r.json();
    if (d.status !== 'ok') { alert('Server error. Is python app.py running?'); return; }
  } catch (e) { alert('Cannot connect. Make sure python app.py is running.'); return; }

  // Setup UI
  buildProgressList();
  resetLifelineButtons();
  setAiIdle();

  const ss = document.getElementById('score-strip');
  if (mode === 'two') ss.classList.remove('hidden');
  else ss.classList.add('hidden');

  updateScoreStrip();
  showPage('pg-game');
  await loadQuestion();
}

// ── LOAD QUESTION ──────────────────────────────────────────────
async function loadQuestion() {
  ANSWERED = false; DOUBLE_ACTIVE = false; FIRST_GUESS = null;

  // Reset UI
  document.getElementById('g-slider').value = 50;
  document.getElementById('g-input').value = 50;
  updateSliderBubble(50); updateSliderGradient(50);
  document.getElementById('lock-btn').disabled = false;
  document.getElementById('lock-btn').textContent = 'LOCK ANSWER';
  document.getElementById('double-hint').classList.add('hidden');
  document.getElementById('reveal-area').classList.add('hidden');
  document.getElementById('guess-area').style.opacity = '1';
  document.getElementById('guess-area').style.pointerEvents = 'auto';
  document.getElementById('survey-q').textContent = 'Loading...';

  let data;
  try {
    const r = await fetch('/api/question'); data = await r.json();
  } catch (e) { console.error(e); return; }

  if (data.status === 'done') { fetchResults(); return; }

  Q_INDEX = data.q_index;
  PHASE = data.phase || 'p1';

  document.getElementById('survey-q').textContent = data.question;
  document.getElementById('q-category').textContent = data.category;
  document.getElementById('q-counter').textContent = `Q ${Q_INDEX + 1} / ${TOTAL_Q}`;

  // Turn indicator
  const ti = document.getElementById('turn-indicator');
  if (MODE === 'two') {
    const who = PHASE === 'p1' ? 'PLAYER 1 — YOUR TURN' : 'PLAYER 2 — YOUR TURN';
    ti.textContent = who;
    ti.style.color = PHASE === 'p1' ? 'var(--gold)' : 'var(--blue)';
    highlightActivePlayer(PHASE);
  } else {
    ti.textContent = 'YOUR TURN';
    ti.style.color = 'var(--gold)';
  }

  updateProgressList();
  showAstarInfo(Q_INDEX);
}

// ── SUBMIT GUESS ───────────────────────────────────────────────
async function submitGuess() {
  if (ANSWERED) return;

  const raw = document.getElementById('g-input').value;
  const guess = parseInt(raw);
  if (isNaN(guess) || guess < 0 || guess > 100) {
    alert('Please enter a number between 0 and 100.'); return;
  }

  // Double Dhamaka first attempt
  if (DOUBLE_ACTIVE && FIRST_GUESS === null) {
    FIRST_GUESS = guess;
    let dfsData;
    try {
      const r = await fetch('/api/second_chance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_guess: guess })
      });
      dfsData = await r.json();
    } catch (e) { console.error(e); }
    showDFSPanel(dfsData, guess);
    const hint = document.getElementById('double-hint');
    hint.classList.remove('hidden');
    hint.textContent = `First guess: ${guess}% — ${dfsData?.direction || 'Adjust your estimate'} — Enter your second guess!`;
    return;
  }

  // Lock
  ANSWERED = true;
  document.getElementById('lock-btn').disabled = true;
  document.getElementById('lock-btn').textContent = 'CHECKING...';
  document.getElementById('guess-area').style.opacity = '0.6';
  document.getElementById('guess-area').style.pointerEvents = 'none';

  let data;
  try {
    const r = await fetch('/api/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess })
    });
    data = await r.json();
  } catch (e) { console.error(e); ANSWERED = false; return; }

  if (data.status === 'error') { alert(data.msg); ANSWERED = false; return; }

  showReveal(guess, data.ans, data.correct, data.diff);

  if (MODE === 'single') {
    P1_ANSWERS.push({ q_index: Q_INDEX, guess, ans: data.ans, correct: data.correct, prize: data.prize, diff: data.diff });
    updateProgressList();
    if (data.done) { setTimeout(() => fetchResults(), 2000); }
    else { setTimeout(() => loadQuestion(), 2200); }

  } else {
    if (data.status === 'p1_done') {
      // P1 answered — now P2's turn same question
      P1_ANSWERS.push({ q_index: Q_INDEX, guess, ans: data.ans, correct: data.correct, prize: data.prize, diff: data.diff });
      PHASE = 'p2';
      updateScoreStrip();
      updateProgressList();
      setTimeout(() => {
        loadQuestion(); // reloads same question index but phase=p2
      }, 2000);

    } else if (data.status === 'round_done') {
      // P2 answered — both done for this question
      P2_ANSWERS.push({ q_index: Q_INDEX, guess, ans: data.ans, correct: data.correct, prize: data.prize, diff: data.diff });
      PHASE = 'p1';
      updateScoreStrip(data.p1_total, data.p2_total);
      updateProgressList();
      if (data.minimax_log) showMinimaxPanel(data.minimax_val, data.minimax_log);
      if (data.done) { setTimeout(() => fetchResults(), 2000); }
      else { setTimeout(() => loadQuestion(), 2400); }
    }
  }
}

// ── REVEAL BAR ─────────────────────────────────────────────────
function showReveal(guess, ans, correct, diff) {
  const area = document.getElementById('reveal-area');
  area.classList.remove('hidden');

  // Position elements
  const gp = `${guess}%`;
  const ap = `${ans}%`;
  const zl = `${Math.max(0, ans - MARGIN)}%`;
  const zw = `${Math.min(100, ans + MARGIN) - Math.max(0, ans - MARGIN)}%`;

  document.getElementById('reveal-zone').style.left  = zl;
  document.getElementById('reveal-zone').style.width = zw;
  document.getElementById('reveal-guess-pin').style.left = gp;
  document.getElementById('reveal-ans-pin').style.left   = ap;
  document.getElementById('pin-guess-label').textContent = `YOUR GUESS: ${guess}%`;
  document.getElementById('pin-ans-label').textContent   = `ANSWER: ${ans}%`;

  const verd = document.getElementById('reveal-verdict');
  if (correct) {
    verd.className = 'reveal-verdict correct fade-in';
    verd.textContent = `Correct! Your guess of ${guess}% is only ${diff}% away from the answer of ${ans}%. You win Rs. 1,00,000!`;
  } else {
    const dir = guess > ans ? 'too high' : 'too low';
    verd.className = 'reveal-verdict wrong fade-in';
    verd.textContent = `Not quite. Your guess of ${guess}% was ${dir} — the answer was ${ans}% (${diff}% away, needed within ±${MARGIN}%).`;
  }
}

// ── LIFELINES ──────────────────────────────────────────────────
async function useLifeline(type) {
  if (!LIFELINES[type]) return;
  LIFELINES[type] = false;
  document.getElementById(`ll-${type}`).disabled = true;

  try {
    const r = await fetch(`/api/lifeline/${type}`, { method: 'POST' });
    const data = await r.json();
    if (data.status === 'used') return;

    if (type === 'dum') {
      showDumPanel(data);
      openModal('DUM LAGA — BFS RANGE HINT', buildDumModal(data));
    } else if (type === 'double') {
      DOUBLE_ACTIVE = true;
      document.getElementById('double-hint').classList.remove('hidden');
      document.getElementById('double-hint').textContent = 'Double Dhamaka active — enter your first guess, then you get a second attempt!';
      openModal('DOUBLE DHAMAKA — DFS', `<div class="ai-block"><div class="ai-block-title">DFS SECOND ATTEMPT</div><p style="font-size:12px;color:var(--cream3);line-height:1.7">Submit your first guess. The DFS algorithm will analyse the direction and give you a hint before your second attempt.</p></div>`);
    } else if (type === 'flip') {
      showFlipPanel(data);
      openModal('FLIP — CSP TWO RANGES', buildFlipModal(data));
    }
  } catch (e) { console.error(e); }
}

async function getBayes() {
  try {
    const r = await fetch('/api/bayes'); const data = await r.json();
    showBayesPanel(data);
    openModal('AI ADVICE — BAYESIAN NETWORK', buildBayesModal(data));
  } catch (e) { console.error(e); }
}

// ── FETCH RESULTS ──────────────────────────────────────────────
async function fetchResults() {
  try {
    const r = await fetch('/api/results'); const data = await r.json();
    buildResultPage(data);
    showPage('pg-result');
  } catch (e) { console.error(e); }
}

// ── BUILD RESULT PAGE ──────────────────────────────────────────
function buildResultPage(data) {
  const hdr = document.getElementById('result-header');
  const body = document.getElementById('result-body');

  if (data.mode === 'single') {
    const correct = data.p1_correct;
    const total   = data.p1_total;
    hdr.innerHTML = `
      <div class="winner-block">
        <div class="winner-label">FINAL SCORE</div>
        <div class="winner-name">${correct} / ${TOTAL_Q} Correct</div>
        <div class="winner-prize">Rs. ${total.toLocaleString('en-IN')}</div>
      </div>`;

    let rows = '';
    data.p1_answers.forEach((a, i) => {
      const q = data.questions[a.q_index];
      rows += `<tr>
        <td>${i + 1}</td>
        <td style="font-size:12px;color:var(--cream2)">${q ? q.q.slice(0, 60) + '...' : '—'}</td>
        <td style="font-family:var(--ff-mono)">${a.guess}%</td>
        <td style="font-family:var(--ff-mono)">${a.ans}%</td>
        <td>${a.diff}%</td>
        <td class="${a.correct ? 'td-correct' : 'td-wrong'}">${a.correct ? 'CORRECT' : 'WRONG'}</td>
        <td class="td-prize">${a.correct ? 'Rs. 1,00,000' : '—'}</td>
      </tr>`;
    });

    body.innerHTML = `
      <table class="score-table">
        <tr><th>#</th><th>Question</th><th>Your Guess</th><th>Answer</th><th>Diff</th><th>Result</th><th>Prize</th></tr>
        ${rows}
      </table>
      <div style="text-align:right;padding:8px 0;font-family:var(--ff-mono);font-size:13px;color:var(--gold)">
        TOTAL WINNINGS: Rs. ${total.toLocaleString('en-IN')}
      </div>`;

  } else {
    // Two-player
    const winner = data.winner;
    hdr.innerHTML = `
      <div class="winner-block">
        <div class="winner-label">WINNER</div>
        <div class="winner-name">${winner === 'Draw' ? 'DRAW' : winner.toUpperCase()}</div>
        <div class="winner-prize">${winner !== 'Draw' ? 'Rs. ' + (winner === 'Player 1' ? data.p1_total : data.p2_total).toLocaleString('en-IN') : 'Both earned Rs. ' + data.p1_total.toLocaleString('en-IN')}</div>
      </div>`;

    body.innerHTML = `
      <div class="two-col">
        ${buildPlayerCard('PLAYER 1', data.p1_answers, data.p1_total, data.p1_correct)}
        ${buildPlayerCard('PLAYER 2', data.p2_answers, data.p2_total, data.p2_correct)}
      </div>
      <div class="mm-result-block">
        <div class="mm-result-title">MINIMAX + ALPHA-BETA PRUNING — FINAL EVALUATION</div>
        <div style="font-size:12px;color:var(--cream3);margin-bottom:8px">Minimax value (P1 - P2 advantage): <span style="color:var(--gold);font-family:var(--ff-mono)">${data.minimax_val}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${(data.minimax_log || []).map(l => `<span class="ai-mm-row ${l.val === 'PRUNED' ? 'ai-mm-pruned' : l.player === 'MAX' ? 'ai-mm-max' : 'ai-mm-min'}">[d${l.depth}] ${l.player} v=${l.val} a=${l.alpha} b=${l.beta}</span>`).join('')}
        </div>
      </div>
      <div class="score-table" style="font-size:12px">
        ${buildTwoPlayerTable(data)}
      </div>`;
  }
}

function buildPlayerCard(label, answers, total, correct) {
  const rows = answers.map(a => `
    <div class="prc-stat">
      <span>Q${a.q_index + 1}: Guess ${a.guess}% vs ${a.ans}%</span>
      <span class="prc-stat-val ${a.correct ? 'td-correct' : 'td-wrong'}">${a.correct ? 'CORRECT' : 'WRONG'}</span>
    </div>`).join('');
  return `
    <div class="player-result-card">
      <div class="prc-name">${label}</div>
      ${rows}
      <div class="prc-stat" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px">
        <span>${correct} correct answers</span>
        <span class="prc-stat-prize">Rs. ${total.toLocaleString('en-IN')}</span>
      </div>
    </div>`;
}

function buildTwoPlayerTable(data) {
  let rows = '';
  data.questions.forEach((q, i) => {
    const a1 = data.p1_answers.find(a => a.q_index === i);
    const a2 = data.p2_answers.find(a => a.q_index === i);
    rows += `<tr>
      <td style="color:var(--cream3)">Q${i+1}</td>
      <td style="font-size:11px;color:var(--cream2)">${q.q.slice(0,45)}...</td>
      <td style="font-family:var(--ff-mono)">${q.ans}%</td>
      <td class="${a1?.correct ? 'td-correct' : 'td-wrong'}">${a1 ? a1.guess + '%' : '—'}</td>
      <td class="${a2?.correct ? 'td-correct' : 'td-wrong'}">${a2 ? a2.guess + '%' : '—'}</td>
    </tr>`;
  });
  return `<table class="score-table"><tr><th>#</th><th>Question</th><th>Answer</th><th>P1 Guess</th><th>P2 Guess</th></tr>${rows}</table>`;
}

// ── PROGRESS LIST ──────────────────────────────────────────────
function buildProgressList() {
  const el = document.getElementById('q-progress-list');
  el.innerHTML = '';
  for (let i = 0; i < TOTAL_Q; i++) {
    const div = document.createElement('div');
    div.className = 'q-prog-item pending';
    div.id = `qp-${i}`;
    div.innerHTML = `<div class="q-prog-dot"></div><span>Q ${i+1}</span>`;
    el.appendChild(div);
  }
}

function updateProgressList() {
  for (let i = 0; i < TOTAL_Q; i++) {
    const el = document.getElementById(`qp-${i}`);
    if (!el) continue;
    const a1 = P1_ANSWERS.find(a => a.q_index === i);
    if (i === Q_INDEX) {
      el.className = 'q-prog-item current';
    } else if (a1) {
      el.className = `q-prog-item ${a1.correct ? 'done-correct' : 'done-wrong'}`;
    } else {
      el.className = 'q-prog-item pending';
    }
  }
}

// ── SCORE STRIP ────────────────────────────────────────────────
function updateScoreStrip(p1t, p2t) {
  const p1Total = p1t !== undefined ? p1t : P1_ANSWERS.reduce((s, a) => s + a.prize, 0);
  const p2Total = p2t !== undefined ? p2t : P2_ANSWERS.reduce((s, a) => s + a.prize, 0);
  const p1c = P1_ANSWERS.filter(a => a.correct).length;
  const p2c = P2_ANSWERS.filter(a => a.correct).length;
  document.getElementById('p1-total').textContent   = 'Rs. ' + p1Total.toLocaleString('en-IN');
  document.getElementById('p2-total').textContent   = 'Rs. ' + p2Total.toLocaleString('en-IN');
  document.getElementById('p1-correct').textContent = p1c + ' correct';
  document.getElementById('p2-correct').textContent = p2c + ' correct';
  highlightActivePlayer(PHASE);
}

function highlightActivePlayer(phase) {
  document.getElementById('sb-p1').classList.toggle('sb-block-active', phase === 'p1');
  document.getElementById('sb-p2').classList.toggle('sb-block-active', phase === 'p2');
}

// ── AI PANEL RENDERERS ─────────────────────────────────────────
function setAiIdle() {
  document.getElementById('ai-panel-body').innerHTML =
    '<div class="ai-idle-msg">Use a lifeline or submit an answer to see the AI algorithms running live.</div>';
}

function showAstarInfo(qi) {
  const html = `<div class="ai-block">
    <div class="ai-block-title">A* — QUESTION SELECTION</div>
    <div class="ai-row"><span class="ai-row-k">g(n) depth</span><span class="ai-row-v gold">${qi}</span></div>
    <div class="ai-row"><span class="ai-row-k">target diff</span><span class="ai-row-v gold">${Math.min(qi+2,10)}/10</span></div>
    <div class="ai-row"><span class="ai-row-k">formula</span><span class="ai-row-v">f = g + h</span></div>
    <div class="ai-row"><span class="ai-row-k">categories</span><span class="ai-row-v">variety enforced</span></div>
  </div>`;
  document.getElementById('ai-panel-body').innerHTML = html;
}

function showDumPanel(data) {
  const html = `<div class="ai-block">
    <div class="ai-block-title">BFS — DUM LAGA RANGE</div>
    <div class="ai-range-box">${data.hint_range[0]}% — ${data.hint_range[1]}%</div>
    <div class="ai-row"><span class="ai-row-k">margin</span><span class="ai-row-v gold">±${MARGIN}%</span></div>
    ${(data.bfs_log||[]).map(n=>`<div class="ai-row"><span class="ai-row-k">dist ${n.dist}</span><span class="ai-row-v">${n.node}%</span></div>`).join('')}
  </div>`;
  document.getElementById('ai-panel-body').innerHTML = html;
}

function showDFSPanel(data, guess) {
  const html = `<div class="ai-block">
    <div class="ai-block-title">DFS — SECOND ATTEMPT HINT</div>
    <div class="ai-row"><span class="ai-row-k">first guess</span><span class="ai-row-v">${guess}%</span></div>
    <div class="ai-row"><span class="ai-row-k">direction</span><span class="ai-row-v gold">${data?.direction || '—'}</span></div>
    ${(data?.dfs_path||[]).map(n=>`<div class="ai-dfs-node"><span>${n.node}%</span><span style="color:var(--cream3)">${n.dist}% off</span></div>`).join('')}
  </div>`;
  document.getElementById('ai-panel-body').innerHTML = html;
}

function showFlipPanel(data) {
  const html = `<div class="ai-block">
    <div class="ai-block-title">CSP — FLIP TWO RANGES</div>
    <div class="ai-range-box">Range A: ${data.range_a[0]}% — ${data.range_a[1]}%</div>
    <div class="ai-range-box">Range B: ${data.range_b[0]}% — ${data.range_b[1]}%</div>
    ${(data.csp_steps||[]).map(s=>`<div class="ai-csp-step"><strong>${s.step}</strong>${s.action}</div>`).join('')}
  </div>`;
  document.getElementById('ai-panel-body').innerHTML = html;
}

function showBayesPanel(data) {
  const cls = data.advice === 'USE LIFELINE' ? 'use' : 'guess';
  const html = `<div class="ai-block">
    <div class="ai-block-title">BAYESIAN NETWORK</div>
    <div class="ai-row"><span class="ai-row-k">P(correct)</span><span class="ai-row-v gold">${Math.round(data.p_correct*100)}%</span></div>
    <div class="ai-row"><span class="ai-row-k">P(+lifeline)</span><span class="ai-row-v green">${Math.round(data.p_lifeline*100)}%</span></div>
    <div class="ai-row"><span class="ai-row-k">EV guess</span><span class="ai-row-v">Rs. ${data.ev_guess?.toLocaleString('en-IN')}</span></div>
    <div class="ai-row"><span class="ai-row-k">EV lifeline</span><span class="ai-row-v gold">Rs. ${data.ev_lifeline?.toLocaleString('en-IN')}</span></div>
  </div>
  <div class="advice-verdict ${cls}">
    <div class="advice-word">${data.advice}</div>
    <div class="advice-reason">${data.reason}</div>
  </div>`;
  document.getElementById('ai-panel-body').innerHTML = html;
}

function showMinimaxPanel(val, log) {
  const html = `<div class="ai-block">
    <div class="ai-block-title">MINIMAX + ALPHA-BETA PRUNING</div>
    <div class="ai-row"><span class="ai-row-k">evaluation</span><span class="ai-row-v gold">${val}</span></div>
    <div class="ai-row"><span class="ai-row-k">P1 advantage</span><span class="ai-row-v ${val>0?'green':val<0?'red':''}">${val>0?'Player 1 leading':val<0?'Player 2 leading':'Draw'}</span></div>
    ${(log||[]).slice(0,8).map(l=>`<div class="ai-mm-row ${l.val==='PRUNED'?'ai-mm-pruned':l.player==='MAX'?'ai-mm-max':'ai-mm-min'}">[d${l.depth}] ${l.player} v=${l.val} a=${l.alpha} b=${l.beta}</div>`).join('')}
  </div>`;
  document.getElementById('ai-panel-body').innerHTML = html;
}

// ── MODAL BUILDERS ─────────────────────────────────────────────
function buildDumModal(data) {
  return `<div class="ai-block">
    <div class="ai-block-title">BFS ON PERCENTAGE GRAPH</div>
    ${(data.bfs_log||[]).map(n=>`<div class="ai-row"><span class="ai-row-k">Level ${n.dist}</span><span class="ai-row-v">${n.node}%</span></div>`).join('')}
  </div>
  <div class="ai-range-box" style="font-size:16px;padding:12px">The answer is between<br><strong>${data.hint_range[0]}% and ${data.hint_range[1]}%</strong></div>`;
}

function buildFlipModal(data) {
  return `<div class="ai-block">
    <div class="ai-block-title">CSP + AC-3 ARC CONSISTENCY</div>
    ${(data.csp_steps||[]).map(s=>`<div class="ai-csp-step"><strong>${s.step}</strong>${s.action}</div>`).join('')}
  </div>
  <div style="display:flex;gap:10px;margin-top:8px">
    <div class="ai-range-box" style="flex:1">Range A<br><strong>${data.range_a[0]}% — ${data.range_a[1]}%</strong></div>
    <div class="ai-range-box" style="flex:1">Range B<br><strong>${data.range_b[0]}% — ${data.range_b[1]}%</strong></div>
  </div>
  <p style="font-size:11px;color:var(--cream3);text-align:center;margin-top:10px">One of these ranges contains the correct answer. They do not overlap.</p>`;
}

function buildBayesModal(data) {
  const cls = data.advice === 'USE LIFELINE' ? 'use' : 'guess';
  return `<div class="ai-block">
    <div class="ai-block-title">BAYESIAN NETWORK COMPUTATION</div>
    ${(data.steps||[]).map(s=>`<div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span style="color:var(--blue);font-family:var(--ff-mono)">${s.label}</span>
        <span style="color:var(--gold)">${s.val}</span>
      </div>
      <div style="font-size:10px;color:var(--cream3);font-family:var(--ff-mono)">${s.formula}</div>
    </div>`).join('')}
  </div>
  <div class="advice-verdict ${cls}" style="margin-top:10px">
    <div class="advice-word">${data.advice}</div>
    <div class="advice-reason">${data.reason}</div>
  </div>`;
}

// ── MODAL ──────────────────────────────────────────────────────
function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal').style.display = 'flex';
}
function closeModal() { document.getElementById('modal').style.display = 'none'; }

// ── HELPERS ────────────────────────────────────────────────────
function resetLifelineButtons() {
  ['dum', 'double', 'flip'].forEach(t => {
    const b = document.getElementById(`ll-${t}`); if (b) b.disabled = false;
  });
}

// Enter key submits guess
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !ANSWERED && document.getElementById('pg-game').classList.contains('active')) {
    submitGuess();
  }
});
