import { getFunctions, httpsCallable } from "firebase/functions";
// Инициализация Firebase происходит в ../firebase — подключаем как сайд-эффект,
// чтобы гарантировать, что default app уже создан.
import "../firebase";

const _functions = getFunctions();

export function fn<Req = any, Res = any>(name: string) {
  return httpsCallable<Req, Res>(_functions, name);
}
