// apps/mobile/src/lib/gadToken.ts
import { ethers } from "ethers";
import { ADDR, getProvider } from "./chains";

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export async function getGadBalance(address: `0x${string}`) {
  const provider = getProvider();
  const token = new ethers.Contract(ADDR.GAD, erc20Abi, provider);

  const [raw, decimals, symbol] = await Promise.all([
    token.balanceOf(address) as Promise<bigint>,
    token.decimals() as Promise<number>,
    token.symbol() as Promise<string>,
  ]);

  const pretty = ethers.formatUnits(raw, decimals);
  return { raw, decimals, symbol, pretty };
}
