import "dotenv/config";

export default {
  expo: {
    name: "GAD Family",
    slug: "gad-family",
    scheme: "gad",
    extra: {
      useEmulator: process.env.USE_EMULATOR === "1",
      functionsRegion: process.env.FUNCTIONS_REGION || "us-east1",
      firebase: {
        apiKey: process.env.FB_API_KEY,
        authDomain: process.env.FB_AUTH_DOMAIN,
        projectId: process.env.FB_PROJECT_ID,
        storageBucket: process.env.FB_STORAGE_BUCKET,
        messagingSenderId: process.env.FB_MSG_SENDER_ID,
        appId: process.env.FB_APP_ID
      }
    }
  }
};
