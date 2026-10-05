/* =========================================================
   할 일 앱: "이벤트 → 상태 변경 → DOM 업데이트"
   이번 실습의 핵심 파일입니다. 위에서부터 천천히 읽어 보세요.
   (Flow.xxx()로 시작하는 줄은 오른쪽 시각화 패널용이라 무시해도 돼요.)
   ========================================================= */

// ---------------------------------------------------------
// 0. 상태(state): 화면에 보여 줄 데이터의 "원본"
//    화면은 언제나 이 값을 보고 그려집니다.
// ---------------------------------------------------------
let state = {
  todos: [
    { id: 1, text: 'HTML 뼈대 만들기', done: true },
    { id: 2, text: '버튼에 이벤트 연결하기', done: false },
    { id: 3, text: 'render 함수 작성하기', done: false },
  ],
  nextId: 4,
};

let autoRender = true; // 🧪 실험용 스위치 (false면 화면을 다시 그리지 않음)

// 자주 쓸 DOM 요소를 미리 찾아 둡니다.
const $form = document.querySelector('#todo-form');
const $input = document.querySelector('#todo-input');
const $list = document.querySelector('#todo-list');
const $count = document.querySelector('#count');
const $empty = document.querySelector('#empty');

// ---------------------------------------------------------
// ② 상태 변경: state는 반드시 이 함수로만 바꿉니다.
//    (React의 useState setter와 같은 역할)
// ---------------------------------------------------------
function setState(makeNextState) {
  const prevState = state;
  state = makeNextState(prevState); // 이전 state를 받아 새 state를 만든다
  Flow.stateChanged(prevState, state);

  if (autoRender) {
    render(); // ③으로! state가 바뀌었으니 화면을 다시 그린다
  }
}

// ---------------------------------------------------------
// ③ DOM 업데이트: state를 보고 화면을 "처음부터" 다시 그립니다.
//    화면을 바꾸는 코드는 여기에만 있어요. 다른 곳에서는 DOM을 고치지 않아요.
// ---------------------------------------------------------
function render() {
  $list.innerHTML = ''; // 1) 기존 목록을 비우고

  state.todos.forEach((todo) => { // 2) state를 보고 다시 채운다
    const $li = document.createElement('li');
    $li.className = todo.done ? 'todo done' : 'todo';
    $li.dataset.id = todo.id;

    const $check = document.createElement('button');
    $check.className = 'check';
    $check.textContent = todo.done ? '✓' : '';
    $check.setAttribute('aria-label', '완료 표시');

    const $text = document.createElement('span');
    $text.className = 'text';
    $text.textContent = todo.text;

    const $delete = document.createElement('button');
    $delete.className = 'delete';
    $delete.textContent = '×';
    $delete.setAttribute('aria-label', '삭제');

    $li.append($check, $text, $delete);
    $list.append($li);
  });

  $count.textContent = state.todos.filter((todo) => !todo.done).length;
  $empty.hidden = state.todos.length > 0;

  Flow.rendered(state);
}

// ---------------------------------------------------------
// ① 이벤트: 사용자의 행동을 듣고, "state를 어떻게 바꿀지"만 정합니다.
//    여기서는 DOM을 직접 고치지 않아요. 그건 render()가 할 일!
// ---------------------------------------------------------

// [추가] 폼 제출 (추가 버튼 클릭 또는 Enter)
$form.addEventListener('submit', (event) => {
  event.preventDefault(); // 폼 제출 시 페이지가 새로고침되는 것을 막기
  const text = $input.value.trim();
  if (text === '') return;

  Flow.event('add', text);

  setState((prev) => ({
    ...prev, // 나머지 값은 그대로 복사하고
    todos: [...prev.todos, { id: prev.nextId, text: text, done: false }], // 새 항목을 붙인 "새 배열"
    nextId: prev.nextId + 1,
  }));

  $input.value = ''; // 다음 입력을 위해 입력창 비우기
});

// [완료 체크 / 삭제] 목록 클릭
//   <li>는 render할 때마다 새로 만들어지므로, 매번 리스너를 다시 달지 않도록
//   부모 <ul>에 한 번만 리스너를 겁니다. (이벤트 위임)
$list.addEventListener('click', (event) => {
  const $li = event.target.closest('li');
  if (!$li) return;
  const id = Number($li.dataset.id);
  const text = $li.querySelector('.text').textContent;

  if (event.target.closest('.delete')) {
    Flow.event('remove', text);
    setState((prev) => ({
      ...prev,
      todos: prev.todos.filter((todo) => todo.id !== id), // 해당 id만 뺀 새 배열
    }));
  } else {
    Flow.event('toggle', text);
    setState((prev) => ({
      ...prev,
      todos: prev.todos.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo // 해당 항목만 done을 뒤집은 새 객체
      ),
    }));
  }
});

// ---------------------------------------------------------
// 🧪 실험실
// ---------------------------------------------------------
document.querySelector('#auto-render').addEventListener('change', (event) => {
  autoRender = event.target.checked;
  Flow.setAutoRender(autoRender);
});

document.querySelector('#manual-render').addEventListener('click', () => {
  render();
});

// 처음 한 번 화면 그리기
render();
