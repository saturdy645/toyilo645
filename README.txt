토요일 645 - Vercel + Supabase 배포판
(2026-10-22 갱신 · 앱 v10.56.0 · 서버 build 2026-10-22b)

1) Vercel
- GitHub에 이 폴더를 업로드합니다.
- Vercel > Add New Project > 해당 GitHub 저장소 Import > Deploy

2) Supabase
- 새 프로젝트 생성
- SQL Editor에서 supabase.sql 전체 실행
- Authentication > Providers에서 Google / Kakao / Apple을 설정
- Authentication > URL Configuration에서 배포 URL을 Site URL/Redirect URLs에 추가
- Supabase Project Settings에서 Project URL과 Publishable/Anon key를 확인

3) Vercel Environment Variables
프로젝트 > Settings > Environment Variables

[반드시 필요]
- SUPABASE_URL = Supabase Project URL
- SUPABASE_ANON_KEY = Supabase Publishable/Anon key   (브라우저에 내려가는 키)
- SUPABASE_SERVICE_ROLE_KEY = Supabase service role key (서버에서만 씁니다)
- OPENAI_API_KEY = OpenAI API key (절대 HTML에 넣지 않음)

  ※ 2026-10-22 정정: 예전 README에는 ANTHROPIC_API_KEY / ANTHROPIC_MODEL 로
    적혀 있었습니다. 실제 api/ai.js 는 OPENAI_API_KEY 를 읽습니다.
    ANTHROPIC_API_KEY 만 넣어 두면 /api/ai 가 500을 돌려줍니다.
    api/ai.js 는 이번 병합에서 한 글자도 바꾸지 않았으므로,
    맞춰야 하는 쪽은 환경변수입니다.

[관리자 저장용]
- UPDATE_LOTTO_SECRET = /api/update-lotto 호출에 쓰는 비밀값
  (admin-lotto.html 이 x-update-secret 머리에 실어 보냅니다)

[자동 수집용 — 선택]
- CRON_SECRET = 정해 두면 /api/sync-lotto 가 잠깁니다.
  Vercel Cron 은 Authorization: Bearer <값> 으로 스스로 보냅니다.
  CRON_SECRET 과 UPDATE_LOTTO_SECRET 중 하나라도 정해 두면 잠깁니다.
  둘 다 없으면 잠그지 않습니다.
- DH_JSON_URL = 동행복권 JSON 주소가 바뀌었을 때 갈아끼웁니다.
  {round} 자리에 회차가 들어갑니다. 비워 두면 기존 주소를 씁니다.
- NAVER_CLIENT_ID / NAVER_CLIENT_SECRET = 뉴스 교차 확인에 씁니다.
  없으면 뉴스 확인을 건너뜁니다.
- EXTRA_SOURCES = 대체 조회원 목록(JSON 한 줄).
  예: [{"name":"복똑방","url":"https://…/{round}"}]

환경변수 저장 후 Redeploy 해야 합니다.

4) 로그인
- 카카오 / 구글 / 애플 버튼은 Supabase OAuth를 사용합니다.
- 네이버는 Supabase 기본 provider 목록에 없으므로 별도의 Custom OAuth/OIDC 또는
  Naver 전용 인증 서버 구성이 필요합니다.

5) 데이터
- 로그인 사용자: user_kv에 사용자별 저장
- 공동 채팅/후기: shared_kv에 저장
- 비로그인 사용자: 브라우저 localStorage를 fallback으로 사용
- 당첨번호: lotto_draws (round, draw_date, nums, bonus)

  ※ supabase.sql 에는 user_kv 와 shared_kv 만 들어 있습니다.
    lotto_draws 표와 /api/ai 가 쓰는 consume_ai_daily_quota 함수는
    이 파일에 없습니다. 이미 만들어 쓰고 계신 것으로 보이며,
    잘못 건드리면 운영 중인 DB가 깨질 수 있어 이번 병합에서
    SQL 파일은 한 글자도 바꾸지 않았습니다.

6) AI
- 브라우저는 /api/ai만 호출합니다. (앱의 AI_PATH='/api/ai')
- API key는 Vercel 서버 환경변수에만 보관합니다.
- 하루 10회 제한: Supabase 함수 consume_ai_daily_quota 로 차감합니다.
  로그인 사용자는 userId, 게스트는 IP+브라우저 정보를 해시해 구분합니다.
- 이번 병합에서 api/ai.js 와 api/config.js 는 바꾸지 않았습니다.

────────────────────────────────────────────────────────
7) 당첨번호 API (2026-10-22 병합분)

[기준은 그대로 DB 입니다]
  당첨번호의 기준 저장소는 예전과 같이 Supabase 의 lotto_draws 입니다.
  앱이 보는 /api/lotto 의 응답 모양도 그대로입니다.

  GET /api/lotto            → 최근 60회차
  GET /api/lotto?since=1244 → 1245회부터
  GET /api/lotto?round=1246 → 그 회차만
  응답 { latest, draws:[{round,date,nums,bonus}], build }

[달라진 것 — 빈 회차를 스스로 채웁니다]
  DB 에 아직 없는 '추첨이 끝난 최신 회차' 가 있으면, 그 요청 안에서
  공식(동행복권) → 안 되면 뉴스·대체 출처 교차 확인 순으로 확인하고,
  확인된 값만 DB 에 넣은 뒤 같은 응답에 함께 담아 보냅니다.
  확인하지 못하면 아무것도 저장하지 않고 빈 목록을 돌려줍니다.
  수집을 끄려면 /api/lotto?collect=0

[자동 동기화]
  GET /api/sync-lotto            → 빠진 최신 회차 3개까지
  GET /api/sync-lotto?n=5        → 개수 조절 (1~10)
  GET /api/sync-lotto?round=1246 → 그 회차만, 이미 있어도 다시 맞대어 봅니다
  GET /api/sync-lotto?recheck=1  → 저장된 회차도 다시 맞대어 봅니다

[지키는 규칙]
  · 확인되지 않은 값은 저장하지 않습니다. 추측값을 만들지 않습니다.
  · 요청한 회차와 응답의 회차가 다르면 버립니다.
  · 본번호·보너스는 1~45 범위일 뿐 아니라 정수여야 합니다.
  · 교차 확인은 서로 다른 '사이트' 두 곳 이상이 같은 값을 말할 때만 받아들입니다.
    같은 사이트가 뉴스로도 대체 조회원으로도 들어오면 한 곳으로 셉니다.
  · 이미 저장된 회차는 덮어쓰지 않습니다.
    번호가 같으면 same, 다르면 conflict 로 알리고 그대로 둡니다.
    기존 /api/update-lotto 가 409로 거절하던 것과 같은 규칙입니다.
  · 요청 하나에 공통 마감 시각이 있습니다.
    /api/lotto 는 12초, /api/sync-lotto 는 22초입니다
    (vercel.json 의 maxDuration 30초 안에서 끝나도록 잡았습니다).
    공식·뉴스 검색·기사 본문·대체 출처·DB 읽기가 모두 같은 신호를 받으므로,
    마감이 지나면 '이미 시작된' 요청도 끊깁니다.
    남은 시간보다 오래 걸릴 새 조회는 아예 시작하지 않습니다.
    요청별 제한 시간은 공식 6초 · 뉴스 검색 6초 · 기사 본문 7초 ·
    대체 조회원 7초 · DB 읽기 6초이고, 마감과 둘 중 먼저 오는 쪽에서 끊깁니다.
  · DB 쓰기만은 마감에 묶지 않습니다. 넣는 도중에 끊기면 들어갔는지
    알 수 없게 되기 때문입니다. 대신 남은 시간이 넉넉할 때만 시작하고
    (4.5초), 시작하지 못하면 skipped 로 알립니다.
  · 마감에 걸리거나 수집이 실패해도, 이미 읽어 둔 DB 결과는 그대로
    돌아갑니다. 응답에 partial:true 가 붙습니다.
    수집 실패가 정상 DB 조회까지 500 으로 만들지 않습니다.
    (500 은 DB 조회 자체가 안 된 경우에만 납니다.)

[관리자 저장]
  POST /api/update-lotto (x-update-secret 머리 필요)
  이번 병합에서 바꾸지 않았습니다. admin-lotto.html 도 그대로입니다.

8) 배포가 반영됐는지 확인하는 법
  https://<배포주소>/api/lotto?round=1243
  응답에 "build":"2026-10-22b" 가 보이면 새 코드입니다.
  latest 와 draws 두 가지만 보이면 아직 옛 코드입니다.

9) vercel.json
  {
    "regions": ["icn1"],                         서울에서 실행
    "functions": { "api/*.js": { "maxDuration": 30 } },
    "crons": [ { "path": "/api/sync-lotto", "schedule": "0 12 * * *" } ]
  }

  · regions 는 한 곳만 적었습니다. Hobby 요금제는 리전 한 곳까지 되고,
    더 많이 적으면 빌드 전에 배포가 실패합니다.
  · cron 은 하루 한 번(12:00 UTC = 21:00 KST)만 넣었습니다.
    Hobby 요금제는 하루 한 번을 넘는 식을 쓰면 배포가 실패합니다.
    Pro 이상이면 토요일 밤에 자주 돌도록 아래처럼 늘릴 수 있습니다.

      "crons": [
        { "path": "/api/sync-lotto", "schedule": "35-59/5 11 * * 6" },
        { "path": "/api/sync-lotto", "schedule": "*/5 12-14 * * 6" },
        { "path": "/api/sync-lotto", "schedule": "0 */3 * * *" }
      ]

  · cron 이 하루 한 번이어도 추첨 직후 결과가 늦지 않습니다.
    앱이 /api/lotto 를 부를 때 빈 회차를 그 자리에서 채우기 때문입니다.
    cron 은 아무도 앱을 켜지 않았을 때를 위한 보조입니다.

10) 파일 구조
  index.html             앱 (v10.56.0)
  admin-lotto.html       관리자 저장 화면 (변경 없음)
  manifest.webmanifest   (변경 없음)
  icon-180/192/512.png   (변경 없음)
  supabase.sql           (변경 없음)
  vercel.json            기존 설정 + 리전 + cron
  api/ai.js              (변경 없음)
  api/config.js          (변경 없음)
  api/update-lotto.js    (변경 없음)
  api/lotto.js           DB 조회 + 빈 회차 수집
  api/sync-lotto.js      자동 수집 (예전에는 503 으로 꺼 둔 자리)
  lib/deadline.js        요청 하나의 공통 마감 시각·취소 신호
  lib/collect.js         공식·교차 확인
  lib/store.js           Supabase 읽기/쓰기, 덮어쓰기 금지 규칙
  lib/news.js            뉴스 검색·기사 판독
  lib/sources.js         대체 조회원

  ※ 공유 코드는 api/ 가 아니라 lib/ 에 두었습니다.
    Vercel 은 api/ 아래 파일을 모두 함수로 보기 때문에,
    거기에 두면 /api/news 같은 주소가 생기고 빌드가 실패할 수 있습니다.
