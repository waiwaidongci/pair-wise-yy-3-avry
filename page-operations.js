// 页面操作：结算页面调用的接口——费用试算、结算、撤回
import { computeBill, settleBlocker } from "./fee-rules.js";
import { activeBillFor, billsForSample, createBill, withdrawBill } from "./bill-store.js";

// 处理 /api 下与结算相关的请求；返回 true 表示已处理
export async function handleBillingRequest(req, res, { url, db, sendJson }) {
  const findSample = id => db.samples.find(item => item.id === id);

  const billingMatch = url.pathname.match(/^\/api\/samples\/([^/]+)\/billing$/);
  if (billingMatch && req.method === "GET") {
    const sample = findSample(billingMatch[1]);
    if (!sample) { sendJson(res, 404, { error: "sample_not_found" }); return true; }
    const blocker = settleBlocker(sample);
    const activeBill = await activeBillFor(sample.id);
    const history = (await billsForSample(sample.id)).filter(bill => bill.status === "已撤回");
    sendJson(res, 200, { canSettle: !blocker && !activeBill, blocker, preview: computeBill(sample), activeBill, history });
    return true;
  }

  const settleMatch = url.pathname.match(/^\/api\/samples\/([^/]+)\/settle$/);
  if (settleMatch && req.method === "POST") {
    const sample = findSample(settleMatch[1]);
    if (!sample) { sendJson(res, 404, { error: "sample_not_found" }); return true; }
    const blocker = settleBlocker(sample);
    if (blocker) { sendJson(res, 409, { error: `${blocker}，不能结算` }); return true; }
    if (await activeBillFor(sample.id)) { sendJson(res, 409, { error: "任务已结算，请先撤回旧账单再重新结算" }); return true; }
    const bill = await createBill(computeBill(sample));
    sendJson(res, 201, bill);
    return true;
  }

  const withdrawMatch = url.pathname.match(/^\/api\/samples\/([^/]+)\/withdraw$/);
  if (withdrawMatch && req.method === "POST") {
    const sample = findSample(withdrawMatch[1]);
    if (!sample) { sendJson(res, 404, { error: "sample_not_found" }); return true; }
    const bill = await withdrawBill(sample.id);
    if (!bill) { sendJson(res, 409, { error: "没有已结算的账单可撤回" }); return true; }
    sendJson(res, 200, bill);
    return true;
  }

  return false;
}
