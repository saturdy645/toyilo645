// 브라우저용 Firebase 설정값. 공개용 값이지만 소스에 적지 않고 환경변수로 관리합니다.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    // 토스페이먼츠 클라이언트 키 (브라우저용 공개 키). 시크릿 키는 여기에 넣지 않음
    tossClientKey: process.env.TOSS_CLIENT_KEY || "",
  });
};
