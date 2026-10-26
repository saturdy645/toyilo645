# 걷기좋은 대한민국 트레킹 108 — 웹 배포판

claude.ai 안에서 돌던 앱을 누구나 쓸 수 있게 따로 배포하는 버전이에요.
화면과 코스 데이터는 같고, 저장과 로그인만 Firebase로 바뀝니다.

- 로그인: 카카오, 네이버, Google
- 저장: 완주 메달·준비물 → Firestore `users/{uid}` (본인만 읽고 씀)
- 사진: 코스 지점별 사진 → Storage `photos/{uid}/…` + Firestore `photos/{코스}/items` (누구나 보기, 올린 사람만 삭제)
- 서버: Vercel 서버리스 함수 (`/api/config`, `/api/auth/kakao`, `/api/auth/naver`)

## 폴더

```
public/index.html      앱 화면 (코스 데이터 포함)
public/i18n/*.json     언어별 코스 번역
api/config.js          브라우저용 Firebase 설정을 환경변수에서 내려줌
api/auth/kakao.js      카카오 로그인 → Firebase 커스텀 토큰
api/auth/naver.js      네이버 로그인 → Firebase 커스텀 토큰
api/pay/order.js       결제 전 주문 기록 (금액·코스를 서버가 검사)
api/pay/confirm.js     토스 결제 승인 → 기부 기록(메달 색)
api/cert/send.js       완주 인증서 신청 메일 (메달 현황표 자동 첨부)
api/_lib/courses.json  기부 가능한 코스 목록 (빌드 때 자동 생성)
public/manifest.webmanifest, public/sw.js, public/icon-*.png   홈 화면 앱(PWA)
api/_lib/              Firebase Admin, 로그인 공통 처리
firestore.rules        Firestore 보안 규칙
storage.rules          Storage 보안 규칙
.env.example           환경변수 이름 목록 (값은 넣지 마세요)
```

## 키 관리 원칙

- 모든 키는 **Vercel 환경변수에만** 넣습니다. 소스·GitHub에는 실제 값을 쓰지 않습니다.
- 카카오 REST API 키·Client Secret, 네이버 Client Secret, Firebase 서비스 계정은 **서버 전용**이고 브라우저로 나가지 않습니다.
- Firebase 웹 설정값은 원래 공개용이지만, 이것도 환경변수로 관리하고 `/api/config`로 내려줍니다.

## 배포 순서

### 1. Firebase
1. Firebase 콘솔에서 프로젝트를 만듭니다.
2. Authentication → 로그인 방법에서 **Google**을 켭니다. (카카오·네이버는 서버에서 커스텀 토큰으로 처리하므로 따로 켤 것 없음)
3. Firestore Database와 Storage를 만듭니다.
   - Storage는 요금제(Blaze 종량제) 조건이 붙을 수 있으니 콘솔 안내를 확인하세요.
4. 보안 규칙을 올립니다: `firebase deploy --only firestore:rules,storage` (Firebase CLI) 또는 콘솔에 `firestore.rules`, `storage.rules` 내용을 붙여 넣기.
5. 프로젝트 설정 → 웹 앱 추가 → 설정값(apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)을 확인합니다.
6. 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 (JSON). 이 파일은 절대 GitHub에 올리지 마세요.

### 2. 카카오 (developers.kakao.com)
1. 애플리케이션 추가 → 앱 키에서 **REST API 키** 확인
2. 카카오 로그인 활성화
3. Redirect URI: `https://배포주소/api/auth/kakao`
4. 보안 → Client Secret을 켰다면 그 값도 환경변수에 넣기
5. 동의항목: 닉네임(선택)

### 3. 네이버 (developers.naver.com)
1. 애플리케이션 등록 → 사용 API: 네이버 로그인
2. 서비스 URL: `https://배포주소`, Callback URL: `https://배포주소/api/auth/naver`
3. Client ID / Client Secret 확인
4. 검수 전에는 등록한 멤버 계정만 로그인됩니다. 공개 전에 검수 요청이 필요해요.

### 4. Vercel
1. 이 폴더를 GitHub 저장소로 올리고 Vercel에서 Import
2. Settings → Environment Variables에 `.env.example`의 이름대로 값 입력
   - `SITE_URL`은 실제 배포 주소 (끝에 `/` 없이)
   - `FIREBASE_SERVICE_ACCOUNT`에는 서비스 계정 JSON 전체를 한 줄로 넣거나, `FIREBASE_CLIENT_EMAIL`·`FIREBASE_PRIVATE_KEY`로 나눠 넣기
3. Deploy
4. Firebase 콘솔 → Authentication → 설정 → **승인된 도메인**에 Vercel 주소 추가 (Google 로그인 팝업에 필요)

## 배포 후 확인할 것

- [ ] 첫 화면에서 카카오 / 네이버 / Google 로그인이 각각 되는지
- [ ] 완주 인증 후 다른 기기에서 같은 계정으로 메달이 보이는지
- [ ] 준비물 추가·삭제가 다른 기기에 이어지는지
- [ ] 코스 지점 📷에서 사진 올리기·보기·삭제
- [ ] 다른 계정으로 남의 사진을 지울 수 없는지
- [ ] 휴대폰 화면 (iPhone Safari, Android Chrome)
- [ ] 테스트 키로 기부 결제 → 메달 색 변경 → 다른 기기에서도 색 유지
- [ ] 결제창에서 취소 → "결제를 취소했어요" 안내
- [ ] 아이폰 홈 화면에 추가 → 전체 화면으로 열림, 안드로이드 설치 버튼

### 5. 토스페이먼츠 (기부 결제)
1. 토스페이먼츠 가입·가맹 계약 (사업자 정보 필요)
2. 개발자센터 → **API 개별 연동 키**에서 클라이언트 키·시크릿 키 확인 (결제위젯 키가 아님)
3. Vercel 환경변수: `TOSS_CLIENT_KEY`(공개용), `TOSS_SECRET_KEY`(서버 전용)
4. 처음에는 **테스트 키(test_ck_ / test_sk_)**로 결제 흐름을 확인 → 실제 결제는 일어나지 않음
5. 확인이 끝나면 라이브 키(live_ck_ / live_sk_)로 바꾸기

결제 흐름
- 코스 상세 "완주 성공기념 기부"(1,000~10,000원) 또는 설정 "개발자 응원"(1,000~1,000,000원)
- 서버가 주문을 먼저 기록 → 토스 결제창 → 돌아오면 서버가 금액·주문자를 맞춰 보고 토스에 승인 요청
- 승인되면 `donations/{uid}`에 기록되고 그 코스 메달에 색이 입혀짐
- 메달 색은 서버만 기록할 수 있음 (브라우저에서 바꿀 수 없게 보안 규칙으로 막음)
- 주문 기록은 Firestore `orders`에 남음 → 인증서 신청이 오면 계정 확인 코드(uid)로 `donations/{uid}`와 대조

### 6. 완주 인증서 신청 메일 (메달 현황표 자동 첨부)
1. 받는 Gmail(toyoil645@gmail.com)에서 2단계 인증을 켜고 **앱 비밀번호**를 만듦
2. Vercel 환경변수: `CERT_MAIL_USER`(보내는 Gmail 주소), `CERT_MAIL_PASS`(앱 비밀번호), `CERT_MAIL_TO`(받는 주소, 비우면 toyoil645@gmail.com)
3. 앱 설정 → 완주 인증서 신청 → [메일로 보내기]: 로그인한 사용자의 서버 기록(완주·결제 승인 색 메달)으로 서버가 현황표 CSV를 만들어 첨부해서 보냄
- 신청자 정보는 메일로만 보내고 서버에 저장하지 않음, 같은 계정은 10분에 한 번
- 메일 설정이 없거나 서버 오류면 예전 방식(파일 내려받기 + 메일 앱 열기)으로 자동 전환

## 홈 화면 앱 (PWA)
- 아이폰: 사파리 → 공유 → 홈 화면에 추가 / 안드로이드: 크롬 메뉴 → 홈 화면에 추가(앱 설치)
- 앱 안 설정 → "공유하기 · 홈 화면에 추가"에 단계별 안내가 있음
- 서비스 워커(sw.js)가 화면·그림을 저장해 두어 신호가 약해도 열림. 로그인·결제(/api/)는 저장하지 않음

## 아직 없는 것

- 결제 취소·환불 화면 — 지금은 토스페이먼츠 상점관리자에서 직접 처리
- 사진 신고·관리자 삭제 기능 — 많은 사람이 쓰면 필요합니다.
- 이용약관·개인정보처리방침 문서 — 로그인·사진 업로드를 받으려면 공개 전에 필요합니다.
- Apple 로그인 — iOS 앱으로 낼 때 필요할 수 있어요.

## 관리자(커피 맛집 등록) 지정

BEST 커피 맛집은 관리자만 등록·수정·사진 업로드할 수 있어요. 관리자는 Firebase 사용자에 `admin: true` 커스텀 클레임을 붙여 지정합니다.
1. 앱에서 관리자 계정으로 한 번 로그인 → Firebase 콘솔 Authentication에서 그 사용자의 UID 확인
2. 서비스 계정 키가 있는 PC에서 한 번 실행:
   ```js
   // set-admin.js  (node set-admin.js <UID>)
   const admin = require("firebase-admin");
   admin.initializeApp({ credential: admin.credential.cert(require("./service-account.json")) });
   admin.auth().setCustomUserClaims(process.argv[2], { admin: true }).then(() => console.log("ok"));
   ```
3. 앱에서 로그아웃 후 다시 로그인하면 코스 상세에 "커피 맛집 등록" 칸이 보입니다.
(service-account.json은 절대 GitHub에 올리지 마세요.)
