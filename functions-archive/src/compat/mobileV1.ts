// src/compat/mobileV1.ts
// ⚠️ Полная замена файла

// Ничего не объявляем локально, только реэкспорт под старыми именами.
// Так мы избегаем конфликтов типов и дублирования сигнатур.

export {
  createFamilyCallable        as families_create,
  joinFamilyByCodeCallable    as families_joinByCode,
  getFamilySummaryCallable    as families_getSummary,
  shareInviteLinkCallable     as families_shareInviteLink,
} from "../modules/family.js";

export {
  depositToVaultCallable      as vault_deposit,
  withdrawFromVaultCallable   as vault_withdraw,
  getVaultHistoryCallable     as vault_history,
} from "../modules/vault.js";

export {
  createGoalCallable          as goals_create,
  updateGoalCallable          as goals_update,
  completeGoalCallable        as goals_complete,
  listGoalsCallable           as goals_list,
} from "../modules/goals.js";

export {
  exchangeQuoteCallable       as exchange_quote,
  exchangeSwapCallable        as exchange_swap,
} from "../modules/exchange.js";

export {
  stepsAddCallable            as steps_add,
} from "../modules/steps.js";

export {
  planGetCallable             as plans_get,
  gasSpendCallable            as gas_spend,
  gasGetBalanceCallable       as gas_balance,
} from "../modules/plans.js";

export {
  stakingListPoolsCallable    as staking_listPools,
  stakingDepositCallable      as staking_deposit,
  stakingWithdrawCallable     as staking_withdraw,
  stakingClaimRewardsCallable as staking_claimRewards,
} from "../modules/staking.js";

export {
  chatCreateRoomCallable      as chat_createRoom,
  chatSendMessageCallable     as chat_sendMessage,
  chatFetchMessagesCallable   as chat_fetchMessages,
} from "../modules/chat.js";

export {
  referralsCreateLinkCallable as referrals_createLink,
  referralsActivateCallable   as referrals_activate,
  referralsDashboardCallable  as referrals_dashboard,
} from "../modules/referrals.js";

export {
  alarmUpsertCallable         as alarm_upsert,
  alarmPreviewCallable        as alarm_preview,
} from "../modules/alarm.js";

export {
  custodySetRulesCallable     as custody_setRules,
  custodyApproveTxCallable    as custody_approveTx,
} from "../modules/custody.js";
