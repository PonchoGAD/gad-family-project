// functions/src/wallet.ts

import * as admin from "firebase-admin";
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { ethers } from "ethers";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/* -------------------------------------------------------------------------- */
/*                              CHAIN CONFIG                                   */
/* -------------------------------------------------------------------------- */

const RPC_URL =
  process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";

const GAD_TOKEN_ADDRESS =
  process.env.GAD_TOKEN_ADDRESS ||
  "0x858bab88A5b8d7f29a40380c5f2d8d0b8812FE62";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

/* -------------------------------------------------------------------------- */
/*                               TYPES                                         */
/* -------------------------------------------------------------------------- */

export type WalletTokenBalance = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  raw: string;
  formatted: string;
};

export type WalletSummary = {
  address: string;
  chainId: number;
  native: WalletTokenBalance;
  tokens: WalletTokenBalance[];
};

export type WalletActivityItem = {
  id: string;
  txHash: string;
  timestamp: number;
  type:
    | "transfer_in"
    | "transfer_out"
    | "swap"
    | "stake"
    | "unstake"
    | "nft_mint"
    | "nft_buy"
    | "nft_sell"
    | "other";
  tokenSymbol?: string;
  amount?: string;
  direction?: "in" | "out";
  counterparty?: string;
  meta?: Record<string, unknown>;
};

export type WalletActivityResponse = {
  address: string;
  items: WalletActivityItem[];
};

export type WalletNftItem = {
  contractAddress: string;
  tokenId: string;
  owner: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  collectionName?: string;
  attributes?: Record<string, unknown>[];
};

export type WalletNftResponse = {
  address: string;
  items: WalletNftItem[];
};

/* -------------------------------------------------------------------------- */
/*                         PROVIDER / ERC20 HELPERS                            */
/* -------------------------------------------------------------------------- */

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function normalizeAddress(addr: string): string {
  try {
    return ethers.getAddress(addr);
  } catch {
    return addr;
  }
}

async function getNativeBalance(
  provider: ethers.JsonRpcProvider,
  address: string
): Promise<WalletTokenBalance> {
  const chk = normalizeAddress(address);
  const raw = await provider.getBalance(chk);

  return {
    address: "native",
    symbol: "BNB",
    name: "BNB",
    decimals: 18,
    raw: raw.toString(),
    formatted: ethers.formatUnits(raw, 18),
  };
}

async function getErc20Balance(
  provider: ethers.JsonRpcProvider,
  tokenAddress: string,
  holder: string
): Promise<WalletTokenBalance> {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  const [raw, decimals, symbol, name] = await Promise.all([
    contract.balanceOf(holder),
    contract.decimals(),
    contract.symbol(),
    contract.name(),
  ]);

  return {
    address: normalizeAddress(tokenAddress),
    symbol,
    name,
    decimals,
    raw: raw.toString(),
    formatted: ethers.formatUnits(raw, decimals),
  };
}

/* -------------------------------------------------------------------------- */
/*                         CALLABLE: walletGetSummary                         */
/* -------------------------------------------------------------------------- */

export const walletGetSummary = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<{ address: string }>
  ): Promise<WalletSummary> => {
    const address = request.data?.address;

    if (!address) {
      throw new HttpsError("invalid-argument", "address is required");
    }

    const provider = getProvider();
    const checksummed = normalizeAddress(address);

    const network = await provider.getNetwork();
    const chainId = Number(network.chainId.toString());

    const [native, gad] = await Promise.all([
      getNativeBalance(provider, checksummed),
      getErc20Balance(provider, GAD_TOKEN_ADDRESS, checksummed),
    ]);

    return {
      address: checksummed,
      chainId,
      native,
      tokens: [gad],
    };
  }
);

/* -------------------------------------------------------------------------- */
/*                         CALLABLE: walletGetActivity                        */
/* -------------------------------------------------------------------------- */

export const walletGetActivity = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<{ address: string }>
  ): Promise<WalletActivityResponse> => {
    const address = request.data?.address;

    if (!address) {
      throw new HttpsError("invalid-argument", "address is required");
    }

    const checksummed = normalizeAddress(address);

    // Заглушка, позже добавим реальные события
    const items: WalletActivityItem[] = [];

    return {
      address: checksummed,
      items,
    };
  }
);

/* -------------------------------------------------------------------------- */
/*                           CALLABLE: walletGetNfts                          */
/* -------------------------------------------------------------------------- */

export const walletGetNfts = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<{ address: string }>
  ): Promise<WalletNftResponse> => {
    const address = request.data?.address;

    if (!address) {
      throw new HttpsError("invalid-argument", "address is required");
    }

    const checksummed = normalizeAddress(address);

    // Заглушка
    const items: WalletNftItem[] = [];

    return {
      address: checksummed,
      items,
    };
  }
);
