// functions-app/src/compat/mobileV1.ts
import { onCall } from "firebase-functions/v2/https";
import { CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { CALLABLE_OPTS } from "../config.js";

// Импортируем реализации из модулей
import { createFamilyCallable, joinFamilyByCodeCallable, getFamilySummaryCallable, shareInviteLinkCallable } from "../modules/family.js";
import { depositToVaultCallable, withdrawFromVaultCallable, getVaultHistoryCallable } from "../modules/vault.js";
import { createGoalCallable, updateGoalCallable, completeGoalCallable, listGoalsCallable } from "../modules/goals.js";
import { exchangeQuoteCallable, exchangeSwapCallable } from "../modules/exchange.js";
import { stepsAddCallable } from "../modules/steps.js";
import { planGetCallable, gasSpendCallable, gasGetBalanceCallable } from "../modules/plans.js";
import { stakingListPoolsCallable, stakingDepositCallable, stakingWithdrawCallable, stakingClaimRewardsCallable } from "../modules/staking.js";
import { chatSendMessageCallable, chatFetchMessagesCallable, chatCreateRoomCallable } from "../modules/chat.js";
import { referralsCreateLinkCallable, referralsActivateCallable, referralsDashboardCallable } from "../modules/referrals.js";
import { alarmUpsertCallable, alarmPreviewCallable } from "../modules/alarm.js";
import { custodySetRulesCallable, custodyApproveTxCallable } from "../modules/custody.js";

// ─────────────────────────────────────────────────────────────────────────────
// ПОМОЩНИК: обёртка, чтобы одинаково ловить ошибки и отдавать {ok, data|error}
function wrap<TReq = any, TRes = any>(
  impl: (req: CallableRequest<TReq>) => Promise<TRes>
) {
  return onCall<TReq, { ok: true; data: TRes } | { ok: false; error: string }>(CALLABLE_OPTS, async (req) => {
    try {
      const data = await impl(req);
      return { ok: true, data };
    } catch (e: any) {
      console.error("mobileV1 alias error:", e);
      return { ok: false, error: e?.message ?? "Internal error" };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ALIASES ДЛЯ MOBILЕ V1 (НЕ МЕНЯЕМ МОБИЛКУ)

export const families_create           = wrap(createFamilyCallable);
export const families_joinByCode       = wrap(joinFamilyByCodeCallable);
export const families_getSummary       = wrap(getFamilySummaryCallable);
export const families_shareInviteLink  = wrap(shareInviteLinkCallable);

export const vault_deposit             = wrap(depositToVaultCallable);
export const vault_withdraw            = wrap(withdrawFromVaultCallable);
export const vault_history             = wrap(getVaultHistoryCallable);

export const goals_create              = wrap(createGoalCallable);
export const goals_update              = wrap(updateGoalCallable);
export const goals_complete            = wrap(completeGoalCallable);
export const goals_list                = wrap(listGoalsCallable);

export const exchange_quote            = wrap(exchangeQuoteCallable);
export const exchange_swap             = wrap(exchangeSwapCallable);

export const steps_add                 = wrap(stepsAddCallable);

export const plans_get                 = wrap(planGetCallable);
export const gas_spend                 = wrap(gasSpendCallable);
export const gas_balance               = wrap(gasGetBalanceCallable);

export const staking_listPools         = wrap(stakingListPoolsCallable);
export const staking_deposit           = wrap(stakingDepositCallable);
export const staking_withdraw          = wrap(stakingWithdrawCallable);
export const staking_claimRewards      = wrap(stakingClaimRewardsCallable);

export const chat_createRoom           = wrap(chatCreateRoomCallable);
export const chat_sendMessage          = wrap(chatSendMessageCallable);
export const chat_fetchMessages        = wrap(chatFetchMessagesCallable);

export const referrals_createLink      = wrap(referralsCreateLinkCallable);
export const referrals_activate        = wrap(referralsActivateCallable);
export const referrals_dashboard       = wrap(referralsDashboardCallable);

export const alarm_upsert              = wrap(alarmUpsertCallable);
export const alarm_preview             = wrap(alarmPreviewCallable);

export const custody_setRules          = wrap(custodySetRulesCallable);
export const custody_approveTx         = wrap(custodyApproveTxCallable);
