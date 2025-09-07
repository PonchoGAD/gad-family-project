import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { JsonRpcProvider } from "ethers";

export function getProvider() {
  const url = process.env.EXPO_PUBLIC_RPC_URL!;
  return new JsonRpcProvider(url);
}
