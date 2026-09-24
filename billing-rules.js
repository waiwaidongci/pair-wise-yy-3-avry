// 费用规则：计费步骤单价、加急上浮比例，以及按切片步骤日志计算费用的纯函数。
export const STEP_FEES = { "取样": 50, "切割": 80, "研磨": 120, "染色": 100 };
export const BILLABLE_STEPS = Object.keys(STEP_FEES);
export const URGENT_SURCHARGE_RATE = 0.3;

const round2 = value => Math.round(value * 100) / 100;

// 单张切片：同一计费步骤无论记录多少次都只计一次，按标准工序顺序列出；观察不计费。
export function quoteSlice(slice) {
  const recorded = new Set(slice.logs.map(log => log.step));
  const steps = BILLABLE_STEPS.filter(step => recorded.has(step));
  const amount = steps.reduce((sum, step) => sum + STEP_FEES[step], 0);
  return { sliceId: slice.id, steps, amount };
}

// 整个任务（样本）的报价：各切片费用合计，加急任务在总额上多收三成。
export function quoteSample(sample) {
  const lines = sample.slices.map(quoteSlice);
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const surcharge = sample.urgent ? round2(subtotal * URGENT_SURCHARGE_RATE) : 0;
  return {
    lines,
    subtotal: round2(subtotal),
    surcharge,
    total: round2(subtotal + surcharge),
    feeSnapshot: { stepFees: { ...STEP_FEES }, urgentRate: URGENT_SURCHARGE_RATE }
  };
}

// 切片走完"观察"才算完成；存在未完成切片的任务不能结算。
export function incompleteSlices(sample) {
  return sample.slices.filter(slice => slice.status !== "观察");
}
