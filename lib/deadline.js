/* 토요일645 — 요청 하나의 공통 마감 시각
   ───────────────────────────────────────────────────────────────
   예전에는 '조회를 시작하기 전' 에만 남은 시간을 봤습니다.
   그래서 이미 시작된 조회는 아무도 멈추지 않았습니다.
   뉴스 기사 본문을 차례로 받는 자리가 특히 위험했습니다 —
   검색 결과를 하나씩 열어 보므로, 느린 기사가 몇 개 있으면
   한 번의 수집이 함수 제한 시간을 넘길 수 있었습니다.
   그렇게 되면 이미 읽어 둔 DB 결과까지 통째로 사라집니다.

   그래서 요청 하나에 마감 시각을 하나 둡니다.
     · 모든 바깥 요청(공식·뉴스 검색·기사 본문·대체 출처·DB)에 같은 신호를 겁니다.
     · 마감이 지나면 진행 중이던 요청도 끊깁니다.
     · 남은 시간이 모자라면 새 조회를 아예 시작하지 않습니다.
   마감이 와도 '아무것도 못 주는' 것이 아니라,
   이미 가진 DB 결과를 partial 로 표시해 돌려줍니다.                 */

/* 여러 신호를 하나로 묶습니다 (어느 하나라도 끊기면 끊김) */
export function anySignal(list) {
  const signals = (list || []).filter(Boolean);
  if (!signals.length) return undefined;
  if (signals.length === 1) return signals[0];
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.any) return AbortSignal.any(signals);
  } catch (e) {}
  const c = new AbortController();
  for (const s of signals) {
    if (s.aborted) { try { c.abort(s.reason); } catch (e) { c.abort(); } return c.signal; }
    s.addEventListener('abort', () => { try { c.abort(s.reason); } catch (e) { c.abort(); } },
                       { once: true });
  }
  return c.signal;
}

/* 한 번의 요청이 쓸 수 있는 전체 시간 */
export function newDeadline(ms) {
  const at = Date.now() + Math.max(0, ms | 0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(new Error('deadline')); } catch (e) { try { ctrl.abort(); } catch (e2) {} }
  }, Math.max(0, ms | 0));
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    at,
    signal: ctrl.signal,
    left() { return at - Date.now(); },
    expired() { return Date.now() >= at; },

    /* 이 일을 지금 시작해도 되는지.
       need 만큼의 시간도 안 남았으면 시작하지 않습니다 —
       어차피 끊길 요청을 보내 바깥 서버를 괴롭히지 않습니다. */
    canStart(need) { return (at - Date.now()) > Math.max(300, need | 0); },

    /* 바깥 요청 하나에 걸 신호.
       '이 요청의 제한 시간' 과 '요청 전체의 마감' 중 먼저 오는 쪽에서 끊깁니다. */
    fetchSignal(perMs) {
      const per = Math.max(1, Math.min(perMs | 0, Math.max(1, at - Date.now())));
      let own;
      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) own = AbortSignal.timeout(per);
      } catch (e) {}
      if (!own) {
        const c = new AbortController();
        const t = setTimeout(() => { try { c.abort(); } catch (e) {} }, per);
        if (t && typeof t.unref === 'function') t.unref();
        own = c.signal;
      }
      return anySignal([own, ctrl.signal]);
    },

    done() { try { clearTimeout(timer); } catch (e) {} }
  };
}

/* 마감이 없는 자리에서도 같은 모양으로 쓸 수 있게 하는 빈 마감 */
export const noDeadline = () => ({
  at: Infinity,
  signal: undefined,
  left: () => Infinity,
  expired: () => false,
  canStart: () => true,
  fetchSignal(perMs) {
    try {
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(perMs | 0);
    } catch (e) {}
    const c = new AbortController();
    const t = setTimeout(() => { try { c.abort(); } catch (e) {} }, perMs | 0);
    if (t && typeof t.unref === 'function') t.unref();
    return c.signal;
  },
  done() {}
});
