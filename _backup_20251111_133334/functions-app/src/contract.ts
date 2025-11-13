// functions-app/src/contract.ts
export const FN = {
  family: {
    create:        "family-create",
    joinByCode:    "family-join-by-code",
    get:           "family-get",
    shareInvite:   "family-share-invite",
    setRole:       "family-set-role",
    kickMember:    "family-kick-member"
  },
  treasury: {
    getState:      "treasury-get-state",
    requestPayout: "treasury-request-payout",
    approve:       "treasury-approve-transfer"
  },
  steps: {
    addProgress:   "steps-add-progress",
    claimReward:   "steps-claim-reward"
  },
  geo: {
    ping:          "geo-ping",
    places:        "geo-places",
    history:       "geo-history"
  },
  ownership: {
    propose:       "owner-propose",
    approve:       "owner-approve",
    transfer:      "owner-transfer"
  },
  vault: {
    deposit:       "vault-deposit",
    distribute:    "vault-distribute",
    withdraw:      "vault-withdraw",
    state:         "vault-state"
  },
  defi: {
    swapQuote:     "defi-swap-quote",
    swap:          "defi-swap",
    nftMint:       "defi-nft-mint",
    lpInfo:        "defi-lp-info"
  },
  assistant: {
    chat:          "assistant-chat",
    plan:          "assistant-plan"
  },
  discovery: {
    findFamilies:  "discovery-find-families",
    friendRequest: "discovery-friend-request"
  },
  exchange: {
    quote:         "exchange-quote",
    swap:          "exchange-swap",
    limits:        "exchange-limits"
  },
  goals: {
    create:        "goals-create",
    update:        "goals-update",
    list:          "goals-list",
    progress:      "goals-progress"
  },
  custody: {
    setRules:      "custody-set-rules",
    getRules:      "custody-get-rules"
  },
  plans: {
    get:           "plans-get",
    set:           "plans-set",
    gasState:      "plans-gas-state",
    gasSpend:      "plans-gas-spend"
  },
  referrals: {
    createLink:    "ref-create-link",
    stats:         "ref-stats",
    leaderboard:   "ref-leaderboard",
    qualifyCheck:  "ref-qualify-check"
  },
  alarm: {
    set:           "alarm-set",
    list:          "alarm-list",
    preview:       "alarm-preview",
    delete:        "alarm-delete"
  },
  gas: {
    spend:         "gas-spend",
    history:       "gas-history",
    thresholds:    "gas-thresholds"
  },
  staking: {
    pools:         "staking-pools",
    deposit:       "staking-deposit",
    withdraw:      "staking-withdraw",
    claim:         "staking-claim",
    my:            "staking-my"
  },
  chat: {
    send:          "chat-send",
    upload:        "chat-upload",
    thread:        "chat-thread",
    markRead:      "chat-mark-read"
  }
} as const;

export type FnGroups = typeof FN;
