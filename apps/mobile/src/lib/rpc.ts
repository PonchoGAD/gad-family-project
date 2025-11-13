// apps/mobile/src/lib/rpc.ts

import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { getProvider as getEvmProvider } from "./chains";

/**
 * Backward-compatible wrapper.
 * Under the hood uses the unified EVM provider from ./chains.
 */
export function getProvider() {
  return getEvmProvider();
}
