// 页面操作：单页应用的页面结构、样式与前端交互，包括建档登记、步骤补录/更正、结算与撤回。
export function renderPage({ statuses, steps, stepFees, urgentRate }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>岩芯样本切片实验室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#242822; --muted:#687062; --line:#d7ddd1; --accent:#526f43; --stone:#73706a; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:16px; }
    h1 { margin:0; font-size:26px; } main { display:grid; grid-template-columns:390px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; } h2 { margin:0 0 12px; font-size:18px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; }
    button[disabled] { opacity:.45; cursor:not-allowed; }
    .link { background:none; color:var(--accent); padding:0 2px; font-weight:400; }
    .check { display:flex; align-items:center; gap:8px; } .check input { width:auto; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(310px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .rush { background:#f7e8e2; border-color:#e0b8a6; color:#a34a2a; }
    .fees { margin-bottom:14px; }
    .slice { border-top:1px solid var(--line); padding-top:10px; } .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
    @media (max-width:950px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .stats{grid-template-columns:1fr 1fr;} }
  </style>
</head>
<body>
  <header><div><h1>岩芯样本切片实验室</h1><div class="meta">样本、切片任务、制片步骤、交付与结算</div></div><button id="reload">刷新</button></header>
  <main>
    <form id="form">
      <h2>创建岩芯样本</h2>
      <label>项目</label><input name="project" required>
      <label>钻孔编号</label><input name="borehole" required>
      <label>岩芯箱号</label><input name="coreBox" required>
      <label>取样深度</label><input name="depth" required>
      <label>负责人</label><input name="owner" required>
      <label>委托单位</label><input name="client" required>
      <label class="check"><input type="checkbox" name="urgent" value="1"> 加急任务（结算总额上浮三成）</label>
      <label>初始切片编号</label><input name="sliceId" required>
      <label>染色方法</label><input name="method" required>
      <button>保存样本</button>
    </form>
    <section>
      <div class="panel fees" id="fees"></div>
      <div class="stats" id="stats"></div>
      <div class="grid" id="samples"></div>
    </section>
  </main>
  <script>
    const statuses = ${JSON.stringify(statuses)};
    const steps = ${JSON.stringify(steps)};
    const stepFees = ${JSON.stringify(stepFees)};
    const urgentRate = ${JSON.stringify(urgentRate)};
    const form = document.querySelector("#form");
    const stats = document.querySelector("#stats");
    const samplesEl = document.querySelector("#samples");
    let samples = [];
    let bills = [];
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ "Content-Type":"application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    function run(promise) { promise.catch(err => alert(err.message)); }
    function money(value) { return "¥" + Number(value).toFixed(2); }
    function billBlock(sample) {
      const mine = bills.filter(bill => bill.sampleId === sample.id);
      const active = mine.find(bill => bill.status === "已结算");
      const history = mine.filter(bill => bill.status === "已撤回");
      const incomplete = sample.slices.filter(slice => slice.status !== "观察");
      let html = '<div class="slice"><b>任务结算</b>';
      if (active) {
        html += '<div class="meta">账单 '+active.id+' · 结算于 '+active.createdAt.slice(0,19).replace("T"," ")+'</div>'
          + active.lines.map(line => '<div class="meta">'+line.sliceId+'：'+(line.steps.length ? line.steps.join("、") : "无计费步骤")+' · '+money(line.amount)+'</div>').join("")
          + '<div class="meta">小计 '+money(active.subtotal)+(active.urgent ? ' · 加急上浮 '+money(active.surcharge) : '')+' · <b>应收 '+money(active.total)+'</b></div>'
          + '<button data-withdraw="'+active.id+'">撤回结算</button>';
      } else {
        html += '<div class="meta">尚未结算</div>';
      }
      if (incomplete.length) html += '<div class="meta">切片 '+incomplete.map(slice => slice.id).join("、")+' 未完成，不能结算</div>';
      html += '<button data-settle="'+sample.id+'"'+(incomplete.length ? ' disabled' : '')+'>'+(active ? "重新结算" : "结算")+'</button>';
      if (history.length) html += '<div class="meta">历史账单：'+history.map(bill => bill.id+' '+money(bill.total)+'（已撤回）').join("；")+'</div>';
      return html + '</div>';
    }
    function render() {
      document.querySelector("#fees").innerHTML = '<b>计费规则</b><div class="meta">'+steps.filter(step => stepFees[step] != null).map(step => step+' '+money(stepFees[step])).join(' · ')+' · 观察不计费 · 同一步骤重复记录只计一次 · 加急任务总额上浮 '+Math.round(urgentRate*100)+'%</div>';
      const settledTotal = bills.filter(bill => bill.status === "已结算").reduce((sum, bill) => sum + bill.total, 0);
      stats.innerHTML = statuses.map(s => '<div class="stat"><span>'+s+'</span><strong>'+samples.filter(item => item.status === s).length+'</strong></div>').join("") + '<div class="stat"><span>应收合计</span><strong>'+money(settledTotal)+'</strong></div>';
      samplesEl.innerHTML = samples.map(sample => '<article class="card"><h3>'+sample.project+'</h3><div><span class="pill">'+sample.status+'</span> '+(sample.urgent ? '<span class="pill rush">加急</span>' : '')+'</div><div class="meta">'+sample.borehole+' · '+sample.coreBox+' · '+sample.depth+' · '+sample.owner+' · 委托单位 '+sample.client+'</div><label>新增切片</label><input data-new-slice="'+sample.id+'" placeholder="切片编号"><input data-method="'+sample.id+'" placeholder="染色方法"><button data-add="'+sample.id+'">添加切片</button>'+sample.slices.map(slice => '<div class="slice"><b>'+slice.id+'</b><div class="meta">'+slice.method+' · 当前步骤 '+slice.status+'</div><select data-step="'+sample.id+'|'+slice.id+'">'+steps.map(step => '<option>'+step+'</option>').join("")+'</select><textarea data-note="'+sample.id+'|'+slice.id+'" placeholder="步骤备注或观察结果"></textarea><button data-log="'+sample.id+'|'+slice.id+'">记录步骤</button>'+slice.logs.map((log, index) => '<div class="meta">'+log.step+'：'+log.note+' <button class="link" data-dellog="'+sample.id+'|'+slice.id+'|'+index+'">删除</button></div>').join("")+'</div>').join("")+billBlock(sample)+'<button data-deliver="'+sample.id+'">标记交付</button></article>').join("");
      document.querySelectorAll("[data-step]").forEach(sel => {
        const parts = sel.dataset.step.split("|");
        const slice = samples.find(s => s.id === parts[0]).slices.find(s => s.id === parts[1]);
        sel.value = slice.status;
      });
      document.querySelectorAll("[data-add]").forEach(btn => btn.onclick = () => {
        const id = btn.dataset.add;
        run(api('/api/samples/'+id+'/slices', { method:'POST', body: JSON.stringify({ id: document.querySelector('[data-new-slice="'+id+'"]').value, method: document.querySelector('[data-method="'+id+'"]').value || "未指定" }) }).then(load));
      });
      document.querySelectorAll("[data-log]").forEach(btn => btn.onclick = () => {
        const parts = btn.dataset.log.split("|");
        run(api('/api/samples/'+parts[0]+'/slices/'+parts[1]+'/logs', { method:'POST', body: JSON.stringify({ step: document.querySelector('[data-step="'+parts[0]+'|'+parts[1]+'"]').value, note: document.querySelector('[data-note="'+parts[0]+'|'+parts[1]+'"]').value || "步骤完成" }) }).then(load));
      });
      document.querySelectorAll("[data-dellog]").forEach(btn => btn.onclick = () => {
        const parts = btn.dataset.dellog.split("|");
        run(api('/api/samples/'+parts[0]+'/slices/'+parts[1]+'/logs/'+parts[2], { method:'DELETE' }).then(load));
      });
      document.querySelectorAll("[data-settle]").forEach(btn => btn.onclick = () => run(api('/api/samples/'+btn.dataset.settle+'/settle', { method:'POST', body: JSON.stringify({}) }).then(load)));
      document.querySelectorAll("[data-withdraw]").forEach(btn => btn.onclick = () => run(api('/api/bills/'+btn.dataset.withdraw+'/withdraw', { method:'POST', body: JSON.stringify({}) }).then(load)));
      document.querySelectorAll("[data-deliver]").forEach(btn => btn.onclick = () => run(api('/api/samples/'+btn.dataset.deliver+'/deliver', { method:'POST', body: JSON.stringify({}) }).then(load)));
    }
    async function load(){
      const results = await Promise.all([api("/api/samples"), api("/api/bills")]);
      samples = results[0];
      bills = results[1];
      render();
    }
    document.querySelector("#reload").onclick = () => run(load());
    form.onsubmit = event => {
      event.preventDefault();
      run(api("/api/samples", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) }).then(() => { form.reset(); return load(); }));
    };
    run(load());
  </script>
</body>
</html>`;
}
