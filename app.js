
const $=id=>document.getElementById(id);
let rows=JSON.parse(localStorage.getItem("pakkom_repo_rows")||"[]");
let subjects=JSON.parse(localStorage.getItem("pakkom_repo_subjects")||"[]");
let pending=[];
let charts={};
let selected=null;

function login(){
  if($("user").value==="admin" && $("pass").value==="123456"){
    sessionStorage.pakkomRepo="1"; showApp();
  } else $("loginError").innerText="Username atau password salah.";
}
function logout(){sessionStorage.removeItem("pakkomRepo");location.reload();}
function showApp(){$("login").classList.add("hidden");$("app").classList.remove("hidden");renderAll();}
if(sessionStorage.pakkomRepo==="1")showApp();

document.querySelectorAll(".nav").forEach(btn=>btn.onclick=()=>showPage(btn.dataset.page));
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $(page+"Page").classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  const meta={dashboard:["Dashboard","Ringkasan perkembangan akademik"],upload:["Upload Leger","Import dan validasi data nilai"],data:["Data Nilai","Data akademik tersimpan"],students:["Perkembangan Siswa","Student Journey dan Growth Index"],subjects:["Analisis Mapel","Tren nilai per mata pelajaran"],settings:["Mata Pelajaran","Atur nama dan singkatan mapel"]};
  $("title").innerText=meta[page][0];$("subtitle").innerText=meta[page][1];
  if(page==="students")renderStudents(); if(page==="subjects")renderSubjects(); if(page==="settings")renderSettings(); if(page==="data")renderTable();
}
const uniq=a=>[...new Set(a.filter(Boolean))];
const avg=a=>{a=a.map(Number).filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0};
const fmt=n=>Number(n||0).toFixed(1).replace(".0","");
function key(r){return r.nis||r.nama+"|"+r.kelas}
function subjectKeys(data=rows){
  const set=new Set;
  data.forEach(r=>Object.keys(r).forEach(k=>{if(!["nis","nama","kelas","semester"].includes(k)&&Number.isFinite(Number(r[k])))set.add(k)}));
  return [...set].filter(k=>subjects.find(x=>x.key===k)?.active!==false).sort();
}
function label(k){return subjects.find(x=>x.key===k)?.name||k.replace(/\b\w/g,c=>c.toUpperCase())}
function ravg(r){return avg(subjectKeys([r]).map(k=>r[k])}
function groups(data=rows){const m=new Map;data.forEach(r=>{const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)});return m}
function trend(g){return [...g].sort((a,b)=>String(a.semester).localeCompare(String(b.semester)))}
function delta(g){const t=trend(g);return t.length<2?0:ravg(t.at(-1))-ravg(t.at(-2))}
function status(g){const t=trend(g),d=delta(g);if(t.length>=3&&ravg(t.at(-2))<ravg(t.at(-3))-2&&ravg(t.at(-1))<ravg(t.at(-2))-2)return["🔴","Perhatian"];if(d>=3)return["🟢","Meningkat"];if(d<=-3)return["🟡","Dipantau"];return["🔵","Stabil"]}
function chart(name,id,cfg){if(charts[name])charts[name].destroy();charts[name]=new Chart($(id),cfg)}
function filtered(){let d=[...rows],s=$("semesterFilter").value,c=$("classFilter").value;if(s&&s!=="ALL")d=d.filter(r=>r.semester===s);if(c&&c!=="ALL")d=d.filter(r=>r.kelas===c);return d}

function initSubjects(){
  subjectKeys(rows).forEach(k=>{if(!subjects.some(x=>x.key===k))subjects.push({key:k,name:k.replace(/\b\w/g,c=>c.toUpperCase()),short:k,active:true})});
  localStorage.setItem("pakkom_repo_subjects",JSON.stringify(subjects));
}
function updateFilters(){
  const os=$("semesterFilter").value||"ALL",oc=$("classFilter").value||"ALL";
  $("semesterFilter").innerHTML='<option value="ALL">Semua Semester</option>'+uniq(rows.map(r=>r.semester)).sort().map(x=>`<option>${x}</option>`).join("");
  $("classFilter").innerHTML='<option value="ALL">Semua Kelas</option>'+uniq(rows.map(r=>r.kelas)).sort().map(x=>`<option>${x}</option>`).join("");
  if([...$("semesterFilter").options].some(x=>x.value===os))$("semesterFilter").value=os;if([...$("classFilter").options].some(x=>x.value===oc))$("classFilter").value=oc;
  $("semesterFilter").onchange=renderDashboard;$("classFilter").onchange=renderDashboard;
}
function renderAll(){initSubjects();updateFilters();renderDashboard();renderStudents();renderSubjects();renderSettings();renderTable()}
function renderDashboard(){
  const d=filtered(),g=groups(rows),gf=groups(d);
  $("totalStudents").innerText=gf.size;$("averageScore").innerText=fmt(avg(d.map(ravg)));
  let up=0,w=0,a=0;g.forEach(x=>{let s=status(x)[1];if(s==="Meningkat")up++;if(s==="Dipantau")w++;if(s==="Perhatian")a++});let n=g.size||1;
  $("upStudents").innerText=Math.round(up/n*100)+"%";$("upCount").innerText=up+" siswa";
  $("watchStudents").innerText=Math.round(w/n*100)+"%";$("watchCount").innerText=w+" siswa";
  $("alertStudents").innerText=Math.round(a/n*100)+"%";$("alertCount").innerText=a+" siswa";
  const sems=uniq(rows.map(r=>r.semester)).sort();
  chart("trend","trendChart",{type:"line",data:{labels:sems,datasets:[{label:"Rata-rata",data:sems.map(s=>avg(rows.filter(r=>r.semester===s).map(ravg))),tension:.3,fill:true}]},options:{plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});
  const ss=subjectKeys(rows),latest=sems.at(-1),prev=sems.at(-2);
  const ch=ss.map(s=>({s,d:prev?avg(rows.filter(r=>r.semester===latest).map(r=>r[s]))-avg(rows.filter(r=>r.semester===prev).map(r=>r[s])):0}));
  $("bestSubjects").innerHTML=[...ch].sort((a,b)=>b.d-a.d).slice(0,5).map(x=>`<div class="metric"><div><b>${label(x.s)}</b></div><div class="${x.d>=0?"up":"down"}">${x.d>=0?"+":""}${fmt(x.d)}</div></div>`).join("");
  $("weakSubjects").innerHTML=[...ch].sort((a,b)=>a.d-b.d).slice(0,5).map(x=>`<div class="metric"><div><b>${label(x.s)}</b></div><div class="${x.d>=0?"up":"down"}">${x.d>=0?"+":""}${fmt(x.d)}</div></div>`).join("");
  let growth=[];g.forEach((x,k)=>{let t=trend(x);if(t.length>1)growth.push({k,n:t.at(-1).nama,c:t.at(-1).kelas,v:ravg(t.at(-1))-ravg(t[0])})});growth.sort((a,b)=>b.v-a.v);
  $("improvedStudents").innerHTML=growth.slice(0,5).map((x,i)=>`<div class="rank-row"><div><b>${i+1}. ${x.n}</b><small>Kelas ${x.c}</small></div><div class="${x.v>=0?"up":"down"}">${x.v>=0?"+":""}${fmt(x.v)}</div></div>`).join("");
  renderPulse();
}
function renderPulse(){
  let arr=[];groups(filtered()).forEach((g,k)=>{let t=trend(g),l=t.at(-1),s=status(g);arr.push({k,l,s,d:delta(g),a:ravg(l)})});arr.sort((a,b)=>a.l.nama.localeCompare(b.l.nama));
  $("pulseGrid").innerHTML=arr.map(x=>`<div class="pulse-card" data-key="${encodeURIComponent(x.k)}"><h4>${x.s[0]} ${x.l.nama}</h4><small>${x.l.kelas||"-"} · ${x.l.nis||"-"}</small><b>${fmt(x.a)}</b><span class="${x.d>=0?"up":"down"}">${x.d>=0?"+":""}${fmt(x.d)}</span></div>`).join("")||'<div class="empty">Upload leger untuk memulai.</div>';
  document.querySelectorAll(".pulse-card").forEach(el=>el.onclick=()=>{selected=decodeURIComponent(el.dataset.key);showPage("students");renderStudents();renderStudentProfile()});
}
$("studentSearch").oninput=renderStudents;
function renderStudents(){
  const q=($("studentSearch").value||"").toLowerCase(),arr=[];groups(rows).forEach((g,k)=>{let l=trend(g).at(-1);if((l.nama+" "+l.nis).toLowerCase().includes(q))arr.push({k,l})});arr.sort((a,b)=>a.l.nama.localeCompare(b.l.nama));
  $("studentList").innerHTML=arr.map(x=>`<div class="student-item" data-key="${encodeURIComponent(x.k)}"><b>${x.l.nama}</b><small>${x.l.nis||"-"} · ${x.l.kelas||"-"}</small></div>`).join("");
  document.querySelectorAll(".student-item").forEach(el=>el.onclick=()=>{selected=decodeURIComponent(el.dataset.key);renderStudentProfile()});
}
function renderStudentProfile(){
  if(!selected)return;let g=groups(rows).get(selected),t=trend(g),l=t.at(-1),p=t.at(-2),growth=t.length>1?ravg(l)-ravg(t[0]):0,ss=subjectKeys(g);
  let ranked=ss.map(s=>({s,v:Number(l[s])})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>b.v-a.v),best=["",-1];ss.forEach(s=>t.forEach(r=>{let v=Number(r[s]);if(Number.isFinite(v)&&v>best[1])best=[s,v]}));
  $("studentProfile").innerHTML=`<div class="profile"><div class="profile-left"><div class="avatar">${l.nama[0]}</div><div><h3>${l.nama}</h3><p>${l.kelas||"-"} • NIS ${l.nis||"-"}</p></div></div><div class="growth"><small>Growth Index</small><b>${growth>=0?"+":""}${fmt(growth)}</b></div></div><div class="mini-grid"><div><span>Rata-rata terakhir</span><b>${fmt(ravg(l))}</b></div><div><span>Sebelumnya</span><b>${p?fmt(ravg(p)):"-"}</b></div><div><span>Perubahan</span><b>${p?((ravg(l)-ravg(p)>=0?"+":"")+fmt(ravg(l)-ravg(p))):"-"}</b></div><div><span>Personal Best</span><b>${best[1]>=0?label(best[0])+" "+fmt(best[1]):"-"}</b></div></div>`;
  $("journeyPanel").classList.remove("hidden");$("strengthGrid").classList.remove("hidden");
  chart("student","studentChart",{type:"line",data:{labels:t.map(r=>r.semester),datasets:[{label:"Rata-rata",data:t.map(ravg),tension:.3,fill:true}]},options:{plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});
  $("strengths").innerHTML=ranked.slice(0,3).map(x=>`<div class="metric"><b>${label(x.s)}</b><b>${fmt(x.v)}</b></div>`).join("");
  $("focus").innerHTML=ranked.slice(-3).reverse().map(x=>`<div class="metric"><b>${label(x.s)}</b><b>${fmt(x.v)}</b></div>`).join("");
}
function renderSubjects(){let ss=subjectKeys(rows);$("subjectSelect").innerHTML=ss.map(s=>`<option value="${s}">${label(s)}</option>`).join("");$("subjectSelect").onchange=renderSubjectChart;renderSubjectChart()}
function renderSubjectChart(){let s=$("subjectSelect").value;if(!s)return;let sems=uniq(rows.map(r=>r.semester)).sort();chart("subject","subjectChart",{type:"line",data:{labels:sems,datasets:[{label:label(s),data:sems.map(m=>avg(rows.filter(r=>r.semester===m).map(r=>r[s]))),tension:.3,fill:true}]},options:{scales:{y:{suggestedMin:0,suggestedMax:100}}}})}
function renderSettings(){initSubjects();$("subjectSettings").innerHTML=subjects.map((x,i)=>`<div class="setting-row"><b>${i+1}</b><input data-i="${i}" value="${x.name}"><select data-i="${i}"><option value="true" ${x.active!==false?"selected":""}>Aktif</option><option value="false" ${x.active===false?"selected":""}>Nonaktif</option></select></div>`).join("");document.querySelectorAll("#subjectSettings input").forEach(el=>el.onchange=()=>{subjects[+el.dataset.i].name=el.value;saveSubjects()});document.querySelectorAll("#subjectSettings select").forEach(el=>el.onchange=()=>{subjects[+el.dataset.i].active=el.value==="true";saveSubjects()})}
function saveSubjects(){localStorage.setItem("pakkom_repo_subjects",JSON.stringify(subjects));renderDashboard()}
function norm(raw){let m={};Object.entries(raw).forEach(([k,v])=>m[String(k).trim().toLowerCase()]=v);let get=(...ks)=>{for(let k of ks)if(m[k]!==undefined&&m[k]!=="")return m[k];return""};let r={nis:String(get("nis","nisn","id")).trim(),nama:String(get("nama","nama siswa","siswa")).trim(),kelas:String(get("kelas","rombel","class")).trim(),semester:String(get("semester","smt","periode")).trim()};Object.entries(m).forEach(([k,v])=>{if(!["nis","nisn","id","nama","nama siswa","siswa","kelas","rombel","class","semester","smt","periode"].includes(k)){let n=Number(v);if(v!==""&&Number.isFinite(n))r[k]=n}});return r}
$("excelFile").onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let b=await f.arrayBuffer(),w=XLSX.read(b,{type:"array"}),raw=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{defval:""});pending=raw.map(norm);let valid=pending.filter(x=>x.nama&&x.semester),sub=subjectKeys(valid);$("preview").innerHTML=`<div class="metric"><span>File</span><b>${f.name}</b></div><div class="metric"><span>Siswa ditemukan</span><b>${new Set(valid.map(key)).size}</b></div><div class="metric"><span>Mata pelajaran</span><b>${sub.length}</b></div><div class="metric"><span>Data valid</span><b>${valid.length}</b></div><div class="metric"><span>Data bermasalah</span><b>${pending.length-valid.length}</b></div>`;$("mapping").innerHTML=Object.keys(raw[0]||{}).map(c=>`<div class="metric"><b>${c}</b><span>${guess(c)}</span></div>`).join("");$("saveImport").classList.remove("hidden")}catch(err){$("preview").innerText="Gagal membaca file: "+err.message}}
function guess(c){let k=String(c).toLowerCase();if(["nis","nisn","id"].includes(k))return"NIS/NISN";if(["nama","nama siswa","siswa"].includes(k))return"Nama";if(["kelas","rombel","class"].includes(k))return"Kelas";if(["semester","smt","periode"].includes(k))return"Semester";return"Mata Pelajaran / Angka"}
$("saveImport").onclick=()=>{let valid=pending.filter(x=>x.nama&&x.semester),m=new Map(rows.map(r=>[key(r)+"|"+r.semester,r]));valid.forEach(r=>m.set(key(r)+"|"+r.semester,r));rows=[...m.values()];localStorage.setItem("pakkom_repo_rows",JSON.stringify(rows));pending=[];$("preview").innerHTML="<b>Data berhasil disimpan.</b>";$("saveImport").classList.add("hidden");renderAll()}
function renderTable(){let keys=["nis","nama","kelas","semester",...subjectKeys(rows)];$("dataTable").querySelector("thead").innerHTML="<tr>"+keys.map(k=>`<th>${label(k)}</th>`).join("")+"</tr>";$("dataTable").querySelector("tbody").innerHTML=rows.map(r=>"<tr>"+keys.map(k=>`<td>${r[k]??""}</td>`).join("")+"</tr>").join("")}
function clearData(){if(confirm("Hapus semua data?")){rows=[];localStorage.removeItem("pakkom_repo_rows");renderAll()}}
