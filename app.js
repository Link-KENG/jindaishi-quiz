/* 中国近代史纲要 · 刷题系统 */
'use strict';

const $ = s => document.querySelector(s);
const app = $('#app');

/* ---------- data ---------- */
const byId = {};
QUESTIONS.forEach(q => { byId[q.id] = q; });
const pools = { '单选题': [], '多选题': [], '判断题': [] };
QUESTIONS.forEach(q => pools[q.type].push(q));

const CHAPTER_ORDER = ['导言'];
for (let i = 1; i <= 10; i++) CHAPTER_ORDER.push('第' + '一二三四五六七八九十'[i - 1] + '章');
CHAPTER_ORDER.push('二十大', '综合补充', '其他');
function chapterName(ch) { return ch || '其他'; }

const TYPE_META = {
  '单选题': { label: '单选', cls: 'single' },
  '多选题': { label: '多选', cls: 'multi' },
  '判断题': { label: '判断', cls: 'judge' },
};

/* ---------- storage ---------- */
const K_WRONG = 'jds_wrongs_v1';
const K_EXAM = 'jds_exams_v1';
const K_SESSION = 'jds_session_v1';
function load(key, dft) { try { return JSON.parse(localStorage.getItem(key)) || dft; } catch (e) { return dft; } }
function save(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

function getWrongs() { return load(K_WRONG, []); }
function addWrong(qid) {
  const w = getWrongs();
  if (!w.some(x => x.qid === qid)) {
    w.push({ qid, time: Date.now() });
    save(K_WRONG, w);
  }
}
function removeWrong(qid) {
  save(K_WRONG, getWrongs().filter(x => x.qid !== qid));
}
function getExams() { return load(K_EXAM, []); }
function addExam(rec) {
  const list = getExams();
  list.unshift(rec);
  save(K_EXAM, list.slice(0, 100));
}
function removeExam(id) { save(K_EXAM, getExams().filter(x => x.id !== id)); }

/* session answer state for bank/chapter lists */
const sessionState = new Map(load(K_SESSION, []).map(([k, v]) => [k, v]));
function rememberState() { save(K_SESSION, [...sessionState.entries()]); }

/* ---------- helpers ---------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function normAns(ans) { return ans.split('').sort().join(''); }

/* ---------- question card widget ----------
   opts: { initial: {user, ok}, onAnswer(user, ok, card), nextText, onNext } */
function buildQCard(q, opts) {
  opts = opts || {};
  const card = el('div', 'q-card');
  const meta = el('div', 'q-meta');
  const tm = TYPE_META[q.type] || { label: q.type, cls: 'single' };
  meta.appendChild(el('span', 'chip ' + tm.cls, tm.label));
  meta.appendChild(el('span', 'chip chapter', chapterName(q.chapter)));
  card.appendChild(meta);
  card.appendChild(el('div', 'q-stem', q.stem));
  if (q.type === '多选题') card.appendChild(el('div', 'q-hint', '多选题：选出所有正确选项后点击「提交答案」'));

  const optBox = el('div', 'opts');
  const optEls = {};
  const letters = q.options.map(o => o.k);
  q.options.forEach(o => {
    const b = el('button', 'opt');
    b.type = 'button';
    b.appendChild(el('span', 'k', o.k));
    const t = el('span', 't', o.t);
    b.appendChild(t);
    b.addEventListener('click', () => onPick(o.k));
    optBox.appendChild(b);
    optEls[o.k] = b;
  });
  card.appendChild(optBox);

  const submitRow = el('div', 'next-row');
  const submitBtn = el('button', 'btn primary small');
  submitBtn.textContent = '提交答案';
  submitBtn.style.display = 'none';
  submitBtn.addEventListener('click', () => grade());
  submitRow.appendChild(submitBtn);
  card.appendChild(submitRow);

  let selected = new Set();
  let done = false;

  function lockAll() {
    letters.forEach(k => { optEls[k].disabled = true; });
    submitBtn.disabled = true;
    submitBtn.style.display = 'none';
  }

  function showFeedback(user, ok) {
    const fb = el('div', 'feedback ' + (ok ? 'ok' : 'bad'));
    const head = el('div', 'head', ok ? '✓ 回答正确' : '✗ 回答错误');
    fb.appendChild(head);
    const ans = el('div', 'answer', '正确答案：' + (q.type === '判断题' ? q.answer : q.answer));
    fb.appendChild(ans);
    const expl = el('div', 'expl');
    if (q.explanation) {
      expl.appendChild(el('b', '', '解析：'));
      expl.appendChild(document.createTextNode(q.explanation));
    } else {
      expl.textContent = '本题暂无解析';
    }
    fb.appendChild(expl);
    card.appendChild(fb);
    if (opts.nextText && opts.onNext) {
      const row = el('div', 'next-row');
      const btn = el('button', 'btn primary');
      btn.textContent = opts.nextText;
      btn.addEventListener('click', () => { opts.onNext(); card.remove(); });
      row.appendChild(btn);
      card.appendChild(row);
    }
  }

  function finish(user, ok) {
    done = true;
    lockAll();
    showFeedback(user, ok);
    if (opts.onAnswer) opts.onAnswer(user, ok, card);
  }

  function grade() {
    if (done) return;
    const user = [...selected].sort().join('');
    const ok = q.type === '判断题' ? (user === 'A' ? '对' : user === 'B' ? '错' : '') === q.answer
                                   : normAns(user) === normAns(q.answer);
    const ansSet = new Set(q.answer.split(''));
    letters.forEach(k => {
      const b = optEls[k];
      const chosen = selected.has(k);
      const isRight = ansSet.has(k);
      if (chosen && isRight) b.classList.add('right');
      else if (chosen && !isRight) b.classList.add('wrong');
      else if (!chosen && isRight) b.classList.add('right');
      else b.classList.add('dim');
    });
    finish(user, ok);
  }

  function onPick(k) {
    if (done) return;
    if (q.type === '多选题') {
      if (selected.has(k)) { selected.delete(k); optEls[k].classList.remove('sel'); }
      else { selected.add(k); optEls[k].classList.add('sel'); }
      submitBtn.style.display = 'inline-block';
      submitBtn.disabled = selected.size === 0;
      if (opts.onSelect) opts.onSelect([...selected].sort().join(''));
    } else {
      selected = new Set([k]);
      letters.forEach(x => optEls[x].classList.remove('sel'));
      optEls[k].classList.add('sel');
      grade();
    }
  }

  /* pre-selected (multi partially answered earlier, not yet submitted) */
  if (opts.preselected) {
    [...String(opts.preselected)].forEach(k => {
      if (optEls[k]) { selected.add(k); optEls[k].classList.add('sel'); }
    });
    if (q.type === '多选题' && selected.size > 0) {
      submitBtn.style.display = 'inline-block';
      submitBtn.disabled = false;
    }
  }

  /* pre-filled state (answered earlier this session) */
  const initial = opts.initial;
  if (initial) {
    done = true;
    lockAll();
    const ansSet = new Set(q.answer.split(''));
    letters.forEach(k => {
      const b = optEls[k];
      const chosen = initial.user.includes(k);
      const isRight = ansSet.has(k);
      if (chosen && isRight) b.classList.add('right');
      else if (chosen && !isRight) b.classList.add('wrong');
      else if (!chosen && isRight) b.classList.add('right');
      else b.classList.add('dim');
    });
    showFeedback(initial.user, initial.ok);
  }
  return card;
}

/* ---------- views ---------- */
function view(elTree) {
  app.innerHTML = '';
  app.appendChild(elTree);
  window.scrollTo(0, 0);
}

function pageHead(title, sub, backHref, backText) {
  const d = el('div', 'page-head');
  if (backHref) {
    const a = el('a', 'back-link', '← ' + (backText || '返回'));
    a.href = backHref;
    d.appendChild(a);
  }
  d.appendChild(el('h2', '', title));
  if (sub) d.appendChild(el('p', '', sub));
  return d;
}

/* ---- home ---- */
function viewHome() {
  const d = el('div');
  const hero = el('div', 'hero');
  hero.appendChild(el('h1', '', '中国近代史纲要'));
  hero.appendChild(el('div', 'sub', '题库刷题 · 即答即判 · 错题本 · 模拟套卷'));
  d.appendChild(hero);

  const stats = el('div', 'stat-row');
  const total = QUESTIONS.length;
  [[total, '总题数'], [pools['单选题'].length, '单选题'], [pools['多选题'].length, '多选题'], [pools['判断题'].length, '判断题']]
    .forEach(([n, t]) => {
      const s = el('div', 'stat');
      s.appendChild(el('b', '', n));
      s.appendChild(el('span', '', t));
      stats.appendChild(s);
    });
  d.appendChild(stats);

  const grid = el('div', 'grid');
  const cards = [
    { href: '#/exam', primary: true, ico: '📝', h: '模拟考试', p: '100 题：60 单选 + 20 多选 + 20 判断，选完即出答案', badge: null },
    { href: '#/bank', primary: false, ico: '📚', h: '总题库', p: '全部题目，可按题型、章节筛选，随时刷', badge: null },
    { href: '#/chapters', primary: false, ico: '📖', h: '分章节题库', p: '按章节逐章突破', badge: null },
    { href: '#/wrongs', primary: false, ico: '🔖', h: '错题本', p: '重做错题，答对自动移出', badge: getWrongs().length },
    { href: '#/records', primary: false, ico: '🗂️', h: '考试记录', p: '回看历史套卷与得分', badge: getExams().length },
  ];
  cards.forEach(c => {
    const a = el('a', 'card' + (c.primary ? ' primary' : ''));
    a.href = c.href;
    a.appendChild(el('div', 'ico', c.ico));
    a.appendChild(el('h3', '', c.h));
    a.appendChild(el('p', '', c.p));
    if (c.badge) a.appendChild(el('span', 'badge', String(c.badge)));
    grid.appendChild(a);
  });
  d.appendChild(grid);
  d.appendChild(el('div', 'foot', '本地存储 · 数据保留在浏览器中'));
  view(d);
}

/* ---- exam ---- */
function viewExamIntro() {
  const d = el('div');
  d.appendChild(pageHead('模拟考试', '随机组卷，选完即出答案；交卷后自动保存成绩，错题自动进入错题本。', '#/', '首页'));
  const box = el('div', 'q-card');
  box.appendChild(el('p', 'q-stem', '试卷构成'));
  ['单选题 60 题', '多选题 20 题', '判断题 20 题'].forEach(t => {
    box.appendChild(el('p', '', '· ' + t));
  });
  box.appendChild(el('p', 'q-hint', '共 100 题。答题过程中立即显示对错与解析，全部完成后出总分。'));
  const row = el('div', 'next-row');
  const go = el('a', 'btn primary big');
  go.href = '#/exam/run';
  go.textContent = '开始考试';
  row.appendChild(go);
  box.appendChild(row);
  d.appendChild(box);
  view(d);
}

const EXAM_CFG = [['单选题', 60], ['多选题', 20], ['判断题', 20]];
let examState = null;

function viewExamRun() {
  examState = {
    list: EXAM_CFG.flatMap(([t, n]) => shuffle(pools[t]).slice(0, n)),
    idx: 0, correct: 0,
    ans: [],            // ans[i] = {user, ok, done:true} 已作答 | {user, done:false} 多选已选未交 | undefined 未碰
    sheetOpen: true,
  };
  renderExamQ();
}

function renderExamQ() {
  const s = examState;
  const d = el('div');
  d.appendChild(pageHead('模拟考试', '第 ' + (s.idx + 1) + ' / ' + s.list.length + ' 题', '#/exam', '退出'));

  const prog = el('div', 'progress-outer');
  const inner = el('div', 'progress-inner');
  prog.appendChild(inner);
  d.appendChild(prog);
  const progLabel = el('div', 'progress-label');
  d.appendChild(progLabel);

  /* ---- answer sheet: click any number to jump ---- */
  const sheet = el('div', 'sheet');
  const head = el('div', 'sheet-head');
  head.appendChild(el('span', 'sheet-title', '答题卡 · 点击题号跳转'));
  const tg = el('button', 'btn small');
  tg.type = 'button';
  tg.textContent = s.sheetOpen ? '收起' : '展开';
  tg.addEventListener('click', () => {
    s.sheetOpen = !s.sheetOpen;
    gridBox.style.display = s.sheetOpen ? '' : 'none';
    legend.style.display = s.sheetOpen ? '' : 'none';
    caption.style.display = s.sheetOpen ? '' : 'none';
    tg.textContent = s.sheetOpen ? '收起' : '展开';
  });
  head.appendChild(tg);
  sheet.appendChild(head);
  const gridBox = el('div', 'sheet-grid');
  const cells = [];
  s.list.forEach((qq, i) => {
    const c = el('button', 'sheet-num');
    c.type = 'button';
    c.textContent = i + 1;
    c.addEventListener('click', () => { s.idx = i; renderExamQ(); });
    cells.push(c);
    gridBox.appendChild(c);
  });
  sheet.appendChild(gridBox);
  let acc = 0;
  const bounds = EXAM_CFG.map(([t, n]) => { const r = (acc + 1) + '–' + (acc + n) + ' ' + t; acc += n; return r; });
  const caption = el('div', 'sheet-caption', bounds.join(' · '));
  const legend = el('div', 'sheet-legend');
  [['ok', '已答对'], ['bad', '已答错'], ['part', '已选未交'], ['none', '未作答'], ['cur', '当前题']].forEach(([k, t]) => {
    const sp = el('span');
    sp.appendChild(el('i', 'lg-' + k));
    sp.appendChild(document.createTextNode(t));
    legend.appendChild(sp);
  });
  sheet.appendChild(caption);
  sheet.appendChild(legend);
  if (!s.sheetOpen) { gridBox.style.display = 'none'; legend.style.display = 'none'; caption.style.display = 'none'; }
  d.appendChild(sheet);

  function updateBar() {
    const answered = s.ans.filter(a => a && a.done).length;
    progLabel.textContent = '已答 ' + answered + ' / ' + s.list.length + ' · 答对 ' + s.correct;
    inner.style.width = (answered / s.list.length * 100) + '%';
    cells.forEach((c, i) => {
      c.classList.remove('cur', 'ok', 'bad', 'part');
      const a = s.ans[i];
      if (i === s.idx) c.classList.add('cur');
      if (a && a.done) c.classList.add(a.ok ? 'ok' : 'bad');
      else if (a) c.classList.add('part');
    });
  }

  const q = s.list[s.idx];
  const st = s.ans[s.idx];
  const card = buildQCard(q, {
    initial: (st && st.done) ? { user: st.user, ok: st.ok } : null,
    preselected: (st && !st.done) ? st.user : '',
    onSelect(user) {
      s.ans[s.idx] = { user, done: false };
      updateBar();
    },
    onAnswer(user, ok) {
      s.ans[s.idx] = { user, ok, done: true };
      if (ok) s.correct++;
      else addWrong(q.id);
      updateBar();
    },
    nextText: s.idx + 1 < s.list.length ? '下一题' : '交卷',
    onNext() {
      s.idx++;
      if (s.idx < s.list.length) renderExamQ();
      else tryFinish();
    },
  });
  d.appendChild(card);

  /* ---- bottom nav: prev / next / submit ---- */
  const bar = el('div', 'exam-nav');
  const prevB = el('button', 'btn');
  prevB.textContent = '← 上一题';
  prevB.disabled = s.idx === 0;
  prevB.addEventListener('click', () => { s.idx--; renderExamQ(); });
  const nextB = el('button', 'btn');
  nextB.textContent = '下一题 →';
  nextB.disabled = s.idx + 1 >= s.list.length;
  nextB.addEventListener('click', () => { s.idx++; renderExamQ(); });
  const finB = el('button', 'btn primary');
  finB.textContent = '交卷';
  finB.addEventListener('click', tryFinish);
  bar.appendChild(prevB); bar.appendChild(nextB); bar.appendChild(finB);
  d.appendChild(bar);

  updateBar();
  view(d);
}

function tryFinish() {
  const s = examState;
  if (!s) return;
  const answered = s.ans.filter(a => a && a.done).length;
  const left = s.list.length - answered;
  if (left > 0 && !confirm('还有 ' + left + ' 题未作答，确定交卷吗？')) return;
  finishExam();
}

function finishExam() {
  const s = examState;
  const detail = s.list.map((q, i) => {
    const a = s.ans[i];
    return (a && a.done) ? { qid: q.id, user: a.user, ok: a.ok }
                         : { qid: q.id, user: '', ok: false };
  });
  const rec = {
    id: 'e' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
    time: Date.now(),
    score: s.correct,
    total: s.list.length,
    detail,
  };
  addExam(rec);
  const d = el('div');
  d.appendChild(pageHead('考试结果', null, '#/', '首页'));
  const box = el('div', 'result-box');
  box.appendChild(el('div', 'score', String(s.correct)));
  const frac = el('div', 'score');
  frac.appendChild(el('small', '', ' / ' + s.list.length + ' 分'));
  box.appendChild(frac);
  const pct = Math.round(s.correct / s.list.length * 100);
  let msg = '继续加油，多刷刷错题！';
  if (pct >= 90) msg = '非常优秀！';
  else if (pct >= 75) msg = '掌握得不错！';
  else if (pct >= 60) msg = '基础扎实，查漏补缺一下。';
  box.appendChild(el('div', 'msg', msg));
  box.appendChild(el('div', 'detail', '正确率 ' + pct + '% · 已自动保存到考试记录，错题已加入错题本'));
  const actions = el('div', 'result-actions');
  const again = el('a', 'btn primary'); again.href = '#/exam/run'; again.textContent = '再来一套';
  const recBtn = el('a', 'btn'); recBtn.href = '#/record/' + rec.id; recBtn.textContent = '查看本卷';
  const home = el('a', 'btn'); home.href = '#/'; home.textContent = '返回首页';
  actions.appendChild(again); actions.appendChild(recBtn); actions.appendChild(home);
  box.appendChild(actions);
  d.appendChild(box);
  view(d);
  examState = null;
}

/* ---- bank (shared list) ---- */
function viewBank() {
  const d = el('div');
  d.appendChild(pageHead('总题库', '共 ' + QUESTIONS.length + ' 题，点击题目即可作答，选完立即判分。', '#/', '首页'));
  const bar = el('div', 'filter-bar');
  const typeSel = el('select');
  [['', '全部题型'], ['单选题', '单选题'], ['多选题', '多选题'], ['判断题', '判断题']].forEach(([v, t]) => {
    const o = el('option', '', t); o.value = v; typeSel.appendChild(o);
  });
  const chSel = el('select');
  const chOpt = el('option', '', '全部章节'); chOpt.value = ''; chSel.appendChild(chOpt);
  CHAPTER_ORDER.forEach(c => {
    const o = el('option', '', c); o.value = c; chSel.appendChild(o);
  });
  const kw = el('input');
  kw.type = 'search'; kw.placeholder = '搜索题干 / 选项关键词…';
  bar.appendChild(typeSel); bar.appendChild(chSel); bar.appendChild(kw);
  d.appendChild(bar);
  const listBox = el('div');
  d.appendChild(listBox);

  const PAGE = 50;
  let shown = 0;
  let filtered = [];

  function applyFilter() {
    filtered = QUESTIONS.filter(q => {
      if (typeSel.value && q.type !== typeSel.value) return false;
      if (chSel.value && chapterName(q.chapter) !== chSel.value) return false;
      if (kw.value.trim()) {
        const k = kw.value.trim().toLowerCase();
        const hay = (q.stem + ' ' + q.options.map(o => o.t).join(' ') + ' ' + (q.explanation || '')).toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
    shown = 0;
    listBox.innerHTML = '';
    renderPage();
  }
  typeSel.addEventListener('change', applyFilter);
  chSel.addEventListener('change', applyFilter);
  let kwTimer = null;
  kw.addEventListener('input', () => { clearTimeout(kwTimer); kwTimer = setTimeout(applyFilter, 250); });

  function renderPage() {
    const slice = filtered.slice(shown, shown + PAGE);
    slice.forEach(q => renderBankItem(q, listBox));
    shown += slice.length;
    let more = listBox.querySelector('.load-more');
    if (more) more.remove();
    if (shown < filtered.length) {
      const w = el('div', 'load-more');
      const b = el('button', 'btn');
      b.textContent = '加载更多（' + shown + '/' + filtered.length + '）';
      b.addEventListener('click', renderPage);
      w.appendChild(b);
      listBox.appendChild(w);
    } else if (filtered.length === 0) {
      listBox.appendChild(el('div', 'empty', '没有符合条件的题目'));
    }
  }

  function renderBankItem(q, box) {
    const item = el('div', 'bank-item');
    const tm = TYPE_META[q.type];
    const strip = el('div', 'q-meta');
    strip.appendChild(el('span', 'chip ' + tm.cls, tm.label));
    strip.appendChild(el('span', 'chip chapter', chapterName(q.chapter)));
    item.appendChild(strip);
    item.appendChild(el('div', 'stem', q.stem));
    const ansStrip = el('div', 'ans-strip');
    if (sessionState.has(q.id)) {
      const st = sessionState.get(q.id);
      ansStrip.appendChild(el('span', '', st.ok ? '✓ 已答对' : '✗ 已答错'));
    } else {
      ansStrip.appendChild(el('span', '', '点击作答'));
    }
    item.appendChild(ansStrip);

    const openBox = el('div', 'bank-open');
    openBox.style.display = 'none';
    item.appendChild(openBox);

    item.addEventListener('click', e => {
      if (e.target.closest('.opt') || e.target.closest('.btn') || e.target.closest('.feedback')) return;
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open');
      if (!isOpen && !openBox.firstChild) {
        openBox.style.display = 'block';
        const card = buildQCard(q, {
          initial: sessionState.get(q.id),
          onAnswer(user, ok) {
            sessionState.set(q.id, { user, ok });
            rememberState();
            if (ok) { removeWrong(q.id); ansStrip.innerHTML = ''; ansStrip.appendChild(el('span', '', '✓ 已答对')); }
            else { addWrong(q.id); ansStrip.innerHTML = ''; ansStrip.appendChild(el('span', '', '✗ 已答错')); }
          },
        });
        openBox.appendChild(card);
      }
      openBox.style.display = item.classList.contains('open') ? 'block' : 'none';
    });
    box.appendChild(item);
  }

  applyFilter();
  view(d);
}

/* ---- chapters ---- */
function viewChapters() {
  const d = el('div');
  d.appendChild(pageHead('分章节题库', '按教材章节逐章刷题。', '#/', '首页'));
  const counts = {};
  QUESTIONS.forEach(q => { const c = chapterName(q.chapter); counts[c] = (counts[c] || 0) + 1; });
  const grid = el('div', 'ch-grid');
  CHAPTER_ORDER.forEach(c => {
    if (!counts[c]) return;
    const a = el('a', 'ch-card');
    a.href = '#/chapter/' + encodeURIComponent(c);
    a.appendChild(el('h3', '', c));
    a.appendChild(el('p', '', counts[c] + ' 题'));
    grid.appendChild(a);
  });
  d.appendChild(grid);
  view(d);
}

function viewChapter(name) {
  const d = el('div');
  d.appendChild(pageHead(name, '本章共 ' + QUESTIONS.filter(q => chapterName(q.chapter) === name).length + ' 题。', '#/chapters', '分章节'));
  const listBox = el('div');
  const qs = QUESTIONS.filter(q => chapterName(q.chapter) === name);
  let shown = 0;
  const PAGE = 50;
  function renderPage() {
    const slice = qs.slice(shown, shown + PAGE);
    slice.forEach(q => renderItem(q, listBox));
    shown += slice.length;
    let more = listBox.querySelector('.load-more');
    if (more) more.remove();
    if (shown < qs.length) {
      const w = el('div', 'load-more');
      const b = el('button', 'btn');
      b.textContent = '加载更多（' + shown + '/' + qs.length + '）';
      b.addEventListener('click', renderPage);
      w.appendChild(b);
      listBox.appendChild(w);
    }
  }
  function renderItem(q, box) {
    const item = el('div', 'bank-item');
    const tm = TYPE_META[q.type];
    const strip = el('div', 'q-meta');
    strip.appendChild(el('span', 'chip ' + tm.cls, tm.label));
    item.appendChild(strip);
    item.appendChild(el('div', 'stem', q.stem));
    const openBox = el('div', 'bank-open');
    openBox.style.display = 'none';
    item.appendChild(openBox);
    item.addEventListener('click', e => {
      if (e.target.closest('.opt') || e.target.closest('.btn') || e.target.closest('.feedback')) return;
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open');
      if (!isOpen && !openBox.firstChild) {
        openBox.style.display = 'block';
        openBox.appendChild(buildQCard(q, {
          initial: sessionState.get(q.id),
          onAnswer(user, ok) {
            sessionState.set(q.id, { user, ok });
            rememberState();
            if (ok) removeWrong(q.id); else addWrong(q.id);
          },
        }));
      }
      openBox.style.display = item.classList.contains('open') ? 'block' : 'none';
    });
    box.appendChild(item);
  }
  renderPage();
  d.appendChild(listBox);
  view(d);
}

/* ---- wrongs ---- */
function viewWrongs() {
  const d = el('div');
  const wrongs = getWrongs();
  d.appendChild(pageHead('错题本', '共 ' + wrongs.length + ' 道错题。重新作答，答对即自动移出。', '#/', '首页'));
  if (wrongs.length === 0) {
    const e = el('div', 'empty');
    e.appendChild(el('span', 'ico', '🎉'));
    e.appendChild(document.createTextNode('错题本是空的，继续保持！'));
    d.appendChild(e);
    view(d);
    return;
  }
  const row = el('div', 'next-row');
  const clear = el('button', 'btn danger small');
  clear.textContent = '清空错题本';
  clear.addEventListener('click', () => {
    if (confirm('确定清空全部错题吗？')) {
      save(K_WRONG, []);
      viewWrongs();
    }
  });
  row.appendChild(clear);
  d.appendChild(row);

  const listBox = el('div');
  wrongs.slice().reverse().forEach(w => {
    const q = byId[w.qid];
    if (!q) return;
    const item = el('div', 'list-item');
    const top = el('div', 'top');
    top.appendChild(el('div', 't', q.stem));
    top.appendChild(el('div', 'd', '答错于 ' + fmtTime(w.time)));
    item.appendChild(top);
    const openBox = el('div', 'bank-open');
    openBox.style.display = 'none';
    item.appendChild(openBox);
    item.addEventListener('click', e => {
      if (e.target.closest('.opt') || e.target.closest('.btn') || e.target.closest('.feedback')) return;
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open');
      if (!isOpen && !openBox.firstChild) {
        openBox.style.display = 'block';
        openBox.appendChild(buildQCard(q, {
          onAnswer(user, ok) {
            if (ok) {
              removeWrong(q.id);
              setTimeout(() => viewWrongs(), 600);
            } else {
              addWrong(q.id);
            }
          },
        }));
      }
      openBox.style.display = item.classList.contains('open') ? 'block' : 'none';
    });
    listBox.appendChild(item);
  });
  d.appendChild(listBox);
  view(d);
}

/* ---- records ---- */
function viewRecords() {
  const d = el('div');
  const exams = getExams();
  d.appendChild(pageHead('考试记录', '共 ' + exams.length + ' 次模拟考试，点击可回看整卷。', '#/', '首页'));
  if (exams.length === 0) {
    const e = el('div', 'empty');
    e.appendChild(el('span', 'ico', '📝'));
    e.appendChild(document.createTextNode('还没有考试记录，去做一套模拟题吧'));
    d.appendChild(e);
    view(d);
    return;
  }
  exams.forEach(rec => {
    const item = el('div', 'list-item rec-item');
    const top = el('div', 'top');
    const t = el('div', 't', '模拟考试');
    t.appendChild(el('span', 'd', ' · ' + fmtTime(rec.time)));
    top.appendChild(t);
    const pct = Math.round(rec.score / rec.total * 100);
    top.appendChild(el('div', 'rec-score ' + (pct >= 60 ? 'ok' : ''), rec.score + ' / ' + rec.total + ' 分'));
    item.appendChild(top);
    const ops = el('div', 'next-row');
    const del = el('button', 'btn danger small');
    del.textContent = '删除';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('删除这条考试记录？')) {
        removeExam(rec.id);
        viewRecords();
      }
    });
    ops.appendChild(del);
    item.appendChild(ops);
    item.addEventListener('click', () => { location.hash = '#/record/' + rec.id; });
    d.appendChild(item);
  });
  view(d);
}

function viewRecord(id) {
  const rec = getExams().find(x => x.id === id);
  const d = el('div');
  if (!rec) {
    d.appendChild(pageHead('考试记录', null, '#/records', '返回'));
    d.appendChild(el('div', 'empty', '记录不存在'));
    view(d);
    return;
  }
  const pct = Math.round(rec.score / rec.total * 100);
  d.appendChild(pageHead('套卷回顾', fmtTime(rec.time) + ' · 得分 ' + rec.score + '/' + rec.total + '（' + pct + '%）', '#/records', '考试记录'));
  rec.detail.forEach(item => {
    const q = byId[item.qid];
    if (!q) return;
    const card = el('div', 'q-card review');
    const meta = el('div', 'q-meta');
    const tm = TYPE_META[q.type] || { label: q.type, cls: 'single' };
    meta.appendChild(el('span', 'chip ' + tm.cls, tm.label));
    meta.appendChild(el('span', 'chip chapter', chapterName(q.chapter)));
    card.appendChild(meta);
    card.appendChild(el('div', 'q-stem', q.stem));
    const ansSet = new Set(q.answer.split(''));
    q.options.forEach(o => {
      const b = el('div', 'opt');
      b.appendChild(el('span', 'k', o.k));
      b.appendChild(el('span', 't', o.t));
      const chosen = item.user.includes(o.k);
      const isRight = ansSet.has(o.k);
      if (chosen && isRight) b.classList.add('right');
      else if (chosen && !isRight) b.classList.add('wrong');
      else if (!chosen && isRight) b.classList.add('right');
      else b.classList.add('dim');
      card.appendChild(b);
    });
    const ra = el('div', 'review-ans ' + (item.ok ? 'ok' : 'bad'));
    ra.appendChild(el('span', '', item.ok ? '✓ 答对' : '✗ 答错'));
    const userLabel = q.type === '判断题' ? (item.user === 'A' ? '对' : item.user === 'B' ? '错' : '') : item.user;
    ra.appendChild(el('span', 'user', '你的答案：' + (userLabel || '（未作答）') + '　正确答案：' + q.answer));
    card.appendChild(ra);
    if (q.explanation) {
      const ex = el('div', 'expl');
      ex.appendChild(el('b', '', '解析：'));
      ex.appendChild(document.createTextNode(q.explanation));
      card.appendChild(ex);
    }
    d.appendChild(card);
  });
  view(d);
}

/* ---------- router ---------- */
function route() {
  const h = location.hash || '#/';
  const parts = h.replace(/^#\/?/, '').split('/');
  const nav = document.querySelectorAll('.topbar nav a');
  nav.forEach(a => {
    const key = a.dataset.nav;
    let on = false;
    if (key === 'home') on = parts[0] === '';
    else if (key === 'exam') on = parts[0] === 'exam';
    else if (key === 'bank') on = parts[0] === 'bank';
    else if (key === 'chapters') on = parts[0] === 'chapters' || parts[0] === 'chapter';
    else if (key === 'wrongs') on = parts[0] === 'wrongs';
    else if (key === 'records') on = parts[0] === 'records' || parts[0] === 'record';
    a.classList.toggle('active', on);
  });
  if (parts[0] === '') return viewHome();
  if (parts[0] === 'exam' && parts[1] === 'run') return viewExamRun();
  if (parts[0] === 'exam') return viewExamIntro();
  if (parts[0] === 'bank') return viewBank();
  if (parts[0] === 'chapters') return viewChapters();
  if (parts[0] === 'chapter' && parts[1]) return viewChapter(decodeURIComponent(parts[1]));
  if (parts[0] === 'wrongs') return viewWrongs();
  if (parts[0] === 'records') return viewRecords();
  if (parts[0] === 'record' && parts[1]) return viewRecord(parts[1]);
  return viewHome();
}
window.addEventListener('hashchange', route);
route();
