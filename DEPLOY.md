# TREKKING 108 — PWA 배포 순서 (안드로이드·아이폰)

배포는 사용자가 직접 합니다. 키·비밀번호는 Vercel 환경변수에만 넣고 GitHub에는 올리지 않습니다.

## 1. 준비물 (계정)
- GitHub 저장소(비공개 권장), Vercel, Firebase, 카카오·네이버 개발자, 토스페이먼츠(가맹), Gmail 앱 비밀번호
- 공무원 겸직: 기부(유료 결제)를 받는 서비스는 사업자 등록·겸직 허가가 필요할 수 있으니 공개 전에 소속 기관에 확인

## 2. Vercel에 올리기
1. 이 폴더를 GitHub 비공개 저장소로 올림 (.env, service-account.json 은 .gitignore 로 제외됨)
2. Vercel → Add New → Project → 저장소 Import → Framework: Other, Output: `public`
3. Settings → Environment Variables 에 `.env.example` 이름대로 값 입력
   - Firebase 6개, FIREBASE_SERVICE_ACCOUNT, SITE_URL(배포 주소)
   - KAKAO_REST_API_KEY / KAKAO_CLIENT_SECRET, NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
   - TOSS_CLIENT_KEY / TOSS_SECRET_KEY (처음엔 test_ 키)
   - CERT_MAIL_USER / CERT_MAIL_PASS (Gmail 앱 비밀번호)
4. Deploy → 주소 확인 (예: https://trekking108.vercel.app) → SITE_URL 에 넣고 다시 Deploy
5. Firebase → Authentication → 승인된 도메인에 그 주소 추가, 보안 규칙(firestore.rules, storage.rules) 게시
6. 카카오·네이버 콘솔에 Redirect URI 등록: `https://주소/api/auth/kakao`, `https://주소/api/auth/naver`

## 3. 토스페이먼츠 (기부)
1. 테스트 키로 코스 기부 1,000원 → 결제 → 메달 색 확인 → 결제 취소 안내 확인
2. 가맹 심사 완료 후 live_ 키로 교체 → 다시 Deploy

## 4. 아이폰 (PWA)
- 사파리에서 주소 열기 → 공유 → 홈 화면에 추가 → 전체 화면 앱으로 실행
- 앱 안 설정 → "공유하기 · 홈 화면에 추가"에 같은 안내가 있음
- 앱스토어 등록은 하지 않음 (결제는 웹 토스로 처리)

## 5. 안드로이드
- 바로 쓰기: 크롬에서 주소 열기 → "앱 설치" 또는 메뉴 → 홈 화면에 추가
- 플레이스토어 등록(선택): PWABuilder(https://www.pwabuilder.com)에 주소 입력 → Android 패키지(TWA) 생성
  1. 패키지 이름 예: kr.trekking108.app
  2. 플레이 콘솔에 올린 뒤 "앱 서명 키 SHA-256 지문"을 `public/.well-known/assetlinks.json.example`에 넣고 파일 이름을 `assetlinks.json`으로 바꿔 다시 Deploy
  3. 이 파일이 맞아야 앱 위쪽 주소창이 사라짐
  - 플레이스토어 앱 안 결제는 구글 결제 정책 확인 필요 (외부 결제 허용 범위가 2026년 개편 중)

## 6. 배포 후 확인
- [ ] 카카오·네이버·Google 로그인
- [ ] GPS 완주 인증(코스 10km 안), 메달 저장, 다른 기기에서도 보이는지
- [ ] 테스트 결제 → 메달 색, 인증서 신청 메일(현황표 첨부) 수신
- [ ] 아이폰 홈 화면 추가·전체 화면, 안드로이드 설치 버튼
- [ ] 크롬 개발자도구 → Lighthouse → PWA 설치 가능 표시

## 7. NEW 코스 자동 갱신 (매년 1월 1일)
1. 공공데이터포털(data.go.kr)에서 "한국관광공사_두루누비 정보 서비스_GW" 활용신청 → 일반 인증키(Decoding) 복사
2. Vercel 환경변수: `DURUNUBI_KEY`(위 키), `CRON_SECRET`(아무 긴 임의 문자열) → Redeploy
3. vercel.json 의 crons 가 매년 1월 1일 00:05(한국 시간)에 `/api/cron/newcourses` 를 실행
4. 처음 한 번은 Vercel → Settings → Cron Jobs → **Run** 으로 직접 돌려 결과(log)를 확인 — 두루누비 응답 필드 이름이 명세서와 다르면 log 에 "필드 없음"이 찍힘
5. 직접 추천할 길은 `app/newcourses_seed.json` 에 추가 (출처 필수) → 빌드 후 배포
6. 자동 수집된 길을 빼려면 Firestore `meta/newcourses` 의 items 에서 해당 항목 삭제
