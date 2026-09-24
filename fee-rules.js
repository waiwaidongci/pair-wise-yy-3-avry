// 费用规则：切片步骤单价、加急上浮比例与账单试算
export const STEP_FEES = { 取样: 80, 切割: 120, 研磨: 150, 染色: 200 };
export const URGENT_SURCHARGE_RATE = 0.3;
export const FINAL_STEP = "观察";

const round2 = value => Math.round(value * 100) / 100;

// 每张切片按已记录的计费步骤计价，同一步骤重复记录只收一次
export function billableItems(slice) {
  const seen = new Set();
  const items = [];
  for (const log of slice.logs || []) {
    if (!STEP_FEES[log.step] || seen.has(log.step)) continue;
    seen.add(log.step);
    items.push({ step: log.step, fee: STEP_FEES[log.step] });
  }
  return items;
}

export function isSliceComplete(slice) {
  return slice.status === FINAL_STEP;
}

// 返回不能结算的原因，空字符串表示可以结算
export function settleBlocker(sample) {
  if (!sample.slices.length) return "样本还没有切片";
  const unfinished = sample.slices.filter(slice => !isSliceComplete(slice)).map(slice => slice.id);
  if (unfinished.length) return `切片未完成：${unfinished.join("、")}`;
  return "";
}

// 按当前步骤记录重新计算账单；加急任务在总额上多收三成
export function computeBill(sample, at = new Date().toISOString()) {
  const slices = sample.slices.map(slice => {
    const items = billableItems(slice);
    return { sliceId: slice.id, items, subtotal: round2(items.reduce((sum, item) => sum + item.fee, 0)) };
  });
  const subtotal = round2(slices.reduce((sum, item) => sum + item.subtotal, 0));
  const urgent = Boolean(sample.urgent);
  const surcharge = urgent ? round2(subtotal * URGENT_SURCHARGE_RATE) : 0;
  return {
    sampleId: sample.id,
    project: sample.project,
    client: sample.client || "未登记",
    urgent,
    slices,
    subtotal,
    surchargeRate: urgent ? URGENT_SURCHARGE_RATE : 0,
    surcharge,
    total: round2(subtotal + surcharge),
    calculatedAt: at
  };
}
