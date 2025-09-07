import { Contract, formatUnits } from "ethers";
import { getProvider } from "./rpc";

const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export function getGadToken() {
  const addr = process.env.EXPO_PUBLIC_GAD_TOKEN_ADDRESS!;
  return new Contract(addr, ABI, getProvider());
}

export async function getGadBalance(address: string) {
  const token = getGadToken();
  const [bal, dec] = await Promise.all([
    token.balanceOf(address),
    token.decimals()
  ]);
  return { raw: bal, pretty: formatUnits(bal, dec) };
}
