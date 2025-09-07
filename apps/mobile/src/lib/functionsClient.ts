import { initializeApp, getApps } from "firebase/app";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import Constants from "expo-constants";
import { FN } from "@shared/functionNames";

type AnyFn = (data?: any) => Promise<any>;

const firebaseConfig = Constants.expoConfig?.extra?.firebase as any;

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

// все функции гоняем через один регион (из конфига)
const region = (Constants.expoConfig?.extra?.functionsRegion as string) || "us-east1";
const functions = getFunctions(app, region);

// при разработке можно прилипиться к эмулятору:
if (Constants.expoConfig?.extra?.useEmulator) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

// универсальный вызов
export async function call<TReq, TRes>(name: string, data?: TReq): Promise<TRes> {
  const fn = httpsCallable(functions, name) as unknown as AnyFn;
  const res = await fn(data);
  return res.data as TRes;
}

// удобные хэлперы
export const api = {
  treasuryWithdraw: (data: any) => call(FN.TREASURY_WITHDRAW, data),
  chatSend:       (data: any) => call(FN.CHAT_SEND, data),
  chatRead:       (data: any) => call(FN.CHAT_READ, data),
  // ...добавляй по мере надобности
};
