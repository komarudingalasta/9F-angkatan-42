
const DEFAULT_USER = { username: "admin", password: "123456" };
let rows = JSON.parse(localStorage.getItem("pakkom_rows") || "[]");
let charts = {};
let selectedStudentKey = null;

const $ = id => document.getElementById(id);
const core = ["nis","nama","kelas","semester"];

function normalizeKey(k){
  return String(k || "").trim().toLowerCase()
    .replace(/\s+/g," ")
    .replace("no. induk","nis")
    .replace("no induk","nis");
}
function normalizeRow(raw){
  const mapped={};
  Object.entries(raw).forEach(([k,v])=> mapped[normalizeKey(k)] = v);
  const get=(...keys)=> {
    for(const k of keys) if(mapped[k]!==undefined && mapped[k]!==null && mapped[k]!=="") return mapped[k];
    return "";
  };
  const result={
    nis:String(get("nis","nisn","id siswa","id")).trim(),
    nama:String(get("nama","nama siswa","siswa")).trim(),
    kelas:String(get("kelas","class")).trim(),
    semester:String(get("semester","smt","periode")).trim()
  };
  Object.entries(mapped).forEach(([k,v])=>{
    if(!["nis","nisn","id siswa","id","nama","nama siswa","siswa","kelas","class","semester","smt","periode"].includes(k)){
      const n=Number(v);
      if(v!=="" && Number.isFinite(n)) result[k]=n;
    }
  });
  return result;
}
function subjectKeys(data=rows){
  const set=new Set();
  data.forEach(r=>Object.keys(r).forEach(k=>{ if(!core.includes(k) && Number.isFinite(Number(r[k]))) set.add(k); }));
  return [...set].sort();
}
function unique(vals){ return [...new Set(vals.filter(Boolean))]; }
function avg(nums){ const v=nums.map(Number).filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; }
function rowAvg(r){ return avg(subjectKeys([r]).map(k=>r[k])); }
function studentKey(r){ return r.nis || `${r.nama}|${r.kelas}`; }
function filteredRows(){
  let d=[...rows];
  const s=$("semesterFilter").value, c=$("classFilter").value;
  if(s && s!=="ALL") d=d.filter(r=>r.semester===s);
  if(c && c!=="ALL") d=d.filter(r=>r.kelas===c);
  return d;
}
function groupedStudents(data=rows){
  const m=new Map();
  data.forEach(r=>{
    const key=studentKey(r);
    if(!m.has(key)) m.set(key,[]);
    m.get(key).push(r);
  });
  return m;
}
function destroyChart(name){ if(charts[name]) charts[name].destroy(); }
function createChart(name, canvasId, config){
  destroyChart(name);
  charts[name]=new Chart($(canvasId),config);
}
function fmt(n){ return Number(n||0).toFixed(1).replace(".0",""); }

function updateFilters(){
  const oldS=$("semesterFilter").value||"ALL", oldC=$("classFilter").value||"ALL";
  $("semesterFilter").innerHTML=`<option value="ALL">Semua Semester</option>`+unique(rows.map(r=>r.semester)).sort().map(x=>`<option>${x}</option>`).join("");
  $("classFilter").innerHTML=`<option value="ALL">Semua Kelas</option>`+unique(rows.map(r=>r.kelas)).sort().map(x=>`<option>${x}</option>`).join("");
  if([...$("semesterFilter").options].some(o=>o.value===oldS)) $("semesterFilter").value=oldS;
  if([...$("classFilter").options].some(o=>o.value===oldC)) $("classFilter").value=oldC;
}
function semesterStudentAverages(){
  const sems=unique(rows.map(r=>r.semester)).sort();
  const map=new Map();
  sems.forEach(s=>{
    const rs=rows.filter(r=>r.semester===s);
    map.set(s, avg(rs.map(rowAvg)));
  });
  return map;
}
function studentTrend(group){
  return [...group].sort((a,b)=>String(a.semester).localeCompare(String(b.semester)));
}
function latestDelta(group){
  const t=studentTrend(group);
  if(t.length<2) return 0;
  return rowAvg(t.at(-1))-rowAvg(t.at(-2));
}
function renderDashboard(){
  const d=filteredRows(), groups=groupedStudents(d);
  $("statStudents").textContent=groups.size;
  $("statAverage").textContent=fmt(avg(d.map(rowAvg)));
  let up=0,down=0;
  groupedStudents(rows).forEach(g=>{const x=latestDelta(g); if(x>=3)up++; if(x<=-3)down++;});
  $("statUp").textContent=up; $("statDown").textContent=down;

  const sm=semesterStudentAverages();
  createChart("avg","avgChart",{type:"line",data:{labels:[...sm.keys()],datasets:[{label:"Rata-rata",data:[...sm.values()],tension:.3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});

  const subs=subjectKeys(d), latestSem=$("semesterFilter").value==="ALL" ? unique(rows.map(r=>r.semester)).sort().at(-1) : $("semesterFilter").value;
  const dd=latestSem? d.filter(r=>r.semester===latestSem):d;
  createChart("sub","subjectChart",{type:"bar",data:{labels:subs,datasets:[{label:"Rata-rata",data:subs.map(s=>avg(dd.map(r=>r[s])))}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,suggestedMax:100}}}});

  const att=[];
  groupedStudents(rows).forEach(g=>{
    const delta=latestDelta(g), t=studentTrend(g), last=t.at(-1);
    if(delta<=-3) att.push({name:last.nama,kelas:last.kelas,delta});
  });
  att.sort((a,b)=>a.delta-b.delta);
  $("attentionList").innerHTML=att.length?att.slice(0,8).map(x=>`<div class="attention-item"><div><b>${x.name}</b><small>Kelas ${x.kelas}</small></div><div class="delta down">${fmt(x.delta)} poin</div></div>`).join(""):`<div class="empty-state">Belum ada siswa yang terdeteksi mengalami penurunan signifikan.</div>`;
}
function renderStudentList(){
  const q=$("studentSearch").value.toLowerCase();
  const groups=groupedStudents(rows);
  const items=[...groups.entries()].map(([key,g])=>({key,g,last:studentTrend(g).at(-1)}))
    .filter(x=>`${x.last.nama} ${x.last.nis}`.toLowerCase().includes(q))
    .sort((a,b)=>a.last.nama.localeCompare(b.last.nama));
  $("studentList").innerHTML=items.length?items.map(x=>`<div class="student-item ${x.key===selectedStudentKey?"active":""}" data-key="${encodeURIComponent(x.key)}"><b>${x.last.nama}</b><small>${x.last.nis||"-"} · Kelas ${x.last.kelas||"-"}</small></div>`).join(""):`<div class="empty-state">Data siswa belum ada.</div>`;
  document.querySelectorAll(".student-item").forEach(el=>el.onclick=()=>{selectedStudentKey=decodeURIComponent(el.dataset.key);renderStudentList();renderStudentDetail();});
}
function renderStudentDetail(){
  if(!selectedStudentKey){$("studentEmpty").classList.remove("hidden");$("studentDetail").classList.add("hidden");return;}
  const g=groupedStudents(rows).get(selectedStudentKey); if(!g)return;
  const t=studentTrend(g), last=t.at(-1), subs=subjectKeys(g);
  $("studentEmpty").classList.add("hidden");$("studentDetail").classList.remove("hidden");
  $("studentName").textContent=last.nama; $("studentMeta").textContent=`NIS ${last.nis||"-"} · Kelas ${last.kelas||"-"} · ${t.length} semester`;
  $("studentLatestAvg").textContent=fmt(rowAvg(last));
  $("studentSubjectSelect").innerHTML=`<option value="AVG">Rata-rata Semua Mapel</option>`+subs.map(s=>`<option value="${s}">${s}</option>`).join("");
  renderStudentChart();
  $("studentSubjectSelect").onchange=renderStudentChart;
}
function renderStudentChart(){
  const g=groupedStudents(rows).get(selectedStudentKey); if(!g)return;
  const t=studentTrend(g), sub=$("studentSubjectSelect").value;
  const vals=t.map(r=>sub==="AVG"?rowAvg(r):Number(r[sub]||0));
  createChart("student","studentChart",{type:"line",data:{labels:t.map(r=>r.semester),datasets:[{label:sub==="AVG"?"Rata-rata":sub,data:vals,tension:.3}]},options:{responsive:true,scales:{y:{suggestedMin:0,suggestedMax:100}}}});
  const delta=vals.length>1?vals.at(-1)-vals.at(-2):0;
  const text=vals.length<2?"Belum cukup semester untuk membaca tren.":delta>=3?`Perkembangan positif: naik ${fmt(delta)} poin dibanding semester sebelumnya.`:delta<=-3?`Perlu dipantau: turun ${fmt(Math.abs(delta))} poin dibanding semester sebelumnya.`:`Nilai relatif stabil dibanding semester sebelumnya (${delta>=0?"+":""}${fmt(delta)} poin).`;
  $("studentInsight").textContent=text;
}
function renderSubjectSelectors(){
  const subs=subjectKeys(rows);
  $("subjectSelect").innerHTML=subs.map(s=>`<option value="${s}">${s}</option>`).join("")||`<option>Belum ada mapel</option>`;
  $("subjectSelect").onchange=renderSubjectTrend;
}
function renderSubjectTrend(){
  const sub=$("subjectSelect").value, sems=unique(rows.map(r=>r.semester)).sort();
  createChart("subjectTrend","subjectTrendChart",{type:"line",data:{labels:sems,datasets:[{label:sub,data:sems.map(s=>avg(rows.filter(r=>r.semester===s).map(r=>r[sub]))),tension:.3}]},options:{responsive:true,scales:{y:{suggestedMin:0,suggestedMax:100}}}});
}
function renderDataTable(){
  const keys=["nis","nama","kelas","semester",...subjectKeys(rows)];
  $("dataTable").querySelector("thead").innerHTML=`<tr>${keys.map(k=>`<th>${k}</th>`).join("")}</tr>`;
  $("dataTable").querySelector("tbody").innerHTML=rows.map(r=>`<tr>${keys.map(k=>`<td>${r[k]??""}</td>`).join("")}</tr>`).join("");
}
function refreshAll(){
  localStorage.setItem("pakkom_rows",JSON.stringify(rows));
  updateFilters(); renderDashboard(); renderStudentList(); renderStudentDetail(); renderSubjectSelectors(); renderSubjectTrend(); renderDataTable();
}
function switchView(name){
  document.querySelectorAll(".page-view").forEach(v=>v.classList.add("hidden"));
  $(name+"View").classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  const titles={dashboard:"Dashboard",upload:"Upload Leger",students:"Analisis Siswa",subject:"Analisis Mata Pelajaran",data:"Data Nilai"};
  $("pageTitle").textContent=titles[name]||"Dashboard";
  if(name==="dashboard") renderDashboard();
}

$("loginForm").addEventListener("submit",e=>{
  e.preventDefault();
  if($("username").value===DEFAULT_USER.username && $("password").value===DEFAULT_USER.password){
    sessionStorage.setItem("pakkom_login","1"); showApp();
  }else $("loginError").textContent="Username atau password salah.";
});
function showApp(){
  $("loginView").classList.add("hidden");$("mainView").classList.remove("hidden");refreshAll();
}
$("logoutBtn").onclick=()=>{sessionStorage.removeItem("pakkom_login");location.reload();}
document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$("semesterFilter").onchange=renderDashboard;$("classFilter").onchange=renderDashboard;
$("studentSearch").oninput=renderStudentList;

$("excelFile").addEventListener("change", async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{type:"array"});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(ws,{defval:""});
    const clean=raw.map(normalizeRow).filter(r=>r.nama && r.semester);
    if(!clean.length) throw new Error("Kolom Nama dan Semester tidak ditemukan.");
    const map=new Map(rows.map(r=>[`${studentKey(r)}|${r.semester}`,r]));
    clean.forEach(r=>map.set(`${studentKey(r)}|${r.semester}`,r));
    rows=[...map.values()];
    $("uploadMessage").textContent=`Berhasil membaca ${clean.length} baris data dari ${file.name}.`;
    refreshAll();
  }catch(err){$("uploadMessage").textContent=`Gagal membaca file: ${err.message}`;}
  e.target.value="";
});
$("clearDataBtn").onclick=()=>{ if(confirm("Hapus semua data nilai yang tersimpan di browser ini?")){rows=[];selectedStudentKey=null;refreshAll();$("uploadMessage").textContent="Semua data telah dihapus.";}}
$("downloadTemplate").onclick=()=>{
  const csv="NIS,Nama,Kelas,Semester,Matematika,IPA,Bahasa Indonesia,Bahasa Inggris,IPS\n1001,Ahmad,8A,2025/2026-1,82,84,86,80,83\n1002,Bella,8A,2025/2026-1,88,90,89,87,85\n";
  const blob=new Blob([csv],{type:"text/csv"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="template-leger.csv";a.click();URL.revokeObjectURL(a.href);
};
$("exportDataBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify(rows,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="pakkom-data-nilai.json";a.click();URL.revokeObjectURL(a.href);
};

if(sessionStorage.getItem("pakkom_login")==="1") showApp();
