import { firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc,
  writeBatch, serverTimestamp, query, where, addDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const $=id=>document.getElementById(id);
document.body.classList.add("auth-locked");
const CORE=["nis","nama","kelas","semester"];
let app,auth,db,records=[],subjects=[],pendingFileRows=[],pendingHeaders=[],selectedStudent=null,charts={},currentProfile=null,currentLoginRole=null,studentSummaries=[];

function configReady(){
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_") &&
    firebaseConfig.projectId && !firebaseConfig.projectId.includes("PASTE_");
}
if(!configReady()){
  $("setupScreen").classList.remove("hidden");
}else{
  try{
    app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app);
    (async()=>{
      try{await setPersistence(auth,browserLocalPersistence)}catch(e){console.warn("Persistence fallback",e)}
      onAuthStateChanged(auth, async user=>{
      if(user){
        try{
          const profileSnap=await getDoc(doc(db,"users",user.uid));
          currentProfile=profileSnap.exists()?profileSnap.data():null;
          if(!currentProfile){
            await signOut(auth);
            $("app").classList.add("hidden");$("loginScreen").classList.remove("hidden");
            return setMessage("loginMessage","Akun belum memiliki profil akses.",true);
          }
          currentLoginRole=currentProfile.role;
          document.body.classList.remove("auth-locked");
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
        records=[];studentSummaries=[];
        document.body.classList.add("auth-locked");
        document.body.classList.remove("student-mode","admin-mode");
        $("app").classList.add("hidden");
        $("sidebarBackdrop")?.classList.add("hidden");
        document.querySelector(".sidebar")?.classList.remove("open");
        $("loginScreen").classList.remove("hidden");
      }
      });
    })();
  }catch(e){
    $("setupScreen").classList.remove("hidden");
    $("setupScreen").querySelector("p").textContent="Konfigurasi Firebase tidak valid: "+e.message;
  }
}




function studentInternalEmail(nis){
  return `${String(nis).trim().toLowerCase().replace(/[^a-z0-9]/g,"")}@siswa.pakkom.local`;
}

function applyRoleUI(){
  const isStudent=currentProfile?.role==="student";
  document.body.classList.toggle("student-mode",isStudent);
  document.body.classList.toggle("admin-mode",!isStudent);
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",isStudent));
  document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",!isStudent));
  $("semesterFilter").classList.toggle("hidden",isStudent);
  $("classFilter").classList.toggle("hidden",isStudent);
  if(isStudent)showPage("studentAcademicV15"); else showPage("dashboard");
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const identifier=$("email").value.trim();
  const password=$("password").value;
  if(!identifier||!password)return setMessage("loginMessage","Masukkan email/NIS dan password.",true);
  const authEmail=identifier.includes("@")?identifier:studentInternalEmail(identifier);
  setMessage("loginMessage","Memproses...");
  try{
    await signInWithEmailAndPassword(auth,authEmail,password);
    setMessage("loginMessage","");
  }catch(err){
    setMessage("loginMessage",friendlyAuthError(err),true);
  }
});
$("togglePassword").onclick=()=>{$("password").type=$("password").type==="password"?"text":"password"};
$("resetPassword").onclick=async()=>{
  const identifier=$("email").value.trim();
  if(!identifier)return setMessage("loginMessage","Masukkan email admin atau NIS siswa terlebih dahulu.",true);
  if(!identifier.includes("@")){
    return setMessage("loginMessage","Password siswa direset oleh admin. Password awal siswa adalah 123456.",true);
  }
  try{
    await sendPasswordResetEmail(auth,identifier);
    setMessage("loginMessage","Tautan reset password telah dikirim ke email Anda.");
  }catch(e){setMessage("loginMessage",friendlyAuthError(e),true)}
};
$("logoutBtn").onclick=async()=>{
  document.body.classList.add("auth-locked");
  document.body.classList.remove("student-mode","admin-mode");
  closeSidebar?.();
  try{await signOut(auth)}catch(e){console.error(e)}
  currentProfile=null;
  records=[];studentSummaries=[];
  $("app").classList.add("hidden");
  $("sidebarBackdrop")?.classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("password").value="";
  setMessage("loginMessage","");
};

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
  setTimeout(()=>syncStudentBottom(page),0);
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const target=$(page+"Page");
  if(!target){console.error("Halaman tidak ditemukan:",page);return}
  target.classList.remove("hidden");
  document.querySelectorAll(".nav[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const meta={
    dashboard:["Dashboard","Ringkasan perkembangan akademik"],
    upload:["Upload Leger","Import Excel dengan validasi dan mapping"],
    records:["Data Nilai","Data Cloud Firestore"],
    pulse:["Peta Perkembangan Siswa","Meningkat, stabil, dipantau, dan perlu perhatian"],
    students:["Perkembangan Siswa","Student Journey dan Growth Index"],
    subjects:["Analisis Mapel","Tren rata-rata mata pelajaran"],
    settings:["Pengaturan","Mata pelajaran dan akses siswa"],attendance:["Kehadiran","Absensi dan pengajuan kehadiran"],studentAcademicV15:["Akademik","Perkembangan akademik saya"],studentAttendanceV15:["Kehadiran","Rekap dan pengajuan ketidakhadiran"],
    myGrades:["Nilai Saya","Nilai pribadi dan hasil semester"],
    studentHome:["Beranda Saya","Ringkasan perkembangan akademik pribadi"],
    studentProgress:["Grafik Perkembangan","Tren nilai dari semester ke semester"],
    studentAnalysis:["Analisis Saya","Kekuatan dan area yang perlu ditingkatkan"],
    studentCompare:["Perbandingan Kelas","Nilai saya dibanding rata-rata kelas"],
    studentRank:["Posisi Akademik Saya","Perkembangan posisi dibanding kelompok kelas saat ini"]
  }[page]||[page,""];
  $("pageTitle").textContent=meta[0];$("pageSubtitle").textContent=meta[1];
  if(page==="studentAcademicV15"){ $("pageTitle").textContent="Ringkasan"; $("pageSubtitle").textContent=""; }
  if(page==="studentAttendanceV15"){ $("pageTitle").textContent="Kehadiran"; $("pageSubtitle").textContent="Rekap dan pengajuan ketidakhadiran"; }
  if(page==="records")renderTable();
  if(page==="pulse")renderPulse("pulseGrid");
  if(page==="students")renderStudentList();
  if(page==="subjects")renderSubjects();
  if(page==="settings"){renderSettings();renderStudentAccess();}
  if(page==="attendance")renderAdminAttendance();
  if(page==="studentAcademicV15"){
    try{renderAcademicV15()}catch(e){console.error(e);target.innerHTML='<div class="card" style="padding:18px"><h3>Data akademik belum dapat ditampilkan</h3><p>Silakan muat ulang halaman atau hubungi admin.</p></div>'}
  }
  if(page==="studentAttendanceV15"){
    try{renderAttendanceV15()}catch(e){console.error(e);target.innerHTML='<div class="card" style="padding:18px"><h3>Data kehadiran belum dapat ditampilkan</h3><p>Silakan muat ulang halaman atau hubungi admin.</p></div>'}
  }
  if(page==="myGrades")renderMyGrades();
  if(page==="studentHome")renderStudentHome();
  if(page==="studentProgress")setTimeout(renderStudentProgress,0);
  if(page==="studentAnalysis")renderStudentAnalysis();
  if(page==="studentCompare")renderStudentCompare();
  if(page==="studentRank")renderStudentRank();
}

function setDataStatus(type,text){
  const el=$("dataStatusBanner");
  if(!el)return;
  if(!text){
    el.className="data-status hidden";
    el.textContent="";
    return;
  }
  el.className=`data-status ${type}`;
  el.textContent=text;
}

async function reloadData(){
  setSync("Menyinkronkan…");setDataStatus("info","Memuat data…");
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
      ensureSubjectObjects();setSync("Terhubung");
      setDataStatus(records.length?"success":"warn",records.length?"Data siswa berhasil dimuat.":"Belum ada data nilai yang terhubung dengan NIS akun ini.");
      renderAllStudentAnalytics();
    }else{
      const [recordSnap,summarySnap]=await Promise.all([
        getDocs(collection(db,"records")),
        getDocs(collection(db,"studentSummaries"))
      ]);
      records=recordSnap.docs.map(d=>({id:d.id,...d.data()}));
      studentSummaries=summarySnap.docs.map(d=>({id:d.id,...d.data()}));
      ensureSubjectObjects();

      // One summary is expected for every student-semester record.
      // Automatically repair missing/old summary collections.
      if(records.length && (studentSummaries.length !== records.length || studentSummaries.some(s=>s.cohortMode!=="current_class"))){
        setSync("Memperbarui posisi…");
        await rebuildStudentSummaries();
        const repaired=await getDocs(collection(db,"studentSummaries"));
        studentSummaries=repaired.docs.map(d=>({id:d.id,...d.data()}));
      }

      setSync("Terhubung");
      setDataStatus(records.length?"success":"warn",
        records.length?`${records.length} data nilai berhasil dimuat.`:"Belum ada data nilai di Firebase. Silakan Upload Leger terlebih dahulu.");
      renderAll();
    }
  }catch(e){
    console.error(e);
    setSync("Gagal sinkron",false);
    setDataStatus("error","Gagal memuat data: "+(e.message||e));
    alert("Gagal memuat data: "+e.message);
  }
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
function chart(name,id,cfg){
  if(charts[name])charts[name].destroy();
  cfg.options=cfg.options||{};
  cfg.options.layout=cfg.options.layout||{};
  cfg.options.layout.padding={...(cfg.options.layout.padding||{}),top:20};
  charts[name]=new Chart($(id),cfg);
}

const pointValueLabelsPlugin={
  id:"pointValueLabels",
  afterDatasetsDraw(chart){
    if(chart.config.type!=="line")return;
    const ctx=chart.ctx;
    ctx.save();
    ctx.font="600 10px system-ui, sans-serif";
    ctx.textAlign="center";
    ctx.textBaseline="bottom";
    ctx.fillStyle="#32445f";
    chart.data.datasets.forEach((dataset,di)=>{
      const meta=chart.getDatasetMeta(di);
      if(meta.hidden)return;
      meta.data.forEach((point,i)=>{
        const v=Number(dataset.data[i]);
        if(Number.isFinite(v))ctx.fillText(fmt(v),point.x,point.y-7);
      });
    });
    ctx.restore();
  }
};
if(typeof Chart!=="undefined"&&!Chart.registry.plugins.get("pointValueLabels")){
  Chart.register(pointValueLabelsPlugin);
}

function updateFilters(){
  const oldS=$("semesterFilter").value||"ALL",oldC=$("classFilter").value||"ALL";
  $("semesterFilter").innerHTML='<option value="ALL">Semua Semester</option>'+uniq(records.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b)).map(x=>`<option>${escapeHtml(x)}</option>`).join("");
  $("classFilter").innerHTML='<option value="ALL">Semua Kelas</option>'+uniq(records.map(r=>r.kelas)).sort().map(x=>`<option>${escapeHtml(x)}</option>`).join("");
  if([...$("semesterFilter").options].some(o=>o.value===oldS))$("semesterFilter").value=oldS;
  if([...$("classFilter").options].some(o=>o.value===oldC))$("classFilter").value=oldC;
}
function renderAdminFilteredViews(){
  if(currentProfile?.role!=="admin")return;
  renderDashboard();renderPulse("pulseGrid");renderStudentList();renderSubjects();renderTable();
}
$("semesterFilter").onchange=renderAdminFilteredViews;
$("classFilter").onchange=renderAdminFilteredViews;
function filtered(){
  let d=[...records],s=$("semesterFilter").value,c=$("classFilter").value;
  if(s&&s!=="ALL")d=d.filter(r=>r.semester===s);if(c&&c!=="ALL")d=d.filter(r=>r.kelas===c);return d;
}
function renderAll(){updateFilters();renderDashboard();renderPulse("pulseGrid");renderStudentList();renderSubjects();renderSettings();renderTable()}
function renderDashboard(){
  const d=filtered();
  const selectedSemester=$("semesterFilter").value;
  const selectedClass=$("classFilter").value;
  $("kpiStudents").textContent=grouped(d).size;
  $("kpiAverage").textContent=fmt(avg(d.map(rowAvg)));

  let base=records.filter(r=>!selectedClass||selectedClass==="ALL"||r.kelas===selectedClass);
  const allSems=uniq(base.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b));
  const currentSem=(selectedSemester&&selectedSemester!=="ALL")?selectedSemester:allSems.at(-1);
  const currentIndex=allSems.indexOf(currentSem);
  const previousSem=currentIndex>0?allSems[currentIndex-1]:null;
  const currentRows=currentSem?base.filter(r=>r.semester===currentSem):base;
  const prevRows=previousSem?base.filter(r=>r.semester===previousSem):[];
  const prevByStudent=new Map(prevRows.map(r=>[studentKey(r),r]));

  let up=0,watch=0,alert=0;
  currentRows.forEach(r=>{
    const prev=prevByStudent.get(studentKey(r));if(!prev)return;
    const de=rowAvg(r)-rowAvg(prev);
    if(de>=3)up++;else if(de<=-3)watch++;
  });
  if(currentIndex>=2){
    const olderSem=allSems[currentIndex-2];
    const olderByStudent=new Map(base.filter(r=>r.semester===olderSem).map(r=>[studentKey(r),r]));
    currentRows.forEach(r=>{
      const p=prevByStudent.get(studentKey(r)),o=olderByStudent.get(studentKey(r));
      if(p&&o&&rowAvg(p)<rowAvg(o)-2&&rowAvg(r)<rowAvg(p)-2)alert++;
    });
  }
  const n=currentRows.length||1;
  $("kpiUp").textContent=Math.round(up/n*100)+"%";$("kpiUpCount").textContent=up+" siswa";
  $("kpiWatch").textContent=Math.round(watch/n*100)+"%";$("kpiWatchCount").textContent=watch+" siswa";
  $("kpiAlert").textContent=Math.round(alert/n*100)+"%";$("kpiAlertCount").textContent=alert+" siswa";

  const currentAvg=avg(currentRows.map(rowAvg)),prevAvg=avg(prevRows.map(rowAvg));
  const dAvg=previousSem?currentAvg-prevAvg:0;
  $("kpiAverageDelta").textContent=previousSem?`${dAvg>=0?"↑":"↓"} ${fmt(Math.abs(dAvg))} dari ${previousSem}`:"Belum ada semester pembanding";

  const chartSems=(selectedSemester&&selectedSemester!=="ALL")?[selectedSemester]:allSems;
  const vals=chartSems.map(sm=>avg(base.filter(r=>r.semester===sm).map(rowAvg)));
  chart("trend","trendChart",{type:"line",data:{labels:chartSems,datasets:[{label:"Rata-rata",data:vals,tension:.35,fill:true}]},options:{plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});

  const changes=subjectKeys(currentRows).map(sub=>{
    const now=avg(currentRows.map(r=>r.scores?.[sub]));
    const before=previousSem?avg(prevRows.map(r=>r.scores?.[sub])):now;
    return{s:sub,d:now-before};
  });
  $("bestSubjects").innerHTML=changes.filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,5).map(x=>metricSubject(x,true)).join("")||'<div class="empty">Belum ada peningkatan pada semester terpilih.</div>';
  $("weakSubjects").innerHTML=changes.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,5).map(x=>metricSubject(x,false)).join("")||'<div class="empty">Tidak ada penurunan pada semester terpilih.</div>';

  const growth=[];
  currentRows.forEach(r=>{const prev=prevByStudent.get(studentKey(r));if(prev)growth.push({n:r.nama,c:r.kelas,v:rowAvg(r)-rowAvg(prev)})});
  growth.sort((a,b)=>b.v-a.v);
  $("improvedStudents").innerHTML=growth.slice(0,5).map((x,i)=>`<div class="metric-row"><div><b>${i+1}. ${escapeHtml(x.n)}</b><small>Kelas ${escapeHtml(x.c||"-")}</small></div><span class="${x.v>=0?"up":"down"}">${x.v>=0?"+":""}${fmt(x.v)}</span></div>`).join("")||'<div class="empty">Butuh semester pembanding.</div>';
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
  const q=($("studentSearch").value||"").toLowerCase(),arr=[];
  const scope=currentProfile?.role==="admin"?filtered():records;
  grouped(scope).forEach((g,k)=>{const l=trend(g).at(-1);if((l.nama+" "+l.nis).toLowerCase().includes(q))arr.push({k,l})});arr.sort((a,b)=>a.l.nama.localeCompare(b.l.nama));
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
  const scope=filtered();
  const ss=subjectKeys(scope),old=$("subjectSelect").value;
  $("subjectSelect").innerHTML=ss.map(sub=>`<option value="${escapeAttr(sub)}">${escapeHtml(subjectLabel(sub))}</option>`).join("");
  if(ss.includes(old))$("subjectSelect").value=old;
  renderSubjectChart();
}
function renderSubjectChart(){
  const sub=$("subjectSelect").value;if(!sub)return;
  const scope=filtered(),selectedSemester=$("semesterFilter").value;
  const sems=(selectedSemester&&selectedSemester!=="ALL")?[selectedSemester]:uniq(scope.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b));
  const vals=sems.map(sm=>avg(scope.filter(r=>r.semester===sm).map(r=>r.scores?.[sub])));
  chart("subject","subjectChart",{type:"line",data:{labels:sems,datasets:[{label:subjectLabel(sub),data:vals,tension:.35,fill:true}]},options:{scales:{y:{suggestedMin:0,suggestedMax:100}}}});
  $("subjectStats").innerHTML=`<div><span>Nilai Terpilih</span><b>${vals.length?fmt(vals.at(-1)):"-"}</b></div><div><span>Tertinggi</span><b>${vals.length?fmt(Math.max(...vals)):"-"}</b></div><div><span>Terendah</span><b>${vals.length?fmt(Math.min(...vals)):"-"}</b></div><div><span>Jumlah Semester</span><b>${vals.length}</b></div>`;
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
  const scope=currentProfile?.role==="admin"?filtered():records;
  const ss=subjectKeys(scope,false),headers=["nis","nama","kelas","semester",...ss];
  $("recordsTable").querySelector("thead").innerHTML="<tr>"+headers.map(h=>`<th>${escapeHtml(CORE.includes(h)?titleCase(h):subjectLabel(h,true))}</th>`).join("")+"</tr>";
  $("recordsTable").querySelector("tbody").innerHTML=scope.map(r=>"<tr>"+headers.map(h=>`<td>${escapeHtml(CORE.includes(h)?r[h]??"":r.scores?.[h]??"")}</td>`).join("")+"</tr>").join("");
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
  if(/posisi|peringkat|jumlah|rata.?rata|sakit|izin|alpa|absen|kehadiran/i.test(k))return"ignore";
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
    pendingFileRows=[];pendingHeaders=[];$("mappingGrid").innerHTML='<div class="empty">Import selesai.</div>';$("importSummary").innerHTML='<div class="message success">Data berhasil disimpan ke Firebase.</div>';setMessage("saveProgress","Membuat ringkasan kelas & posisi…");
    await reloadData();
    await rebuildStudentSummaries();
    setMessage("saveProgress","Data, rata-rata kelas, dan posisi berhasil diperbarui.");
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

  // Tentukan kelas aktif setiap siswa dari semester paling baru.
  const byNis=new Map();
  records.forEach(r=>{
    const nis=String(r.nis||"").trim();
    if(!nis)return;
    if(!byNis.has(nis))byNis.set(nis,[]);
    byNis.get(nis).push(r);
  });
  const currentClassByNis=new Map();
  byNis.forEach((rows,nis)=>{
    const latest=[...rows].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)).at(-1);
    if(latest?.kelas)currentClassByNis.set(nis,latest.kelas);
  });

  const items=[];
  for(const [nis,studentRows] of byNis){
    const currentClass=currentClassByNis.get(nis);
    if(!currentClass)continue;
    const cohortNis=[...currentClassByNis.entries()].filter(([,k])=>k===currentClass).map(([n])=>n);

    for(const r of studentRows){
      // Pembanding semester ini adalah siswa yang SEKARANG satu kelas,
      // lalu ambil nilai mereka pada semester yang sama, apa pun kelas lamanya.
      const cohortRows=cohortNis.map(peerNis=>{
        const rows=byNis.get(peerNis)||[];
        return rows.find(x=>x.semester===r.semester);
      }).filter(Boolean).filter(x=>rowAvg(x)>0);

      const ss=subjectKeys(cohortRows,false);
      const subjectAverages={};
      ss.forEach(s=>{
        const vals=cohortRows.map(x=>Number(x.scores?.[s])).filter(Number.isFinite);
        subjectAverages[s]=vals.length?avg(vals):null;
      });
      const classReportAverage=cohortRows.length?avg(cohortRows.map(rowAvg)):null;
      const ranked=cohortRows.map(x=>({nis:String(x.nis),a:rowAvg(x),nama:x.nama||""}))
        .sort((a,b)=>b.a-a.a||a.nama.localeCompare(b.nama));
      let rank=null,lastAvg=null,lastRank=0;
      ranked.forEach((x,index)=>{
        const rr=(lastAvg!==null&&Math.abs(x.a-lastAvg)<0.0001)?lastRank:index+1;
        lastAvg=x.a;lastRank=rr;
        if(x.nis===nis)rank=rr;
      });

      const id=`${slug(nis)}_${slug(currentClass)}_${slug(r.semester)}`.slice(0,220);
      items.push({id,data:{
        nis,nama:r.nama||"",kelas:currentClass,semester:r.semester,
        sourceClass:r.kelas||"",
        studentAverage:rowAvg(r),
        classReportAverage,
        subjectAverages,
        rank,
        classSize:ranked.length,
        cohortMode:"current_class",
        updatedAt:serverTimestamp()
      }});
    }
  }
  await deleteCollectionDocs("studentSummaries");
  await batchSet("studentSummaries",items);
}
let studentProgressChartInstance=null;

function myOrderedRecords(){
  return [...records].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester));
}
function summaryForSemester(semester){
  return studentSummaries.find(s=>s.semester===semester);
}
function renderStudentHome(){
  const rows=myOrderedRecords();
  const latest=rows.at(-1);
  if(!latest){$("studentHomeContent").innerHTML='<div class="empty">Belum ada data nilai.</div>';return}
  const prev=rows.at(-2);
  const avg=rowAvg(latest), prevAvg=prev?rowAvg(prev):NaN;
  const change=Number.isFinite(prevAvg)?avg-prevAvg:NaN;
  const summary=summaryForSemester(latest.semester);
  const subjects=subjectKeys([latest]);
  const scored=subjects.map(s=>({s,v:Number(latest.scores?.[s])})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>b.v-a.v);
  const strongest=scored[0], weakest=scored.at(-1);
  let improved=null;
  if(prev){
    improved=subjects.map(s=>({s,d:Number(latest.scores?.[s])-Number(prev.scores?.[s])}))
      .filter(x=>Number.isFinite(x.d)).sort((a,b)=>b.d-a.d)[0];
  }
  $("studentHomeContent").innerHTML=`
    <div class="student-kpi-grid">
      <div class="student-kpi"><span>Rata-rata terbaru</span><b>${fmt(avg)}</b><small>${escapeHtml(latest.semester)}</small></div>
      <div class="student-kpi"><span>Perubahan</span><b>${Number.isFinite(change)?`${change>=0?"+":""}${fmt(change)}`:"-"}</b><small>dari semester sebelumnya</small></div>
      <div class="student-kpi"><span>Posisi akademik</span><b>${summary?summary.rank:"-"}</b><small>${summary?`dari ${summary.classSize} siswa`:"menunggu ringkasan"}</small></div>
      <div class="student-kpi"><span>Rata-rata kelas</span><b>${summary?fmt(summary.classReportAverage):"-"}</b><small>${escapeHtml(latest.semester)}</small></div>
    </div>
    <div class="student-insight-grid">
      <div class="student-insight"><div class="icon">🏆</div><h3>Mapel Terkuat</h3><p>${strongest?`${escapeHtml(subjectLabel(strongest.s))} · ${fmt(strongest.v)}`:"Belum tersedia"}</p></div>
      <div class="student-insight"><div class="icon">🚀</div><h3>Peningkatan Terbesar</h3><p>${improved?`${escapeHtml(subjectLabel(improved.s))} · ${improved.d>=0?"+":""}${fmt(improved.d)}`:"Butuh minimal 2 semester"}</p></div>
      <div class="student-insight"><div class="icon">🎯</div><h3>Perlu Ditingkatkan</h3><p>${weakest?`${escapeHtml(subjectLabel(weakest.s))} · ${fmt(weakest.v)}`:"Belum tersedia"}</p></div>
    </div>`;
}
function populateStudentChartMetric(){
  const rows=myOrderedRecords(), subjects=subjectKeys(rows), sel=$("studentChartMetric");
  const current=sel.value;
  sel.innerHTML='<option value="average">Rata-rata Rapor</option>'+subjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(subjectLabel(s))}</option>`).join("");
  if([...sel.options].some(o=>o.value===current))sel.value=current;
}
function renderStudentProgress(){
  populateStudentChartMetric();
  const rows=myOrderedRecords(), metric=$("studentChartMetric").value;
  const labels=rows.map(r=>r.semester);
  const values=rows.map(r=>metric==="average"?rowAvg(r):Number(r.scores?.[metric]));
  const canvas=$("studentProgressChart");
  if(studentProgressChartInstance)studentProgressChartInstance.destroy();
  if(typeof Chart==="undefined"){canvas.parentElement.innerHTML='<div class="empty">Komponen grafik belum termuat.</div>';return}
  studentProgressChartInstance=new Chart(canvas,{type:"line",data:{labels,datasets:[{label:metric==="average"?"Rata-rata Rapor":subjectLabel(metric),data:values,tension:.25,fill:false}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:20}},scales:{y:{suggestedMin:0,suggestedMax:100}},plugins:{legend:{display:true}}}});
}
function renderStudentAnalysis(){
  const rows=myOrderedRecords(), latest=rows.at(-1), prev=rows.at(-2);
  if(!latest){$("studentAnalysisContent").innerHTML='<div class="empty">Belum ada data nilai.</div>';return}
  const subjects=subjectKeys([latest]);
  const arr=subjects.map(s=>({s,v:Number(latest.scores?.[s]),prev:prev?Number(prev.scores?.[s]):NaN}))
    .filter(x=>Number.isFinite(x.v)).map(x=>({...x,d:Number.isFinite(x.prev)?x.v-x.prev:NaN}));
  const strongest=[...arr].sort((a,b)=>b.v-a.v).slice(0,3);
  const improve=[...arr].filter(x=>Number.isFinite(x.d)).sort((a,b)=>b.d-a.d).slice(0,3);
  const attention=[...arr].sort((a,b)=>a.v-b.v).slice(0,3);
  const block=(title,icon,data,mode)=>`<div class="card"><h3>${icon} ${title}</h3><div class="analysis-list">${data.map(x=>`<div class="analysis-item"><span>${escapeHtml(subjectLabel(x.s))}</span><b>${mode==="diff"?`${x.d>=0?"+":""}${fmt(x.d)}`:fmt(x.v)}</b></div>`).join("")||'<div class="empty">Belum cukup data.</div>'}</div></div>`;
  $("studentAnalysisContent").innerHTML=block("Nilai Terkuat","🏆",strongest,"score")+block("Peningkatan Terbesar","🚀",improve,"diff")+block("Prioritas Peningkatan","🎯",attention,"score");
}
function renderStudentCompare(){
  const rows=myOrderedRecords(), sel=$("studentCompareSemester");
  const current=sel.value;
  sel.innerHTML=rows.map(r=>`<option value="${escapeHtml(r.semester)}">${escapeHtml(r.semester)}</option>`).join("");
  if(rows.some(r=>r.semester===current))sel.value=current; else if(rows.length)sel.value=rows.at(-1).semester;
  const rec=rows.find(r=>r.semester===sel.value), sum=summaryForSemester(sel.value);
  if(!rec){$("studentCompareBody").innerHTML="";return}
  $("studentCompareBody").innerHTML=subjectKeys([rec]).map(s=>{
    const mine=Number(rec.scores?.[s]), cls=Number(sum?.subjectAverages?.[s]), diff=mine-cls;
    return `<tr><td><b>${escapeHtml(subjectLabel(s))}</b></td><td>${fmt(mine)}</td><td>${Number.isFinite(cls)?fmt(cls):"-"}</td><td class="${Number.isFinite(diff)?(diff>=0?"positive-diff":"negative-diff"):""}">${Number.isFinite(diff)?`${diff>=0?"+":""}${fmt(diff)}`:"-"}</td></tr>`;
  }).join("");
}
function renderStudentRank(){
  const rows=myOrderedRecords();
  $("studentRankContent").innerHTML=`<div class="rank-timeline">${rows.map(r=>{
    const s=summaryForSemester(r.semester);
    return `<div class="rank-row"><div><b>${escapeHtml(r.semester)}</b><small>Rata-rata ${fmt(rowAvg(r))}</small></div><strong>${s?`#${s.rank}`:"-"}</strong><span class="rank-badge">${s?`${s.rank}/${s.classSize}`:"Belum tersedia"}</span></div>`;
  }).join("")||'<div class="empty">Belum ada riwayat semester.</div>'}</div>`;
}
function renderAllStudentAnalytics(){
  if(currentProfile?.role!=="student")return;
  renderMyGrades();renderStudentHome();renderStudentAnalysis();renderStudentCompare();renderStudentRank();
  setTimeout(()=>{if(!$("studentProgressPage").classList.contains("hidden"))renderStudentProgress();},0);
}
$("studentChartMetric")?.addEventListener("change",renderStudentProgress);
$("studentCompareSemester")?.addEventListener("change",renderStudentCompare);

function renderMyGrades(){
  if(currentProfile?.role!=="student")return;
  const sems=uniq([...records.map(r=>r.semester),...studentSummaries.map(s=>s.semester)]).sort((a,b)=>semesterRank(a)-semesterRank(b));
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

  if(!rec){
    $("mySummary").innerHTML='<div class="empty">Belum ada nilai untuk semester ini.</div>';
    $("myGradesTable").querySelector("tbody").innerHTML="";
    return;
  }

  const reportAverage=rowAvg(rec);
  $("mySummary").innerHTML=`
    <div class="identity-card"><div class="avatar">${escapeHtml(rec.nama?.[0]||"S")}</div><div><h3>${escapeHtml(rec.nama)}</h3><p>NIS ${escapeHtml(rec.nis)} · Kelas ${escapeHtml(rec.kelas)} · ${escapeHtml(semester)}</p></div></div>
    <div class="summary-card"><span>Rata-rata Rapor Saya</span><b>${fmt(reportAverage)}</b></div>
    <div class="summary-card"><span>Rata-rata Rapor Kelas</span><b>${summary?fmt(summary.classReportAverage):"-"}</b></div>
    <div class="summary-card rank-highlight"><span>Posisi Akademik</span><b>${summary?`${summary.rank} / ${summary.classSize}`:"-"}</b></div>`;

  const ss=subjectKeys([rec]);
  $("myGradesTable").querySelector("tbody").innerHTML=ss.map(s=>{
    const mine=Number(rec.scores?.[s]);
    const classAvg=summary?Number(summary.subjectAverages?.[s]):NaN;
    const hasClassAvg=Number.isFinite(classAvg);
    const diff=hasClassAvg?mine-classAvg:NaN;
    return `<tr>
      <td><b>${escapeHtml(subjectLabel(s))}</b></td>
      <td>${fmt(mine)}</td>
      <td>${hasClassAvg?fmt(classAvg):"-"}</td>
      <td class="${hasClassAvg?(diff>=0?"positive-diff":"negative-diff"):""}">${hasClassAvg?`${diff>=0?"+":""}${fmt(diff)}`:"-"}</td>
    </tr>`;
  }).join("");

  if(!summary){
    $("mySummary").insertAdjacentHTML("afterend",
      '<div id="studentSummaryNotice" class="student-data-notice">Nilai pribadi sudah tersedia. Rata-rata kelas dan posisi sedang menunggu pembaruan ringkasan oleh admin. Login admin satu kali untuk membangun ringkasan otomatis.</div>');
  }else{
    document.getElementById("studentSummaryNotice")?.remove();
  }
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


let v15ChartObj=null,attRows=[],leaveRows=[];
function mineV15(){return records.filter(r=>String(r.nis)===String(currentProfile?.nis)).sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester))}
function classNow(){return currentProfile?.kelas||mineV15().at(-1)?.kelas||"-"}
function summaryV17(sem){return studentSummaries.find(s=>String(s.semester)===String(sem));}
function cohortV15(){return [];} // V17: siswa tidak membaca nilai siswa lain.
function posV15(sem,val){const s=summaryV17(sem);return {p:s?.rank??null,n:s?.classSize??0};}
function renderAcademicV15(){const rows=mineV15();if(!rows.length)return;const last=rows.at(-1),prev=rows.at(-2),la=rowAvg(last),pa=prev?rowAvg(prev):la,d=la-pa,p=posV15(last.semester,la);$("v16Greeting").textContent=`Selamat datang, ${(currentProfile.name||last.nama||"Siswa").split(" ")[0]} 👋`;$("v15Meta").textContent=`NIS ${currentProfile.nis} · Kelas ${classNow()}`;$("v15Latest").textContent=fmt(la);$("v15Combined").textContent=fmt(avg(rows.map(rowAvg)));$("v15Delta").textContent=prev?`${d>=0?"↑":"↓"} ${fmt(Math.abs(d))} dari semester sebelumnya`:"Semester pertama";$("v15Position").textContent=p.n?`${p.p} / ${p.n}`:"—";if($("v15Growth")) $("v15Growth").textContent=d>=2?"Meningkat":d<=-2?"Perlu perhatian":"Stabil";const subs=subjectKeys(rows,false),metric=$("v15Metric"),old=metric.value;metric.innerHTML='<option value="AVG">Rata-rata Rapor</option>'+subs.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(subjectLabel(s))}</option>`).join("");if([...metric.options].some(o=>o.value===old))metric.value=old;metric.onchange=drawV15;const sel=$("v15Semester"),os=sel.value;sel.innerHTML=rows.map(r=>`<option>${escapeHtml(r.semester)}</option>`).join("");sel.value=rows.some(r=>r.semester===os)?os:last.semester;sel.onchange=gradesV15;drawV15();gradesV15();let vals=subs.map(s=>({s,v:Number(last.scores?.[s])})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>b.v-a.v);$("v15Strong").textContent=vals[0]?subjectLabel(vals[0].s):"—";$("v15StrongVal").textContent=vals[0]?fmt(vals[0].v):"—";$("v15Focus").textContent=vals.at(-1)?subjectLabel(vals.at(-1).s):"—";$("v15FocusVal").textContent=vals.at(-1)?fmt(vals.at(-1).v):"—";let inc=[];if(prev)subs.forEach(s=>{let a=Number(prev.scores?.[s]),b=Number(last.scores?.[s]);if(Number.isFinite(a)&&Number.isFinite(b))inc.push({s,d:b-a})});inc.sort((a,b)=>b.d-a.d);$("v15Improve").textContent=inc[0]?subjectLabel(inc[0].s):"—";$("v15ImproveVal").textContent=inc[0]?`${inc[0].d>=0?"+":""}${fmt(inc[0].d)} poin`:"Belum ada pembanding";$("v15Journey").innerHTML=rows.map(r=>{let q=posV15(r.semester,rowAvg(r));return `<div class="v15-step"><span>${escapeHtml(r.semester)}</span><b>${q.p?"#"+q.p:"—"}</b><small>${fmt(rowAvg(r))}${q.n?" · "+q.n+" siswa":""}</small></div>`}).join("")}
function drawV15(){
  const rows=mineV15();
  const metric=$("v15Metric").value;
  const mine=rows.map(r=>metric==="AVG"?rowAvg(r):Number(r.scores?.[metric]));

  if(v15ChartObj)v15ChartObj.destroy();

  v15ChartObj=new Chart($("v15Chart"),{
    type:"line",
    data:{
      labels:rows.map(r=>r.semester),
      datasets:[{
        label:metric==="AVG"?"Rata-rata Rapor Saya":subjectLabel(metric),
        data:mine,
        tension:.35,
        pointRadius:5,
        pointHoverRadius:6,
        fill:false
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      layout:{padding:{top:24,right:8,left:4,bottom:2}},
      plugins:{
        legend:{display:false},
        tooltip:{enabled:true}
      },
      scales:{
        y:{
          suggestedMin:0,
          suggestedMax:100,
          ticks:{precision:0}
        },
        x:{
          grid:{display:false}
        }
      }
    }
  });
}
function gradesV15(){
  const r=mineV15().find(x=>x.semester===$("v15Semester").value);
  if(!r)return;

  const sum=summaryV17(r.semester);
  const subs=subjectKeys([r],false);

  $("v15Grades").innerHTML=`
    <table class="v15-table v17-grades-table">
      <thead>
        <tr>
          <th>Mata Pelajaran</th>
          <th>Nilai Saya</th>
          <th>Rata-rata Kelompok</th>
          <th>Selisih</th>
        </tr>
      </thead>
      <tbody>
        ${subs.map(s=>{
          const mine=Number(r.scores?.[s]);
          const groupAvg=Number(sum?.subjectAverages?.[s]);
          const diff=mine-groupAvg;
          const groupText=Number.isFinite(groupAvg)?fmt(groupAvg):"—";
          const diffText=Number.isFinite(diff)?`${diff>=0?"+":""}${fmt(diff)}`:"—";
          const diffClass=Number.isFinite(diff)?(diff>=0?"positive-diff":"negative-diff"):"";
          return `
            <tr>
              <td data-label="Mata Pelajaran">${escapeHtml(subjectLabel(s))}</td>
              <td data-label="Nilai Saya" class="num">${fmt(mine)}</td>
              <td data-label="Rata-rata Kelompok" class="num">${groupText}</td>
              <td data-label="Selisih" class="num ${diffClass}">${diffText}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}
async function loadAtt(student=true){attRows=[];leaveRows=[];try{if(student){let a=await getDocs(query(collection(db,"attendance"),where("nis","==",String(currentProfile.nis))));attRows=a.docs.map(d=>({id:d.id,...d.data()}));let l=await getDocs(query(collection(db,"leaveRequests"),where("nis","==",String(currentProfile.nis))));leaveRows=l.docs.map(d=>({id:d.id,...d.data()}))}else{let l=await getDocs(collection(db,"leaveRequests"));leaveRows=l.docs.map(d=>({id:d.id,...d.data()}))}}catch(e){console.warn(e)}}
async function renderAttendanceV15(){await loadAtt(true);$("attName").textContent=currentProfile.name||`NIS ${currentProfile.nis}`;let h=attRows.filter(x=>x.status==="Hadir").length,s=attRows.filter(x=>x.status==="Sakit").length,i=attRows.filter(x=>x.status==="Izin").length,a=attRows.filter(x=>x.status==="Alpa").length,t=h+s+i+a;const rate=t?Math.round(h/t*100):0;
  $("attRate").textContent=t?rate+"%":"—";
  $("attH").textContent=h;
  if($("attS"))$("attS").textContent=s;
  if($("attI"))$("attI").textContent=i;
  if($("attA"))$("attA").textContent=a;
  if($("attSIA"))$("attSIA").textContent=`${s} / ${i} / ${a}`;
  if($("attRing"))$("attRing").style.setProperty("--att-rate",rate+"%");$("attHistory").innerHTML=attRows.length?attRows.map(x=>`<div class="metric-row"><div><b>${escapeHtml(x.date||"-")}</b></div><span class="badge">${escapeHtml(x.status||"-")}</span></div>`).join(""):'<div class="empty">Belum ada data kehadiran.</div>';renderAttendanceCalendar();$("leaveHistory").innerHTML=leaveRows.length?leaveRows.map(x=>`<div class="metric-row"><div><b>${escapeHtml(x.type)} · ${escapeHtml(x.startDate)}</b><small>${escapeHtml(x.note||"")}</small></div><span class="badge">${escapeHtml(x.status||"Menunggu")}</span></div>`).join(""):'<div class="empty">Belum ada pengajuan.</div>'}
$("leaveBtn").onclick=()=>$("leaveModal").classList.remove("hidden");$("leaveClose").onclick=()=>$("leaveModal").classList.add("hidden");$("leaveSubmit").onclick=async()=>{let startDate=$("leaveStart").value;if(!startDate)return setMessage("leaveMsg","Tanggal wajib diisi.",true);try{await addDoc(collection(db,"leaveRequests"),{nis:String(currentProfile.nis),name:currentProfile.name||"",kelas:classNow(),type:$("leaveType").value,startDate,endDate:$("leaveEnd").value||startDate,note:$("leaveNote").value.trim(),status:"Menunggu",createdAt:new Date().toISOString()});setMessage("leaveMsg","Pengajuan berhasil dikirim.");setTimeout(()=>{$("leaveModal").classList.add("hidden");renderAttendanceV15()},400)}catch(e){setMessage("leaveMsg","Pengajuan belum dapat disimpan.",true)}}
async function renderAdminAttendance(){await loadAtt(false);let p=leaveRows.filter(x=>!x.status||x.status==="Menunggu");$("adminLeaves").innerHTML=p.length?p.map(x=>`<div class="metric-row"><div><b>${escapeHtml(x.name||x.nis)} · ${escapeHtml(x.type)}</b><small>${escapeHtml(x.startDate)} · ${escapeHtml(x.note||"")}</small></div><span class="badge">Menunggu</span></div>`).join(""):'<div class="empty">Belum ada pengajuan.</div>'}
$("camBtn").onclick=()=>alert("Kamera Absensi akan diaktifkan setelah modul kehadiran stabil.");$("uploadAttBtn").onclick=()=>alert("Upload Excel Kehadiran disiapkan untuk tahap berikutnya.");$("manualAttBtn").onclick=()=>alert("Input dan koreksi manual disiapkan untuk tahap berikutnya.");

function renderAttendanceCalendar(){
  const el=$("attCalendar"); if(!el)return;
  const map={}; attRows.forEach(x=>{if(x.date)map[x.date]=x.status||""});
  const now=new Date(), y=now.getFullYear(), m=now.getMonth();
  const first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
  let h=["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map(x=>`<div class="att-day" style="background:transparent;color:#667085">${x}</div>`).join("");
  h += Array(first).fill('<div></div>').join("");
  for(let d=1;d<=days;d++){let k=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,s=map[k]||"";h+=`<div class="att-day ${escapeAttr(s)}" title="${escapeAttr(s||"Belum tercatat")}">${d}</div>`}
  el.innerHTML=h;
}

document.querySelectorAll("[data-student-go]").forEach(b=>b.addEventListener("click",()=>{
  showPage(b.dataset.studentGo);
  closeSidebar();
}));
function syncStudentBottom(page){
  const student=!!(currentProfile&&currentProfile.role==="student");
  const n=$("studentBottomNav");
  if(student){
    document.querySelector(".sidebar")?.classList.remove("open");
    $("sidebarBackdrop")?.classList.add("hidden");
  }
  if(!n)return;
  n.classList.toggle("hidden",!student);
  n.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.studentGo===page));
}
