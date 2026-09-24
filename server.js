import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STEP_FEES, URGENT_SURCHARGE_RATE, incompleteSlices } from "./billing-rules.js";
import { ensureBills, settleSample, withdrawBill } from "./billing-store.js";
import { renderPage } from "./page.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, "data", "core-slices.json");
const port = Number(process.env.PORT || 3025);
const statuses = ["待切割", "制片中", "待观察", "已交付"];
const taskSteps = ["取样", "切割", "研磨", "染色", "观察"];

const seed = {
  samples: [
    {
      id: "CORE-001",
      project: "东岭铜矿薄片",
      borehole: "ZK-17",
      coreBox: "BX-09",
      depth: "128.4-128.8m",
      owner: "陆川",
      client: "省地质调查院",
      urgent: false,
      status: "制片中",
      delivery: "未交付",
      slices: [
        { id: "SL-001-A", method: "茜素红染色", observation: "", status: "研磨", logs: [{ at: "2026-06-12T10:00:00.000Z", step: "取样", note: "截取含矿化条带位置" }, { at: "2026-06-13T11:20:00.000Z", step: "切割", note: "完成粗切" }] }
      ]
    }
  ],
  bills: []
};

async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  ensureBills(db);
  for (const sample of db.samples) {
    if (!sample.client) sample.client = "未登记";
    sample.urgent = Boolean(sample.urgent);
  }
  return db;
}
async function saveDb(db) { await writeFile(dbPath, JSON.stringify(db, null, 2)); }
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function updateSampleStatus(sample) {
  const sliceStatuses = sample.slices.map(slice => slice.status);
  if (sliceStatuses.length && sliceStatuses.every(step => step === "观察")) sample.status = "待观察";
  if (sample.delivery === "已交付") sample.status = "已交付";
  else if (sliceStatuses.some(step => ["取样", "切割", "研磨", "染色"].includes(step))) sample.status = "制片中";
  else sample.status = "待切割";
}

const page = renderPage({ statuses, steps: taskSteps, stepFees: STEP_FEES, urgentRate: URGENT_SURCHARGE_RATE });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type":"text/html; charset=utf-8" });
      return res.end(page);
    }
    if (req.method === "GET" && url.pathname === "/api/samples") return sendJson(res, 200, db.samples);
    if (req.method === "GET" && url.pathname === "/api/bills") return sendJson(res, 200, ensureBills(db));
    if (req.method === "POST" && url.pathname === "/api/samples") {
      const input = await body(req);
      const sample = { id: `CORE-${Date.now()}`, project: input.project, borehole: input.borehole, coreBox: input.coreBox, depth: input.depth, owner: input.owner, client: (input.client || "").trim() || "未登记", urgent: input.urgent === true || input.urgent === "1" || input.urgent === "on", status: "待切割", delivery: "未交付", slices: [{ id: input.sliceId, method: input.method, observation: "", status: "取样", logs: [{ at: new Date().toISOString(), step: "取样", note: "创建初始切片任务" }] }] };
      updateSampleStatus(sample);
      db.samples.unshift(sample);
      await saveDb(db);
      return sendJson(res, 201, sample);
    }
    const addSlice = url.pathname.match(/^\/api\/samples\/([^/]+)\/slices$/);
    if (addSlice && req.method === "POST") {
      const sample = db.samples.find(item => item.id === addSlice[1]);
      if (!sample) return sendJson(res, 404, { error: "sample_not_found" });
      const input = await body(req);
      sample.slices.push({ id: input.id, method: input.method || "未指定", observation: "", status: "取样", logs: [{ at: new Date().toISOString(), step: "取样", note: "新增切片任务" }] });
      updateSampleStatus(sample);
      await saveDb(db);
      return sendJson(res, 201, sample);
    }
    const logMatch = url.pathname.match(/^\/api\/samples\/([^/]+)\/slices\/([^/]+)\/logs$/);
    if (logMatch && req.method === "POST") {
      const sample = db.samples.find(item => item.id === logMatch[1]);
      if (!sample) return sendJson(res, 404, { error: "sample_not_found" });
      const slice = sample.slices.find(item => item.id === logMatch[2]);
      if (!slice) return sendJson(res, 404, { error: "slice_not_found" });
      const input = await body(req);
      slice.status = input.step;
      if (input.step === "观察") slice.observation = input.note || slice.observation;
      slice.logs.push({ at: new Date().toISOString(), step: input.step, note: input.note || "" });
      updateSampleStatus(sample);
      await saveDb(db);
      return sendJson(res, 200, sample);
    }
    const logDelete = url.pathname.match(/^\/api\/samples\/([^/]+)\/slices\/([^/]+)\/logs\/(\d+)$/);
    if (logDelete && req.method === "DELETE") {
      const sample = db.samples.find(item => item.id === logDelete[1]);
      if (!sample) return sendJson(res, 404, { error: "sample_not_found" });
      const slice = sample.slices.find(item => item.id === logDelete[2]);
      if (!slice) return sendJson(res, 404, { error: "slice_not_found" });
      const index = Number(logDelete[3]);
      if (index >= slice.logs.length) return sendJson(res, 404, { error: "log_not_found" });
      slice.logs.splice(index, 1);
      const last = slice.logs[slice.logs.length - 1];
      slice.status = last ? last.step : "取样";
      updateSampleStatus(sample);
      await saveDb(db);
      return sendJson(res, 200, sample);
    }
    const settleMatch = url.pathname.match(/^\/api\/samples\/([^/]+)\/settle$/);
    if (settleMatch && req.method === "POST") {
      const sample = db.samples.find(item => item.id === settleMatch[1]);
      if (!sample) return sendJson(res, 404, { error: "sample_not_found" });
      const pending = incompleteSlices(sample);
      if (pending.length) return sendJson(res, 400, { error: `存在未完成切片（${pending.map(slice => slice.id).join("、")}），不能结算` });
      const result = settleSample(db, sample);
      await saveDb(db);
      return sendJson(res, 201, result);
    }
    const withdrawMatch = url.pathname.match(/^\/api\/bills\/([^/]+)\/withdraw$/);
    if (withdrawMatch && req.method === "POST") {
      const bill = withdrawBill(db, withdrawMatch[1]);
      if (!bill) return sendJson(res, 404, { error: "bill_not_found_or_already_withdrawn" });
      await saveDb(db);
      return sendJson(res, 200, bill);
    }
    const deliverMatch = url.pathname.match(/^\/api\/samples\/([^/]+)\/deliver$/);
    if (deliverMatch && req.method === "POST") {
      const sample = db.samples.find(item => item.id === deliverMatch[1]);
      if (!sample) return sendJson(res, 404, { error: "sample_not_found" });
      sample.delivery = "已交付";
      updateSampleStatus(sample);
      await saveDb(db);
      return sendJson(res, 200, sample);
    }
    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`Core slice lab app listening on http://localhost:${port}`));
