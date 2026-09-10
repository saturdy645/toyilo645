토요일 645 - Vercel + Supabase 배포판

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
- SUPABASE_URL = Supabase Project URL
- SUPABASE_ANON_KEY = Supabase Publishable/Anon key
- ANTHROPIC_API_KEY = Anthropic API key (절대 HTML에 넣지 않음)
- ANTHROPIC_MODEL = 사용할 Anthropic 모델 ID (선택, 기본값 claude-sonnet-4-5)

환경변수 저장 후 Redeploy 해야 합니다.

4) 로그인
- 카카오 / 구글 / 애플 버튼은 Supabase OAuth를 사용합니다.
- 네이버는 Supabase 기본 provider 목록에 없으므로 별도의 Custom OAuth/OIDC 또는 Naver 전용 인증 서버 구성이 필요합니다. 현재 코드는 네이버 버튼을 누르면 설정 안내를 보여주도록 처리해야 합니다.

5) 데이터
- 로그인 사용자: user_kv에 사용자별 저장
- 공동 채팅/후기: shared_kv에 저장
- 비로그인 사용자: 브라우저 localStorage를 fallback으로 사용

6) AI
- 브라우저는 /api/ai만 호출합니다.
- Anthropic API key는 Vercel 서버 환경변수에만 보관합니다.
