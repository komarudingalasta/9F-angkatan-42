import { firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc,
  writeBatch, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const $=id=>document.getElementById(id);
const CORE=["nis","nama","kelas","semester"];
let app,auth,db,records=[],subjects=[],pendingFileRows=[],pendingHeaders=[],selectedStudent=null,charts={},currentProfile=null,currentLoginRole="admin",studentSummaries=[];

function configReady(){
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_") &&
    firebaseConfig.projectId && !firebaseConfig.projectId.includes("PASTE_");
}
if(!configReady()){
  $("setupScreen").classList.remove("hidden");
}else{
  try{
    app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app);
    setPersistence(auth,browserLocalPersistence).catch(()=>{});
    onAuthStateChanged(auth, async user=>{
      if(user){
        try{
          const profileSnap=await getDoc(doc(db,"users",user.uid));
          currentProfile=profileSnap.exists()?profileSnap.data():null;
          if(!currentProfile){
            await signOut(auth);
            $("app").classList.add("hidden");$("loginScreen").classList.remove("hidden");
            return setMessage("loginMessage","Akun belum memiliki profil akses di Firestore.",true);
          }
          if(currentProfile.role!==currentLoginRole){
            const actual=currentProfile.role==="student"?"Siswa":"Admin";
            await signOut(auth);
            return setMessage("loginMessage",`Akun ini terdaftar sebagai ${actual}. Pilih tab login yang sesuai.`,true);
          }
          $("loginScreen").classList.add("hidden");$("setupScreen").classList.add("hidden");$("app").classList.remove("hidden");
          $("userEmail").textContent=currentProfile.role==="student"?`NIS ${currentProfile.nis}`:(user.email||"Admin");
          $("sidebarUserName").textContent=currentProfile.name||currentProfile.nis||user.email||"-";
          $("sidebarUserRole").textContent=currentProfile.role==="student"?"Siswa":"Administrator";
          applyRoleUI();
          await reloadData();
        }catch(e){
          console.error(e);
          setMessage("loginMessage","Gagal membaca profil akses: "+e.message,true);
        }
      }else{
        currentProfile=null;
        $("app").classList.add("hidden");$("loginScreen").classList.remove("hidden");
      }
    });
  }catch(e){
    $("setupScreen").classList.remove("hidden");
    $("setupScreen").querySelector("p").textContent="Konfigurasi Firebase tidak valid: "+e.message;
  }
}


document.querySelectorAll(".login-tab").forEach(btn=>btn.onclick=()=>{
  currentLoginRole=btn.dataset.role;
  document.querySelectorAll(".login-tab").forEach(b=>b.classList.toggle("active",b===btn));
  if(currentLoginRole==="student"){
    $("loginIdentifierLabel").firstChild.textContent="NIS Siswa ";
    $("email").type="text";
    $("email").placeholder="Masukkan NIS";
    $("resetPassword").classList.add("hidden");
    $("loginHint").textContent="Siswa masuk menggunakan NIS dan PIN.";
  }else{
    $("loginIdentifierLabel").firstChild.textContent="Email Admin ";
    $("email").type="email";
    $("email").placeholder="admin@sekolah.sch.id";
    $("resetPassword").classList.remove("hidden");
    $("loginHint").textContent="Admin menggunakan email Firebase.";
  }
  $("email").value="";$("password").value="";setMessage("loginMessage","");
});

function studentInternalEmail(nis){
  return `${String(nis).trim().toLowerCase().replace(/[^a-z0-9]/g,"")}@siswa.pakkom.local`;
}

function applyRoleUI(){
  const isStudent=currentProfile?.role==="student";
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",isStudent));
  document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",!isStudent));
  $("semesterFilter").classList.toggle("hidden",isStudent);
  $("classFilter").classList.toggle("hidden",isStudent);
  if(isStudent)showPage("myGrades"); else showPage("dashboard");
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();setMessage("loginMessage","Memproses...");
  try{
    const loginId=$("email").value.trim();
    const authEmail=currentLoginRole==="student"?studentInternalEmail(loginId):loginId;
    await signInWithEmailAndPassword(auth,authEmail,$("password").value);
    setMessage("loginMessage","");
  }
  catch(err){setMessage("loginMessage",friendlyAuthError(err),true)}
});
$("togglePassword").onclick=()=>{$("password").type=$("password").type==="password"?"text":"password"};
$("resetPassword").onclick=async()=>{
  if(currentLoginRole!=="admin")return;
  const email=$("email").value.trim();if(!email)return setMessage("loginMessage","Masukkan email admin terlebih dahulu.",true);
  try{await sendPasswordResetEmail(auth,email);setMessage("loginMessage","Email reset password telah dikirim.")}catch(e){setMessage("loginMessage",friendlyAuthError(e),true)}
};
$("logoutBtn").onclick=()=>signOut(auth);

function friendlyAuthError(e){
  const c=e?.code||"";
  if(c.includes("invalid-credential"))return"Email atau password salah.";
  if(c.includes("too-many-requests"))return"Terlalu banyak percobaan. Coba lagi nanti.";
  if(c.includes("network-request-failed"))return"Koneksi internet bermasalah.";
  return e?.message||"Login gagal.";
}
function setMessage(id,text,error=false){const el=$(id);el.textContent=text;el.className="message "+(error?"error":text?"success":"")}
function setSync(text,ok=true){$("syncText").textContent=text;$("syncDot").style.color=ok?"var(--green)":"var(--red)"}

document.querySelectorAll(".nav[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $(page+"Page").classList.remove("hidden");
  document.querySelectorAll(".nav[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const meta={dashboard:["Dashboard","Ringkasan perkembangan akademik"],upload:["Upload Leger","Import Excel dengan validasi dan mapping"],records:["Data Nilai","Data Cloud Firestore"],pulse:["Status Siswa","Status perkembangan seluruh siswa"],students:["Perkembangan Siswa","Student Journey dan Growth Index"],subjects:["Analisis Mapel","Tren rata-rata mata pelajaran"],settings:["Pengaturan","Mata pelajaran dan akses siswa"],myGrades:["Nilai Saya","Nilai pribadi, rata-rata kelas, dan ranking"]}[page];
  $("pageTitle").textContent=meta[0];$("pageSubtitle").textContent=meta[1];
  if(page==="records")renderTable();if(page==="pulse")renderPulse("pulseGrid");if(page==="students")renderStudentList();if(page==="subjects")renderSubjects();if(page==="settings"){renderSettings();renderStudentAccess();}if(page==="myGrades")renderMyGrades();
}

async function reloadData(){
  setSync("Menyinkronkan…");
  try{
    const subjectSnap=await getDocs(collection(db,"subjects"));
    subjects=subjectSnap.docs.map(d=>({id:d.id,...d.data()}));
    if(currentProfile?.role==="student"){
      const [recordSnap,summarySnap]=await Promise.all([
        getDocs(query(collection(db,"records"),where("nis","==",currentProfile.nis))),
        getDocs(query(collection(db,"studentSummaries"),where("nis","==",currentProfile.nis)))
      ]);
      records=recordSnap.docs.map(d=>({id:d.id,...d.data()}));
      studentSummaries=summarySnap.docs.map(d=>({id:d.id,...d.data()}));
      ensureSubjectObjects();setSync("Terhubung");renderMyGrades();
    }else{
      const recordSnap=await getDocs(collection(db,"records"));
      records=recordSnap.docs.map(d=>({id:d.id,...d.data()}));
      studentSummaries=[];
      ensureSubjectObjects();setSync("Terhubung");renderAll();
    }
  }catch(e){console.error(e);setSync("Gagal sinkron",false);alert("Gagal membaca Firestore: "+e.message)}
}
function ensureSubjectObjects(){
  const keys=subjectKeys(records,false);
  keys.forEach((key,i)=>{
    if(!subjects.some(s=>s.key===key))subjects.push({id:key,key,name:titleCase(key),short:titleCase(key),order:100+i,active:true,_local:true});
  });
}

const uniq=a=>[...new Set(a.filter(Boolean))];
const avg=a=>{const v=a.map(Number).filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:0};
const fmt=n=>Number(n||0).toFixed(1).replace(".0","");
const titleCase=s=>String(s||"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
function studentKey(r){return r.nis||`${r.nama}|${r.kelas}`}
function subjectKeys(data=records,onlyActive=true){
  const set=new Set;
  data.forEach(r=>Object.keys(r.scores||{}).forEach(k=>set.add(k)));
  let arr=[...set];
  if(onlyActive)arr=arr.filter(k=>subjectMeta(k).active!==false);
  return arr.sort((a,b)=>(subjectMeta(a).order??999)-(subjectMeta(b).order??999)||subjectLabel(a).localeCompare(subjectLabel(b)));
}
function subjectMeta(key){return subjects.find(s=>s.key===key)||{key,name:titleCase(key),short:titleCase(key),order:999,active:true}}
function subjectLabel(k,short=false){const m=subjectMeta(k);return short?(m.short||m.name||titleCase(k)):(m.name||titleCase(k))}
function rowAvg(r){return avg(subjectKeys([r]).map(s=>r.scores?.[s]))}
function grouped(data=records){const m=new Map;data.forEach(r=>{const k=studentKey(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)});return m}
function semesterRank(s){const n=String(s).match(/\d+/);return n?Number(n[0]):999}
function trend(g){return [...g].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)||String(a.semester).localeCompare(String(b.semester)))}
function delta(g){const t=trend(g);return t.length<2?0:rowAvg(t.at(-1))-rowAvg(t.at(-2))}
function status(g){
  const t=trend(g),d=delta(g);
  if(t.length>=3 && rowAvg(t.at(-2))<rowAvg(t.at(-3))-2 && rowAvg(t.at(-1))<rowAvg(t.at(-2))-2)return["🔴","Perhatian"];
  if(d>=3)return["🟢","Meningkat"];if(d<=-3)return["🟡","Dipantau"];return["🔵","Stabil"];
}
function chart(name,id,cfg){if(charts[name])charts[name].destroy();charts[name]=new Chart($(id),cfg)}

function updateFilters(){
  const oldS=$("semesterFilter").value||"ALL",oldC=$("classFilter").value||"ALL";
  $("semesterFilter").innerHTML='<option value="ALL">Semua Semester</option>'+uniq(records.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b)).map(x=>`<option>${escapeHtml(x)}</option>`).join("");
  $("classFilter").innerHTML='<option value="ALL">Semua Kelas</option>'+uniq(records.map(r=>r.kelas)).sort().map(x=>`<option>${escapeHtml(x)}</option>`).join("");
  if([...$("semesterFilter").options].some(o=>o.value===oldS))$("semesterFilter").value=oldS;
  if([...$("classFilter").options].some(o=>o.value===oldC))$("classFilter").value=oldC;
}
$("semesterFilter").onchange=renderDashboard;$("classFilter").onchange=renderDashboard;
function filtered(){
  let d=[...records],s=$("semesterFilter").value,c=$("classFilter").value;
  if(s&&s!=="ALL")d=d.filter(r=>r.semester===s);if(c&&c!=="ALL")d=d.filter(r=>r.kelas===c);return d;
}
function renderAll(){updateFilters();renderDashboard();renderPulse("pulseGrid");renderStudentList();renderSubjects();renderSettings();renderTable()}
function renderDashboard(){
  const d=filtered(),g=grouped(records),gf=grouped(d),gs=[...g.values()],total=gs.length||1;
  $("kpiStudents").textContent=gf.size;$("kpiAverage").textContent=fmt(avg(d.map(rowAvg)));
  const counts={Meningkat:0,Dipantau:0,Perhatian:0};gs.forEach(x=>{const s=status(x)[1];if(counts[s]!==undefined)counts[s]++});
  $("kpiUp").textContent=Math.round(counts.Meningkat/total*100)+"%";$("kpiUpCount").textContent=counts.Meningkat+" siswa";
  $("kpiWatch").textContent=Math.round(counts.Dipantau/total*100)+"%";$("kpiWatchCount").textContent=counts.Dipantau+" siswa";
  $("kpiAlert").textContent=Math.round(counts.Perhatian/total*100)+"%";$("kpiAlertCount").textContent=counts.Perhatian+" siswa";
  const sems=uniq(records.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b)),vals=sems.map(s=>avg(records.filter(r=>r.semester===s).map(rowAvg)));
  const dAvg=vals.length>1?vals.at(-1)-vals.at(-2):0;$("kpiAverageDelta").textContent=vals.length>1?`${dAvg>=0?"↑":"↓"} ${fmt(Math.abs(dAvg))} dari semester lalu`:"Belum ada tren";
  chart("trend","trendChart",{type:"line",data:{labels:sems,datasets:[{label:"Rata-rata",data:vals,tension:.35,fill:true}]},options:{plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});
  const changes=subjectKeys().map(s=>{const per=sems.map(sm=>avg(records.filter(r=>r.semester===sm).map(r=>r.scores?.[s])));return{s,d:per.length>1?per.at(-1)-per.at(-2):0}});
  $("bestSubjects").innerHTML=changes.filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,5).map(x=>metricSubject(x,true)).join("")||'<div class="empty">Belum ada peningkatan.</div>';
  $("weakSubjects").innerHTML=changes.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,5).map(x=>metricSubject(x,false)).join("")||'<div class="empty">Tidak ada penurunan.</div>';
  const growth=[];g.forEach((gr,k)=>{const t=trend(gr);if(t.length>1)growth.push({k,n:t.at(-1).nama,c:t.at(-1).kelas,v:rowAvg(t.at(-1))-rowAvg(t[0])})});growth.sort((a,b)=>b.v-a.v);
  $("improvedStudents").innerHTML=growth.slice(0,5).map((x,i)=>`<div class="metric-row"><div><b>${i+1}. ${escapeHtml(x.n)}</b><small>Kelas ${escapeHtml(x.c||"-")}</small></div><span class="${x.v>=0?"up":"down"}">${x.v>=0?"+":""}${fmt(x.v)}</span></div>`).join("")||'<div class="empty">Butuh minimal 2 semester.</div>';
  renderPulse("pulsePreview",12);
}
function metricSubject(x,pos){return`<div class="metric-row"><b>${escapeHtml(subjectLabel(x.s,true))}</b><span class="${pos?"up":"down"}">${pos?"+":""}${fmt(x.d)}</span></div>`}

function renderPulse(target="pulseGrid",limit=null){
  const arr=[];grouped(filtered()).forEach((g,k)=>{const t=trend(g),l=t.at(-1),st=status(g);arr.push({k,l,st,d:delta(g),a:rowAvg(l)})});arr.sort((a,b)=>a.l.nama.localeCompare(b.l.nama));const list=limit?arr.slice(0,limit):arr;
  $(target).innerHTML=list.map(x=>`<div class="pulse-card" data-key="${encodeURIComponent(x.k)}"><h4>${x.st[0]} ${escapeHtml(x.l.nama)}</h4><small>${escapeHtml(x.l.kelas||"-")} · ${escapeHtml(x.l.nis||"-")}</small><div class="score">${fmt(x.a)}</div><div class="delta ${x.d>=0?"up":"down"}">${x.d>=0?"+":""}${fmt(x.d)} · ${x.st[1]}</div></div>`).join("")||'<div class="empty">Belum ada data nilai.</div>';
  $(target).querySelectorAll(".pulse-card").forEach(el=>el.onclick=()=>{selectedStudent=decodeURIComponent(el.dataset.key);showPage("students");renderStudentList();renderStudentProfile()});
}

$("studentSearch").oninput=renderStudentList;
function renderStudentList(){
  const q=($("studentSearch").value||"").toLowerCase(),arr=[];grouped(records).forEach((g,k)=>{const l=trend(g).at(-1);if((l.nama+" "+l.nis).toLowerCase().includes(q))arr.push({k,l})});arr.sort((a,b)=>a.l.nama.localeCompare(b.l.nama));
  $("studentList").innerHTML=arr.map(x=>`<div class="student-item ${selectedStudent===x.k?"active":""}" data-key="${encodeURIComponent(x.k)}"><b>${escapeHtml(x.l.nama)}</b><small>${escapeHtml(x.l.nis||"-")} · Kelas ${escapeHtml(x.l.kelas||"-")}</small></div>`).join("");
  $("studentList").querySelectorAll(".student-item").forEach(el=>el.onclick=()=>{selectedStudent=decodeURIComponent(el.dataset.key);renderStudentList();renderStudentProfile()});
}
function renderStudentProfile(){
  if(!selectedStudent)return;const g=grouped(records).get(selectedStudent);if(!g)return;const t=trend(g),l=t.at(-1),prev=t.at(-2),growth=t.length>1?rowAvg(l)-rowAvg(t[0]):0,ss=subjectKeys(g);
  const ranked=ss.map(s=>({s,v:Number(l.scores?.[s])})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>b.v-a.v);let best={s:"",v:-Infinity};
  ss.forEach(s=>t.forEach(r=>{const v=Number(r.scores?.[s]);if(Number.isFinite(v)&&v>best.v)best={s,v}}));
  $("studentProfile").innerHTML=`<div class="profile"><div class="profile-left"><div class="avatar">${escapeHtml(l.nama?.[0]||"S")}</div><div><h3>${escapeHtml(l.nama)}</h3><p>${escapeHtml(l.kelas||"-")} · NIS ${escapeHtml(l.nis||"-")}</p></div></div><div class="growth-box"><small>Growth Index</small><b>${growth>=0?"+":""}${fmt(growth)}</b><small>${status(g)[1]}</small></div></div><div class="detail-kpis"><div><span>Rata-rata Terakhir</span><b>${fmt(rowAvg(l))}</b></div><div><span>Sebelumnya</span><b>${prev?fmt(rowAvg(prev)):"-"}</b></div><div><span>Perubahan</span><b>${prev?(rowAvg(l)-rowAvg(prev)>=0?"+":"")+fmt(rowAvg(l)-rowAvg(prev)):"-"}</b></div><div><span>Personal Best</span><b>${best.v>-Infinity?escapeHtml(subjectLabel(best.s,true))+" "+fmt(best.v):"-"}</b></div></div>`;
  $("journeyPanel").classList.remove("hidden");$("strengthGrid").classList.remove("hidden");
  $("studentSubjectSelect").innerHTML='<option value="AVG">Rata-rata Semua Mapel</option>'+ss.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(subjectLabel(s))}</option>`).join("");
  $("studentSubjectSelect").onchange=renderStudentChart;renderStudentChart();
  $("strengths").innerHTML=ranked.slice(0,3).map(x=>`<div class="strength-row"><b>${escapeHtml(subjectLabel(x.s))}</b><b>${fmt(x.v)}</b></div>`).join("")||'<div class="empty">-</div>';
  $("focus").innerHTML=ranked.slice(-3).reverse().map(x=>`<div class="strength-row"><b>${escapeHtml(subjectLabel(x.s))}</b><b>${fmt(x.v)}</b></div>`).join("")||'<div class="empty">-</div>';
}
function renderStudentChart(){
  const g=grouped(records).get(selectedStudent),t=trend(g),s=$("studentSubjectSelect").value,vals=t.map(r=>s==="AVG"?rowAvg(r):Number(r.scores?.[s]||0));
  chart("student","studentChart",{type:"line",data:{labels:t.map(r=>r.semester),datasets:[{label:s==="AVG"?"Rata-rata":subjectLabel(s),data:vals,tension:.35,fill:true}]},options:{scales:{y:{suggestedMin:0,suggestedMax:100}}}});
}

$("subjectSelect").onchange=renderSubjectChart;
function renderSubjects(){
  const ss=subjectKeys(),old=$("subjectSelect").value;$("subjectSelect").innerHTML=ss.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(subjectLabel(s))}</option>`).join("");if(ss.includes(old))$("subjectSelect").value=old;renderSubjectChart()
}
function renderSubjectChart(){
  const s=$("subjectSelect").value;if(!s)return;const sems=uniq(records.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b)),vals=sems.map(sm=>avg(records.filter(r=>r.semester===sm).map(r=>r.scores?.[s])));
  chart("subject","subjectChart",{type:"line",data:{labels:sems,datasets:[{label:subjectLabel(s),data:vals,tension:.35,fill:true}]},options:{scales:{y:{suggestedMin:0,suggestedMax:100}}}});
  $("subjectStats").innerHTML=`<div><span>Nilai Terakhir</span><b>${fmt(vals.at(-1))}</b></div><div><span>Tertinggi</span><b>${vals.length?fmt(Math.max(...vals)):"-"}</b></div><div><span>Terendah</span><b>${vals.length?fmt(Math.min(...vals)):"-"}</b></div><div><span>Perubahan Total</span><b>${vals.length>1?fmt(vals.at(-1)-vals[0]):"-"}</b></div>`;
}

function renderSettings(){
  ensureSubjectObjects();const sorted=[...subjects].sort((a,b)=>(a.order??999)-(b.order??999));
  $("subjectSettingsTable").querySelector("tbody").innerHTML=sorted.map(s=>`<tr data-id="${escapeAttr(s.id||s.key)}"><td><input class="settings-input order-input" type="number" value="${Number(s.order??999)}"></td><td>${escapeHtml(s.key)}</td><td><input class="settings-input name-input" value="${escapeAttr(s.name||titleCase(s.key))}"></td><td><input class="settings-input short-input" value="${escapeAttr(s.short||s.name||titleCase(s.key))}"></td><td><select class="settings-input active-input"><option value="true" ${s.active!==false?"selected":""}>Aktif</option><option value="false" ${s.active===false?"selected":""}>Nonaktif</option></select></td><td><button class="btn secondary save-subject">Simpan</button></td></tr>`).join("");
  $("subjectSettingsTable").querySelectorAll(".save-subject").forEach(btn=>btn.onclick=async()=>{
    const tr=btn.closest("tr"),id=tr.dataset.id,key=subjects.find(x=>(x.id||x.key)===id)?.key||id;
    const payload={key,name:tr.querySelector(".name-input").value.trim()||titleCase(key),short:tr.querySelector(".short-input").value.trim()||titleCase(key),order:Number(tr.querySelector(".order-input").value||999),active:tr.querySelector(".active-input").value==="true",updatedAt:serverTimestamp()};
    btn.disabled=true;btn.textContent="Menyimpan…";
    try{await setDoc(doc(db,"subjects",key),payload,{merge:true});await reloadData()}catch(e){alert("Gagal menyimpan mapel: "+e.message)}finally{btn.disabled=false;btn.textContent="Simpan"}
  });
}

function renderTable(){
  const ss=subjectKeys(records,false),headers=["nis","nama","kelas","semester",...ss];
  $("recordsTable").querySelector("thead").innerHTML="<tr>"+headers.map(h=>`<th>${escapeHtml(CORE.includes(h)?titleCase(h):subjectLabel(h,true))}</th>`).join("")+"</tr>";
  $("recordsTable").querySelector("tbody").innerHTML=records.map(r=>"<tr>"+headers.map(h=>`<td>${escapeHtml(CORE.includes(h)?r[h]??"":r.scores?.[h]??"")}</td>`).join("")+"</tr>").join("");
}
$("refreshBtn").onclick=reloadData;
$("deleteAllBtn").onclick=async()=>{
  if(!confirm("Hapus SEMUA data nilai dari Firebase? Pengaturan mapel tidak dihapus."))return;
  try{setSync("Menghapus…");await deleteCollectionDocs("records");await reloadData()}catch(e){alert("Gagal menghapus: "+e.message);setSync("Gagal",false)}
};

$("excelFile").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:""});
    pendingFileRows=raw;pendingHeaders=Object.keys(raw[0]||{});
    if(!raw.length)throw new Error("Sheet pertama kosong.");
    $("fileInfo").textContent=`${file.name} · ${raw.length} baris ditemukan`;
    buildMapping();$("rebuildPreviewBtn").disabled=false;buildImportPreview();
  }catch(err){setMessage("fileInfo","Gagal membaca file: "+err.message,true)}
  e.target.value="";
};
function normalizeHeader(h){return String(h||"").trim().toLowerCase().replace(/\s+/g," ").replace(/[._-]+/g," ")}
function guessType(h){
  const k=normalizeHeader(h);
  if(["nis","nisn","no induk","nomor induk","id siswa"].includes(k))return"nis";
  if(["nama","nama siswa","siswa","nama lengkap"].includes(k))return"nama";
  if(["kelas","rombel","class"].includes(k))return"kelas";
  if(["semester","smt","periode"].includes(k))return"semester";
  if(/ranking|peringkat|jumlah|rata.?rata|sakit|izin|alpa|absen|kehadiran/i.test(k))return"ignore";
  return"subject";
}
function slug(s){return normalizeHeader(s).replace(/[^a-z0-9 ]/g,"").trim().replace(/\s+/g,"_")}
function buildMapping(){
  $("mappingGrid").innerHTML=pendingHeaders.map((h,i)=>{
    const type=guessType(h);
    return `<div class="mapping-card" data-type="${type}" data-index="${i}"><strong>${escapeHtml(h)}</strong><select class="map-type"><option value="ignore" ${type==="ignore"?"selected":""}>Abaikan</option><option value="nis" ${type==="nis"?"selected":""}>NIS / NISN</option><option value="nama" ${type==="nama"?"selected":""}>Nama Siswa</option><option value="kelas" ${type==="kelas"?"selected":""}>Kelas</option><option value="semester" ${type==="semester"?"selected":""}>Semester</option><option value="subject" ${type==="subject"?"selected":""}>Mata Pelajaran</option></select><input class="mapel-name" value="${escapeAttr(h)}" placeholder="Nama mapel"></div>`;
  }).join("");
  $("mappingGrid").querySelectorAll(".map-type").forEach(s=>s.onchange=()=>{s.closest(".mapping-card").dataset.type=s.value;buildImportPreview()});
  $("mappingGrid").querySelectorAll(".mapel-name").forEach(i=>i.oninput=debounce(buildImportPreview,250));
}
$("rebuildPreviewBtn").onclick=buildImportPreview;
function getMapping(){
  return [...$("mappingGrid").querySelectorAll(".mapping-card")].map(card=>({header:pendingHeaders[Number(card.dataset.index)],type:card.querySelector(".map-type").value,subjectName:card.querySelector(".mapel-name").value.trim()}));
}
function buildImportPreview(){
  if(!pendingFileRows.length)return;
  const map=getMapping(),required=["nama","semester"],errors=[];
  required.forEach(t=>{if(!map.some(m=>m.type===t))errors.push(`Kolom ${t==="nama"?"Nama":"Semester"} belum dipilih.`)});
  const duplicateCore=["nis","nama","kelas","semester"].filter(t=>map.filter(m=>m.type===t).length>1);if(duplicateCore.length)errors.push("Mapping inti ganda: "+duplicateCore.join(", "));
  const subjectMaps=map.filter(m=>m.type==="subject"&&m.subjectName);if(!subjectMaps.length)errors.push("Belum ada mata pelajaran.");
  const parsed=errors.length?[]:pendingFileRows.map(raw=>parseMappedRow(raw,map));
  const valid=parsed.filter(r=>r.nama&&r.semester&&Object.keys(r.scores).length);
  const invalid=pendingFileRows.length-valid.length;
  const students=new Set(valid.map(studentKey)).size;
  $("importSummary").innerHTML=`<div class="preview-row"><span>Baris file</span><b>${pendingFileRows.length}</b></div><div class="preview-row"><span>Siswa unik</span><b>${students}</b></div><div class="preview-row"><span>Mata pelajaran</span><b>${subjectMaps.length}</b></div><div class="preview-row"><span>Data valid</span><b class="good">${valid.length}</b></div><div class="preview-row"><span>Data bermasalah</span><b class="${invalid?"bad":"good"}">${invalid}</b></div>${errors.map(e=>`<div class="message error">${escapeHtml(e)}</div>`).join("")}`;
  $("saveImportBtn").disabled=!!errors.length||!valid.length||students>60;
  if(students>60)$("importSummary").insertAdjacentHTML("beforeend",'<div class="message error">Jumlah siswa melebihi batas desain 60 siswa.</div>');
}
function parseMappedRow(raw,map){
  const r={nis:"",nama:"",kelas:"",semester:"",scores:{}};
  map.forEach(m=>{
    const v=raw[m.header];
    if(["nis","nama","kelas","semester"].includes(m.type))r[m.type]=String(v??"").trim();
    else if(m.type==="subject"&&m.subjectName){
      const n=Number(v);if(v!==""&&Number.isFinite(n))r.scores[slug(m.subjectName)]=n;
    }
  });return r;
}
$("saveImportBtn").onclick=async()=>{
  const map=getMapping(),parsed=pendingFileRows.map(raw=>parseMappedRow(raw,map)),valid=parsed.filter(r=>r.nama&&r.semester&&Object.keys(r.scores).length);
  if(!valid.length)return;
  $("saveImportBtn").disabled=true;setMessage("saveProgress","Menyimpan ke Firebase…");
  try{
    const prepared=valid.map(r=>({...r,id:recordId(r)}));
    await batchSet("records",prepared.map(r=>({id:r.id,data:{nis:r.nis,nama:r.nama,kelas:r.kelas,semester:r.semester,scores:r.scores,updatedAt:serverTimestamp()}})));
    const subMap=new Map();map.filter(m=>m.type==="subject"&&m.subjectName).forEach((m,i)=>{const key=slug(m.subjectName);subMap.set(key,{id:key,data:{key,name:m.subjectName,short:m.subjectName,order:i+1,active:true,updatedAt:serverTimestamp()}})});
    await batchSet("subjects",[...subMap.values()]);
    pendingFileRows=[];pendingHeaders=[];$("mappingGrid").innerHTML='<div class="empty">Import selesai.</div>';$("importSummary").innerHTML='<div class="message success">Data berhasil disimpan ke Firebase.</div>';setMessage("saveProgress","Membuat ringkasan kelas & ranking…");
    await reloadData();
    await rebuildStudentSummaries();
    setMessage("saveProgress","Data, rata-rata kelas, dan ranking berhasil diperbarui.");
  }catch(e){console.error(e);setMessage("saveProgress","Gagal menyimpan: "+e.message,true)}finally{$("saveImportBtn").disabled=false}
};
function recordId(r){
  const base=`${r.nis||r.nama}_${r.kelas}_${r.semester}`.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  return base.slice(0,220)||crypto.randomUUID();
}
async function batchSet(collectionName,items){
  for(let i=0;i<items.length;i+=450){
    const batch=writeBatch(db);items.slice(i,i+450).forEach(item=>batch.set(doc(db,collectionName,item.id),item.data,{merge:true}));await batch.commit();
  }
}
async function deleteCollectionDocs(collectionName){
  const snap=await getDocs(collection(db,collectionName)),docs=snap.docs;
  for(let i=0;i<docs.length;i+=450){const batch=writeBatch(db);docs.slice(i,i+450).forEach(d=>batch.delete(d.ref));await batch.commit()}
}

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escapeAttr(v){return escapeHtml(v)}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}


async function rebuildStudentSummaries(){
  if(currentProfile?.role!=="admin")return;
  const byClassSemester=new Map();
  records.forEach(r=>{
    const k=`${r.kelas}|||${r.semester}`;
    if(!byClassSemester.has(k))byClassSemester.set(k,[]);
    byClassSemester.get(k).push(r);
  });
  const items=[];
  for(const [groupKey,list] of byClassSemester){
    const [kelas,semester]=groupKey.split("|||");
    const ss=subjectKeys(list);
    const subjectAverages={};
    ss.forEach(s=>subjectAverages[s]=avg(list.map(r=>r.scores?.[s])));
    const classReportAverage=avg(list.map(rowAvg));
    const ranked=[...list].map(r=>({r,avg:rowAvg(r)})).sort((a,b)=>b.avg-a.avg||String(a.r.nama).localeCompare(String(b.r.nama)));
    let lastAvg=null,lastRank=0;
    ranked.forEach((entry,index)=>{
      const rank=(lastAvg!==null&&Math.abs(entry.avg-lastAvg)<0.0001)?lastRank:index+1;
      lastAvg=entry.avg;lastRank=rank;
      const id=`${slug(entry.r.nis||entry.r.nama)}_${slug(kelas)}_${slug(semester)}`.slice(0,220);
      items.push({id,data:{
        nis:entry.r.nis,nama:entry.r.nama,kelas,semester,
        studentAverage:entry.avg,
        classReportAverage,
        subjectAverages,
        rank,
        classSize:ranked.length,
        updatedAt:serverTimestamp()
      }});
    });
  }
  await deleteCollectionDocs("studentSummaries");
  await batchSet("studentSummaries",items);
}

function renderMyGrades(){
  if(currentProfile?.role!=="student")return;
  const sems=uniq(studentSummaries.map(s=>s.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b));
  const old=$("mySemesterSelect").value;
  $("mySemesterSelect").innerHTML=sems.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
  if(sems.includes(old))$("mySemesterSelect").value=old;
  else if(sems.length)$("mySemesterSelect").value=sems.at(-1);
  $("mySemesterSelect").onchange=renderMySemester;
  renderMySemester();
}

function renderMySemester(){
  const semester=$("mySemesterSelect").value;
  const summary=studentSummaries.find(s=>s.semester===semester);
  const rec=records.find(r=>r.semester===semester);
  if(!summary||!rec){
    $("mySummary").innerHTML='<div class="empty">Belum ada ringkasan untuk semester ini. Minta admin melakukan import ulang / pembaruan ringkasan.</div>';
    $("myGradesTable").querySelector("tbody").innerHTML="";
    return;
  }
  $("mySummary").innerHTML=`
    <div class="identity-card"><div class="avatar">${escapeHtml(rec.nama?.[0]||"S")}</div><div><h3>${escapeHtml(rec.nama)}</h3><p>NIS ${escapeHtml(rec.nis)} · Kelas ${escapeHtml(rec.kelas)} · ${escapeHtml(semester)}</p></div></div>
    <div class="summary-card"><span>Rata-rata Rapor Saya</span><b>${fmt(summary.studentAverage)}</b></div>
    <div class="summary-card"><span>Rata-rata Rapor Kelas</span><b>${fmt(summary.classReportAverage)}</b></div>
    <div class="summary-card rank-highlight"><span>Ranking Kelas</span><b>${summary.rank} / ${summary.classSize}</b></div>`;
  const ss=subjectKeys([rec]);
  $("myGradesTable").querySelector("tbody").innerHTML=ss.map(s=>{
    const mine=Number(rec.scores?.[s]),classAvg=Number(summary.subjectAverages?.[s]),diff=mine-classAvg;
    return `<tr><td><b>${escapeHtml(subjectLabel(s))}</b></td><td>${fmt(mine)}</td><td>${fmt(classAvg)}</td><td class="${diff>=0?"positive-diff":"negative-diff"}">${diff>=0?"+":""}${fmt(diff)}</td></tr>`;
  }).join("");
}

async function renderStudentAccess(){
  if(currentProfile?.role!=="admin")return;
  const latestByNis=new Map();
  grouped(records).forEach(g=>{const l=trend(g).at(-1);if(l?.nis)latestByNis.set(l.nis,l)});
  const studentsList=[...latestByNis.values()].sort((a,b)=>a.nama.localeCompare(b.nama));
  $("accessStudentSelect").innerHTML='<option value="">Pilih siswa…</option>'+studentsList.map(s=>`<option value="${escapeAttr(s.nis)}">${escapeHtml(s.nis)} — ${escapeHtml(s.nama)}</option>`).join("");
  try{
    const snap=await getDocs(collection(db,"users"));
    const users=snap.docs.map(d=>({uid:d.id,...d.data()})).filter(u=>u.role==="student").sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    $("accessTable").querySelector("tbody").innerHTML=users.map(u=>`<tr><td>${escapeHtml(u.nis||"-")}</td><td>${escapeHtml(u.name||"-")}</td><td>${escapeHtml(u.email||studentInternalEmail(u.nis||""))}</td><td>Aktif</td></tr>`).join("")||'<tr><td colspan="4">Belum ada akun siswa.</td></tr>';
  }catch(e){
    $("accessTable").querySelector("tbody").innerHTML='<tr><td colspan="4">Tidak dapat membaca daftar akun.</td></tr>';
  }
}


const DEFAULT_STUDENT_PASSWORD="123456";

function latestStudentRows(){
  const byNis=new Map();
  records.forEach(r=>{
    if(!r.nis)return;
    const key=String(r.nis);
    const prev=byNis.get(key);
    if(!prev || semesterRank(r.semester)>=semesterRank(prev.semester))byNis.set(key,r);
  });
  return [...byNis.values()].sort((a,b)=>(a.nama||"").localeCompare(b.nama||""));
}

async function createOneStudentAccess(student){
  const nis=String(student.nis||"").trim();
  if(!nis)throw new Error("NIS kosong.");
  const internalEmail=studentInternalEmail(nis);
  let secondaryApp=getApps().find(a=>a.name==="student-account-creator");
  if(!secondaryApp)secondaryApp=initializeApp(firebaseConfig,"student-account-creator");
  const secondaryAuth=getAuth(secondaryApp);
  try{
    const cred=await createUserWithEmailAndPassword(secondaryAuth,internalEmail,DEFAULT_STUDENT_PASSWORD);
    await setDoc(doc(db,"users",cred.user.uid),{
      role:"student",nis,name:student.nama||"",email:internalEmail,
      kelas:student.kelas||"",defaultPassword:true,updatedAt:serverTimestamp()
    },{merge:true});
    await signOut(secondaryAuth);
    return "created";
  }catch(e){
    try{await signOut(secondaryAuth)}catch(_){}
    if(e?.code==="auth/email-already-in-use")return "exists";
    throw e;
  }
}

$("createAccessBtn")?.addEventListener("click",async()=>{
  const nis=$("accessStudentSelect").value;
  if(!nis)return setMessage("accessMessage","Pilih siswa terlebih dahulu.",true);
  const student=latestStudentRows().find(s=>String(s.nis)===String(nis));
  if(!student)return setMessage("accessMessage","Data siswa tidak ditemukan.",true);
  try{
    setMessage("accessMessage","Membuat akses siswa…");
    const result=await createOneStudentAccess(student);
    setMessage("accessMessage",result==="created"
      ?`Akses berhasil dibuat. NIS: ${nis} · Password: ${DEFAULT_STUDENT_PASSWORD}`
      :`Akun NIS ${nis} sudah ada sehingga tidak dibuat ganda.`);
    await renderStudentAccess();
  }catch(e){
    console.error(e);setMessage("accessMessage","Gagal membuat akses: "+(e.message||e),true);
  }
});

$("createAllAccessBtn")?.addEventListener("click",async()=>{
  const students=latestStudentRows();
  if(!students.length)return setMessage("accessMessage","Belum ada siswa. Upload leger terlebih dahulu.",true);
  if(!confirm(`Buat akses untuk ${students.length} siswa?\n\nUsername: NIS masing-masing\nPassword default: ${DEFAULT_STUDENT_PASSWORD}`))return;
  let created=0,exists=0,failed=0;
  $("createAllAccessBtn").disabled=true;
  try{
    for(let i=0;i<students.length;i++){
      const s=students[i];
      setMessage("accessMessage",`Proses ${i+1}/${students.length}: ${s.nis} — ${s.nama}`);
      try{
        const result=await createOneStudentAccess(s);
        result==="created"?created++:exists++;
      }catch(e){console.error("Gagal:",s.nis,e);failed++}
    }
    setMessage("accessMessage",
      `Selesai. ${created} akun baru dibuat, ${exists} sudah ada${failed?`, ${failed} gagal`:""}. Password akun baru: ${DEFAULT_STUDENT_PASSWORD}`,
      failed>0);
    await renderStudentAccess();
  }finally{
    $("createAllAccessBtn").disabled=false;
  }
});

// Sidebar mobile: always icon + text, opened with Menu button.
const sidebar=document.querySelector(".sidebar");
const sidebarBackdrop=$("sidebarBackdrop");
function openSidebar(){sidebar?.classList.add("open");sidebarBackdrop?.classList.remove("hidden")}
function closeSidebar(){sidebar?.classList.remove("open");sidebarBackdrop?.classList.add("hidden")}
$("sidebarToggle")?.addEventListener("click",openSidebar);
sidebarBackdrop?.addEventListener("click",closeSidebar);
document.querySelectorAll(".sidebar .nav[data-page]").forEach(btn=>btn.addEventListener("click",()=>{if(innerWidth<=900)closeSidebar()}));
$("logoutBtn")?.addEventListener("click",closeSidebar);
