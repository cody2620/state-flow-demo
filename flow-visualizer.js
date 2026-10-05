/* =========================================================
   오른쪽 "방금 일어난 일" 패널을 그리는 코드 (시각화 전용)
   앱 동작과는 상관없어요. 실습의 핵심은 app.js입니다!
   ========================================================= */
const Flow = (() => {
  const STEP = 650; // 단계 사이 간격(ms)
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ACTIONS = {
    add: {
      event: 'submit', label: '할 일 추가',
      where: '대상: <form id="todo-form"> (추가 버튼 또는 Enter)',
      code: "$form.addEventListener('submit', (event) => { ... })",
      stateCode: 'setState(prev => ({ ...prev, todos: [...prev.todos, 새 항목], nextId: prev.nextId + 1 }))',
    },
    toggle: {
      event: 'click', label: '완료 체크',
      where: '대상: <li>를 클릭 → 부모 <ul>이 받음 (이벤트 위임)',
      code: "$list.addEventListener('click', (event) => { ... })",
      stateCode: 'todos: prev.todos.map(todo => todo.id === id ? { ...todo, done: !todo.done } : todo)',
    },
    remove: {
      event: 'click', label: '삭제',
      where: '대상: <button class="delete"> → 부모 <ul>이 받음 (이벤트 위임)',
      code: "$list.addEventListener('click', (event) => { ... })",
      stateCode: 'todos: prev.todos.filter(todo => todo.id !== id)',
    },
  };

  const counts = { event: 0, state: 0, dom: 0 };
  let pending = [];
  let cycleStart = 0;
  let current = null;
  let booted = false;
  let autoRender = true;
  let renderedState = null; // 마지막으로 render()가 그린 state
  let shownState = null;    // state 패널에 표시 중인 값
  let shownScreen = null;   // 화면에 반영됐다고 표시 중인 값
  let lastPointer = null;

  // ----- 단계별 예약 실행 -----
  function schedule(step, fn) {
    const job = { fn };
    const delay = Math.max(0, cycleStart + step * STEP - Date.now());
    job.id = setTimeout(() => {
      pending = pending.filter((j) => j !== job);
      fn();
    }, delay);
    pending.push(job);
  }
  function flush() { // 새 이벤트가 오면 남은 애니메이션을 즉시 끝낸다
    const jobs = pending;
    pending = [];
    jobs.forEach((j) => { clearTimeout(j.id); j.fn(); });
  }

  // ----- 화면 조각 -----
  const setStage = (name, status) => { $('#stage-' + name).className = 'stage ' + status; };
  const isIdle = (name) => $('#stage-' + name).classList.contains('idle');
  const setDetail = (name, html) => { $('#detail-' + name).innerHTML = html; };
  const setCode = (name, code) => { $('#code-' + name).textContent = code; };
  const setCount = (name) => { $('#cnt-' + name).textContent = counts[name] + '회'; };
  const lit = (n, on) => $('#arrow-' + n).classList.toggle('lit', on);
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const WAIT = '<span class="wait">기다리는 중…</span>';

  function flash(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // 애니메이션 재시작
    el.classList.add('flash');
  }

  function ripple() {
    let p = lastPointer && Date.now() - lastPointer.t < 1000 ? lastPointer : null;
    if (!p) {
      const r = $('#todo-form button').getBoundingClientRect();
      p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const dot = document.createElement('div');
    dot.className = 'ripple';
    dot.style.left = p.x + 'px';
    dot.style.top = p.y + 'px';
    document.body.append(dot);
    setTimeout(() => dot.remove(), 800);
  }
  $('#app').addEventListener('pointerdown', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, true);

  // ----- 두 state 비교 -----
  function diff(prev, next) {
    const before = new Map(prev.todos.map((t) => [t.id, t]));
    const after = new Map(next.todos.map((t) => [t.id, t]));
    return {
      added: next.todos.filter((t) => !before.has(t.id)),
      removed: prev.todos.filter((t) => !after.has(t.id)),
      toggled: next.todos.filter((t) => before.has(t.id) && before.get(t.id).done !== t.done),
      nextId: prev.nextId !== next.nextId ? [prev.nextId, next.nextId] : null,
    };
  }
  const leftCount = (s) => s.todos.filter((t) => !t.done).length;

  function stateLines(d) {
    const out = [];
    d.added.forEach((t) => out.push(`todos에 새 항목 추가 → <code>{ id: ${t.id}, text: "${esc(t.text)}", done: false }</code>`));
    d.toggled.forEach((t) => out.push(`id ${t.id}의 <code>done</code>: ${!t.done} → <b>${t.done}</b>`));
    d.removed.forEach((t) => out.push(`todos에서 id ${t.id} (“${esc(t.text)}”) 제거`));
    if (d.nextId) out.push(`<code>nextId</code>: ${d.nextId[0]} → ${d.nextId[1]}`);
    if (!out.length) out.push('바뀐 값이 없어요 (이미 지워진 항목을 눌렀을 수도 있어요)');
    return out;
  }

  function domLines(d, countChange, emptyChange, nowEmpty) {
    const out = [];
    d.added.forEach((t) => out.push(`<code>&lt;li data-id="${t.id}"&gt;</code> 새로 생김`));
    d.toggled.forEach((t) => out.push(`<code>&lt;li data-id="${t.id}"&gt;</code>에 class <code>done</code> ${t.done ? '추가 (✓, 줄 긋기)' : '제거'}`));
    d.removed.forEach((t) => out.push(`<code>&lt;li data-id="${t.id}"&gt;</code> 사라짐`));
    if (countChange) out.push(`<code>#count</code> 글자 ${countChange[0]} → ${countChange[1]}`);
    if (emptyChange) out.push(`“할 일이 없어요” 문구 ${nowEmpty ? '보임' : '숨김'}`);
    if (!out.length) out.push('달라진 곳 없음: 같은 state로 다시 그려서 결과도 같아요');
    return out;
  }

  // ----- state 패널 -----
  function showState(s, d) {
    shownState = s;
    const hot = new Set(d ? [...d.added, ...d.toggled].map((t) => t.id) : []);
    const row = (html, cls = '') => `<span class="row ${cls}">${html}</span>`;
    const rows = [row('state = {'), row('  todos: [')];
    s.todos.forEach((t, i) => {
      const comma = i < s.todos.length - 1 ? ',' : '';
      rows.push(row(
        `    { id: ${t.id}, text: "${esc(t.text)}", done: <span class="${t.done}">${t.done}</span> }${comma}`,
        hot.has(t.id) ? 'hot' : ''
      ));
    });
    if (d) d.removed.forEach((t) => rows.push(row(`    // id: ${t.id} "${esc(t.text)}" 삭제됨`, 'gone')));
    rows.push(row('  ],'));
    rows.push(row(`  nextId: ${s.nextId}`, d && d.nextId ? 'hot' : ''));
    rows.push(row('}'));
    $('#state-view').innerHTML = rows.join('');
    updateSync();
  }

  function updateSync() {
    if (!shownState || !shownScreen) return;
    const same = JSON.stringify(shownState.todos) === JSON.stringify(shownScreen.todos);
    const badge = $('#sync-badge');
    badge.className = 'badge ' + (same ? 'ok' : 'stale');
    badge.textContent = same ? '화면 = state ✓' : '⚠ 화면이 아직 옛날 state';
    $('#manual-render').classList.toggle('pulse', !same && !autoRender);
  }

  // =========================================================
  // app.js가 부르는 함수들
  // =========================================================

  // ① 이벤트 발생
  function event(type, text) {
    flush();
    cycleStart = Date.now();
    current = ACTIONS[type];
    counts.event++;
    setCount('event');
    ripple();

    setStage('event', 'active');
    setStage('state', 'idle');
    setStage('dom', 'idle');
    lit(1, false);
    lit(2, false);

    setDetail('event',
      `<span class="tag">${current.event}</span> <b>${current.label}</b>: “${esc(text)}”` +
      `<div class="sub">${esc(current.where)}</div>`);
    setCode('event', current.code);
    setDetail('state', WAIT); setCode('state', '');
    setDetail('dom', WAIT); setCode('dom', '');
  }

  // ② state 변경
  function stateChanged(prev, next) {
    const d = diff(prev, next);
    const action = current;
    schedule(1, () => {
      counts.state++;
      setCount('state');
      setStage('event', 'done');
      setStage('state', 'active');
      lit(1, true);
      setDetail('state', list(stateLines(d)));
      setCode('state', action ? action.stateCode : 'setState(...)');
      showState(next, d);
    });

    if (!autoRender) {
      schedule(2, () => {
        setStage('state', 'done');
        setStage('dom', 'skipped');
        setDetail('dom',
          '<b>render()가 호출되지 않았어요.</b><br>' +
          'state는 바뀌었지만 화면은 그대로예요. 왼쪽의 「render() 직접 호출하기」를 눌러 보세요.');
        setCode('dom', 'if (autoRender) render();   // ← 지금 스위치가 꺼져 있음');
      });
    }
  }

  // ③ render 완료
  function rendered(s) {
    if (!booted) { // 페이지가 처음 열렸을 때의 render
      booted = true;
      renderedState = s;
      shownScreen = s;
      counts.dom = 1;
      setCount('dom');
      showState(s, null);
      return;
    }

    // 직접 호출처럼 늦게 불린 render는 기다리지 않고 바로 보여 준다
    if (Date.now() - cycleStart > 2 * STEP) cycleStart = Date.now() - 2 * STEP;

    const prev = renderedState;
    renderedState = s;
    const d = diff(prev, s);
    const countChange = leftCount(prev) !== leftCount(s) ? [leftCount(prev), leftCount(s)] : null;
    const emptyChange = (prev.todos.length === 0) !== (s.todos.length === 0);
    const nowEmpty = s.todos.length === 0;

    schedule(2, () => {
      counts.dom++;
      setCount('dom');
      ['event', 'state'].forEach((n) => { if (!isIdle(n)) setStage(n, 'done'); });
      setStage('dom', 'active');
      lit(2, true);
      setDetail('dom',
        list(domLines(d, countChange, emptyChange, nowEmpty)) +
        '<div class="sub">render()는 목록 전체를 지우고 새로 만들었지만, 눈에 보이는 차이는 위의 것뿐이에요. ' +
        'React는 이런 “차이”만 찾아서 실제 DOM에 반영합니다.</div>');
      setCode('dom', 'render();   // state를 보고 목록과 개수를 처음부터 다시 그림');

      [...d.added, ...d.toggled].forEach((t) => flash($(`#todo-list li[data-id="${t.id}"]`)));
      if (countChange) flash($('#count'));
      if (emptyChange && nowEmpty) flash($('#empty'));

      shownScreen = s;
      updateSync();
    });
    schedule(4, () => setStage('dom', 'done'));
  }

  function setAutoRender(value) {
    autoRender = value;
    updateSync();
  }

  return { event, stateChanged, rendered, setAutoRender };
})();
