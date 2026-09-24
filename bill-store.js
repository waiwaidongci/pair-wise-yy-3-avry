// 账单存储：账单持久化到 data/bills.json，撤回只改状态不删除，旧账单保留可查
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const billsPath = join(__dirname, "data", "bills.json");

async function loadBills() {
  if (!existsSync(billsPath)) {
    await mkdir(dirname(billsPath), { recursive: true });
    await writeFile(billsPath, JSON.stringify({ bills: [] }, null, 2));
  }
  return JSON.parse(await readFile(billsPath, "utf8"));
}
async function saveBills(db) {
  await writeFile(billsPath, JSON.stringify(db, null, 2));
}

export async function listBills() {
  return (await loadBills()).bills;
}

export async function billsForSample(sampleId) {
  return (await listBills()).filter(bill => bill.sampleId === sampleId);
}

export async function activeBillFor(sampleId) {
  return (await listBills()).find(bill => bill.sampleId === sampleId && bill.status === "已结算") || null;
}

export async function createBill(snapshot) {
  const db = await loadBills();
  const bill = { id: `BILL-${Date.now()}`, status: "已结算", createdAt: new Date().toISOString(), withdrawnAt: "", ...snapshot };
  db.bills.unshift(bill);
  await saveBills(db);
  return bill;
}

// 撤回当前生效的账单：状态改为已撤回并记录时间，账单本体保留
export async function withdrawBill(sampleId) {
  const db = await loadBills();
  const bill = db.bills.find(item => item.sampleId === sampleId && item.status === "已结算");
  if (!bill) return null;
  bill.status = "已撤回";
  bill.withdrawnAt = new Date().toISOString();
  await saveBills(db);
  return bill;
}
