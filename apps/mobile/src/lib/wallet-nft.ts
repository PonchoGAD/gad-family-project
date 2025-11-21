// apps/mobile/src/lib/wallet-nft.ts

import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

/* ============================================================================
   TYPES
   ========================================================================== */

export type WalletNftItem = {
  contractAddress: string;
  tokenId: string;
  owner: string;

  name?: string;
  description?: string;
  imageUrl?: string;

  collectionName?: string;
  attributes?: Record<string, unknown>[];

  // service fields
  fetchedFrom?: "backend" | "chain" | "mixed";
};

export type WalletNftCollection = {
  name: string;
  contractAddress: string;
  items: WalletNftItem[];
};

/* ============================================================================
   PUBLIC API
   ========================================================================== */

/**
 * Единственная точка входа — загрузка всех NFT пользователя.
 * Внутри:
 *  - запрос к Cloud Functions: walletGetNfts (backend)
 *  - запрос к цепочке (BSC) — опционально
 *  - merge и форматирование
 */
export async function loadUserNFTs(
  address: string
): Promise<WalletNftItem[]> {
  const trimmed = address.trim();
  if (!trimmed) return [];

  // 1) Backend: твой marketplace API из Cloud Functions
  const fromBackend = await fetchNFTsFromBackend(trimmed);

  // 2) Chain (опционально — включается при необходимости)
  const fromChain = await fetchNFTsFromChain(trimmed);

  // 3) Мержим без дублей
  const map = new Map<string, WalletNftItem>();

  [...fromBackend, ...fromChain].forEach((nft) => {
    const key = `${nft.contractAddress}-${nft.tokenId}`;
    if (!map.has(key)) map.set(key, nft);
  });

  // 4) Преобразуем в UI-friendly формат
  const formatted = Array.from(map.values()).map((n) =>
    prepareDisplayNFT(n)
  );

  return formatted;
}

/* ============================================================================
   BACKEND SOURCE (gad-family.com marketplace)
   ========================================================================== */

/**
 * Cloud Function: walletGetNfts
 *
 * На сервере сейчас заглушка → но код полностью готов.
 */
export async function fetchNFTsFromBackend(
  address: string
): Promise<WalletNftItem[]> {
  try {
    const fn = httpsCallable<{ address: string }, { items: WalletNftItem[] }>(
      functions,
      "walletGetNfts"
    );

    const res = await fn({ address });
    const items = res.data?.items ?? [];

    return items.map((i) => ({
      ...i,
      fetchedFrom: "backend",
    }));
  } catch (e) {
    console.warn("[wallet-nft] backend failed:", e);
    return [];
  }
}

/* ============================================================================
   CHAIN SOURCE (optional)
   ========================================================================== */

/**
 * Здесь можно подключить:
 *  - Moralis NFT API
 *  - Covalent
 *  - custom indexer
 *  - прямое чтение ownerOf(tokenId)
 *
 * Сейчас — заглушка.
 */
export async function fetchNFTsFromChain(
  address: string
): Promise<WalletNftItem[]> {
  // TODO: подключить реальный индексер или web3-сканер
  const _addr = address;
  return [];
}

/* ============================================================================
   METADATA FETCHER
   ========================================================================== */

/**
 * Достать metadata для конкретного токена из backend или IPFS.
 *
 * Используем позже:
 *  - экран NFTDetailScreen
 *  - при рендере галереи, если нужно подгружать дополнительные поля
 */
export async function loadNFTMetadata(
  contractAddress: string,
  tokenId: string
): Promise<Partial<WalletNftItem>> {
  try {
    // Пример: запрос к твоему API
    const url = `https://gad-family.com/api/metadata?contract=${contractAddress}&tokenId=${tokenId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Metadata error");

    const meta = await res.json();
    return {
      name: meta.name,
      description: meta.description,
      imageUrl: meta.image,
      attributes: meta.attributes ?? [],
    };
  } catch (e) {
    console.warn("[wallet-nft] metadata load failed:", e);
    return {};
  }
}

/* ============================================================================
   FORMAT UI
   ========================================================================== */

/**
 * Готовим NFT для отображения:
 *  - fallback name
 *  - placeholder image
 *  - человекочитаемые значения
 */
export function prepareDisplayNFT(
  nft: WalletNftItem
): WalletNftItem {
  const name =
    nft.name ??
    `${nft.collectionName ?? "NFT"} #${nft.tokenId}`;

  const imageUrl =
    nft.imageUrl ??
    "https://gad-family.com/assets/nft-placeholder.png";

  return {
    ...nft,
    name,
    imageUrl,
  };
}

/* ============================================================================
   GROUP BY COLLECTION (опционально)
   ========================================================================== */

export function groupByCollection(
  items: WalletNftItem[]
): WalletNftCollection[] {
  const map = new Map<string, WalletNftCollection>();

  for (const item of items) {
    const key = item.collectionName ?? item.contractAddress;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        name: item.collectionName ?? "NFT Collection",
        contractAddress: item.contractAddress,
        items: [item],
      });
    } else {
      existing.items.push(item);
    }
  }

  return Array.from(map.values());
}
