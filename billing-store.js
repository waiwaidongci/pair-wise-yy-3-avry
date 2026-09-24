// 账单存储：账单的生成、撤回与查询。旧账单永久留档，只改状态不删除。
import { quoteSample } from "./billing-rules.js";

export const BILL_SETTLED = "已结算";
export const BILL_WITHDRAWN = "已撤回";

export function ensureBills(db) {
  if (!Array.isArray(db.bills)) db.bills = [];
  return db.bills;
}

export function billsForSample(db, sampleId) {
  return ensureBills(db).filter(bill => bill.sampleId === sampleId);
}

export function activeBillFor(db, sampleId) {
  return billsForSample(db, sampleId).find(bill => bill.status === BILL_SETTLED) || null;
}

export function findBill(db, billId) {
  return ensureBills(db).find(bill => bill.id === billId) || null;
}

// 撤回：已结算账单改为已撤回并记下撤回时间，账单本身保留。
export function withdrawBill(db, billId, at = new Date().toISOString()) {
  const bill = findBill(db, billId);
  if (!bill || bill.status !== BILL_SETTLED) return null;
  bill.status = BILL_WITHDRAWN;
  bill.withdrawnAt = at;
  return bill;
}

// 结算：任务若已结算，先把旧账单撤回留档，再按当前步骤记录重新计算生成新账单。
export function settleSample(db, sample) {
  const now = new Date().toISOString();
  const previous = activeBillFor(db, sample.id);
  if (previous) withdrawBill(db, previous.id, now);
  const bill = {
    id: `BILL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    sampleId: sample.id,
    project: sample.project,
    client: sample.client,
    urgent: Boolean(sample.urgent),
    ...quoteSample(sample),
    status: BILL_SETTLED,
    createdAt: now,
    withdrawnAt: null
  };
  ensureBills(db).unshift(bill);
  return { bill, withdrawn: previous };
}
