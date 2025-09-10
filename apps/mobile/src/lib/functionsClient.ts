import { getApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import Constants from "expo-constants";
import { FN } from "./functions.contract";

const app = getApp();
const functions = getFunctions(app, "us-east1"); // одна базовая региональная точка

// Эмулятор по .env(.development)
const useEmu = String(Constants.expoConfig?.extra?.USE_EMULATOR ?? process.env.USE_EMULATOR) === "1";
if (useEmu) connectFunctionsEmulator(functions, "127.0.0.1", 5001);

// хелпер, чтобы всегда .data возвращать
const call = <I, O>(name: string) =>
  (payload: I) => httpsCallable<I, O>(functions, name)(payload).then(r => r.data);

// Группы вызовов (минимальный, но полный мост)
export const api = {
  family: {
    create:        call(FN.family.create),
    joinByCode:    call(FN.family.joinByCode),
    get:           call(FN.family.get),
    shareInvite:   call(FN.family.shareInvite),
    setRole:       call(FN.family.setRole),
    kickMember:    call(FN.family.kickMember),
  },
  treasury: {
    getState:      call(FN.treasury.getState),
    requestPayout: call(FN.treasury.requestPayout),
    approve:       call(FN.treasury.approve),
  },
  steps: {
    addProgress:   call(FN.steps.addProgress),
    claimReward:   call(FN.steps.claimReward),
  },
  geo: {
    ping:          call(FN.geo.ping),
    places:        call(FN.geo.places),
    history:       call(FN.geo.history),
  },
  ownership: {
    propose:       call(FN.ownership.propose),
    approve:       call(FN.ownership.approve),
    transfer:      call(FN.ownership.transfer),
  },
  vault: {
    deposit:       call(FN.vault.deposit),
    distribute:    call(FN.vault.distribute),
    withdraw:      call(FN.vault.withdraw),
    state:         call(FN.vault.state),
  },
  defi: {
    swapQuote:     call(FN.defi.swapQuote),
    swap:          call(FN.defi.swap),
    nftMint:       call(FN.defi.nftMint),
    lpInfo:        call(FN.defi.lpInfo),
  },
  assistant: {
    chat:          call(FN.assistant.chat),
    plan:          call(FN.assistant.plan),
  },
  discovery: {
    findFamilies:  call(FN.discovery.findFamilies),
    friendRequest: call(FN.discovery.friendRequest),
  },
  exchange: {
    quote:         call(FN.exchange.quote),
    swap:          call(FN.exchange.swap),
    limits:        call(FN.exchange.limits),
  },
  goals: {
    create:        call(FN.goals.create),
    update:        call(FN.goals.update),
    list:          call(FN.goals.list),
    progress:      call(FN.goals.progress),
  },
  custody: {
    setRules:      call(FN.custody.setRules),
    getRules:      call(FN.custody.getRules),
  },
  plans: {
    get:           call(FN.plans.get),
    set:           call(FN.plans.set),
    gasState:      call(FN.plans.gasState),
    gasSpend:      call(FN.plans.gasSpend),
  },
  referrals: {
    createLink:    call(FN.referrals.createLink),
    stats:         call(FN.referrals.stats),
    leaderboard:   call(FN.referrals.leaderboard),
    qualifyCheck:  call(FN.referrals.qualifyCheck),
  },
  alarm: {
    set:           call(FN.alarm.set),
    list:          call(FN.alarm.list),
    preview:       call(FN.alarm.preview),
    delete:        call(FN.alarm.delete),
  },
  gas: {
    spend:         call(FN.gas.spend),
    history:       call(FN.gas.history),
    thresholds:    call(FN.gas.thresholds),
  },
  staking: {
    pools:         call(FN.staking.pools),
    deposit:       call(FN.staking.deposit),
    withdraw:      call(FN.staking.withdraw),
    claim:         call(FN.staking.claim),
    my:            call(FN.staking.my),
  },
  chat: {
    send:          call(FN.chat.send),
    upload:        call(FN.chat.upload),
    thread:        call(FN.chat.thread),
    markRead:      call(FN.chat.markRead),
  }
};
