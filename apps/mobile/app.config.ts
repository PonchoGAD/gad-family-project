// apps/mobile/app.config.ts
import 'dotenv/config';

export default {
  name: "GAD Family",
  slug: "gad-family-app",
  scheme: "gadfamily",
  plugins: [
    "expo-notifications",
    "expo-secure-store",
    [
      "expo-build-properties",
      {
        ios: { useFrameworks: "static" }
      }
    ]
  ],
  extra: {
    USE_EMULATOR: process.env.USE_EMULATOR ?? "false",
    FUNCTIONS_REGION: process.env.FUNCTIONS_REGION ?? "us-east4",
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  }
};
