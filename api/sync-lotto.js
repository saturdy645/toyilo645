// api/sync-lotto.js
// 토요일645 - 자동 동기화 보류
// 동행복권 서버의 접속 대기/차단 문제로 현재 비활성화
// DB 저장/수정 없음

export default async function handler(req, res) {
  return res.status(503).json({
    error: "Automatic lotto sync is temporarily disabled"
  });
}
