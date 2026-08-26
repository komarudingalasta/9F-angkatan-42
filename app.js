(function(){
"use strict";
const $=id=>document.getElementById(id);
const APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbxQWu2CkXHqdSilxwkxLTDN90o0gsFrR_jWE3NbXLHCZAe2Q4INlpO7oW8d1uB0-HyA/exec";
const STUDENT_DOMAIN="siswa.pakkom.local";

let app=null,auth=null,db=null,currentUser=null,profile=null;
let records=[],summaries=[],users=[],subjects=[],attendance=[],leaveRequests=[],classRoster=[];
let gradeImportRows=[],attendanceImportRows=[],preparedPhoto=null;
let charts={};

function msg(id,text,type=""){const el=$(id);if(!el)return;el.textContent=text||"";el.className="message"+(type?" "+type:"")}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function slug(v){return String(v??"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")}
function fmt(v){return Number.isFinite(Number(v))?Number(v).toFixed(1):"—"}
function today(){return new Date().toISOString().slice(0,10)}
function studentEmail(nis){return `${String(nis).trim()}@${STUDENT_DOMAIN}`}
function isAdmin(){return profile?.role==="admin"}
function isStudent(){return profile?.role==="student"}
function rowAvg(r){const vals=Object.values(r?.scores||{}).map(Number).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
function semesterRank(v){const m=String(v??"").match(/\d+/);return m?Number(m[0]):0}
function latestRecord(rows){return [...rows].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)).at(-1)||null}
function unique(arr){return [...new Set(arr.filter(Boolean))]}
function scoreKeys(rows){return unique(rows.flatMap(r=>Object.keys(r.scores||{}))).sort()}
function subjectLabel(k){return k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
function normalizeStatus(v){const x=String(v??"").trim().toUpperCase();return ({H:"Hadir",HADIR:"Hadir",S:"Sakit",SAKIT:"Sakit",I:"Izin",IZIN:"Izin",A:"Alpa",ALPA:"Alpa"})[x]||null}
function attendanceId(nis,date){return `${slug(nis)}_${date}`.slice(0,220)}

function setBoot(text,ok=false){const el=$("bootStatus");if(el){el.textContent=text;el.style.color=ok?"#16803c":"#7b8798"}}
function hideBoot(){ $("bootScreen")?.classList.add("hidden"); }
function showLogin(){ $("app")?.classList.add("hidden"); $("loginScreen")?.classList.remove("hidden"); hideBoot(); }
function showApp(){ $("loginScreen")?.classList.add("hidden"); $("app")?.classList.remove("hidden"); hideBoot(); }

const NAV_ADMIN=[
  ["adminDashboard","⌂","Ringkasan","Ringkasan","Kondisi kelas hari ini"],
  ["adminAcademic","▦","Akademik","Akademik","Nilai dan perkembangan siswa"],
  ["adminAttendance","✓","Kehadiran","Kehadiran","Absensi, pengajuan, dan rekap"],
  ["adminSettings","⚙","Pengaturan","Pengaturan","Petugas kehadiran"]
];
const NAV_STUDENT=[
  ["studentAcademic","▦","Akademik","Akademik","Perkembangan akademik saya"],
  ["studentAttendance","✓","Kehadiran","Kehadiran","Rekap dan pengajuan"]
];

function buildNavigation(){
  const nav=isAdmin()?NAV_ADMIN:NAV_STUDENT;
  $("desktopNav").innerHTML=nav.map(([page,icon,label])=>`<button class="nav-btn" data-page="${page}">${icon} ${label}</button>`).join("");
  const mobile=$("mobileNav");
  mobile.className=`mobile-nav ${isAdmin()?"admin":"student"}`;
  mobile.innerHTML=nav.map(([page,icon,label])=>`<button data-page="${page}"><span>${icon}</span>${label}</button>`).join("");
}
function setActiveNav(page){
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
}
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const el=$(page+"Page"); if(!el)return;
  el.classList.remove("hidden"); setActiveNav(page);
  const nav=(isAdmin()?NAV_ADMIN:NAV_STUDENT).find(x=>x[0]===page);
  if(nav){$("pageTitle").textContent=nav[3];$("pageSubtitle").textContent=nav[4]}
  if(page==="adminDashboard")renderAdminDashboard();
  if(page==="adminAcademic")renderAdminAcademic();
  if(page==="adminAttendance")renderAdminAttendance();
  if(page==="adminSettings")renderSettings();
  if(page==="studentAcademic")renderStudentAcademic();
  if(page==="studentAttendance")renderStudentAttendance();
  if(page==="studentHelper")renderHelperAttendance();
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-page]");
  if(b){e.preventDefault();showPage(b.dataset.page)}
});

function setupTabs(containerId){
  $(containerId)?.addEventListener("click",e=>{
    const b=e.target.closest("[data-tab]"); if(!b)return;
    const root=$(containerId).parentElement;
    root.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active",x===b));
    root.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("hidden",p.id!==b.dataset.tab));
    if(b.dataset.tab==="attendanceRecapPanel")renderRecap();
    if(b.dataset.tab==="attendanceRequestsPanel")renderLeaveRequestsAdmin();
  });
}
setupTabs("academicTabs"); setupTabs("attendanceTabs");

async function init(){
  try{
    if(!window.firebase||!window.firebaseConfig)throw new Error("Library Firebase belum tersedia.");
    app=firebase.apps.length?firebase.app():firebase.initializeApp(firebaseConfig);
    auth=app.auth(); db=app.firestore();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    setBoot("Sistem login siap.",true);
    auth.onAuthStateChanged(handleAuthState);
  }catch(e){
    console.error(e);setBoot("Sistem gagal dimuat.");msg("loginMessage",e.message,"error");showLogin();
  }
}
async function handleAuthState(user){
  currentUser=user;
  if(!user){profile=null;showLogin();return}
  try{
    msg("loginMessage","Login berhasil. Memuat profil…");
    const snap=await db.collection("users").doc(user.uid).get();
    if(!snap.exists)throw new Error("Profil akses belum tersedia di Firestore.");
    profile={uid:user.uid,...snap.data()};
    await loadRoleData();
    applyRole();
    showApp();
    msg("loginMessage","");
  }catch(e){
    console.error(e);msg("loginMessage","Gagal memuat akun: "+e.message,"error");
    try{await auth.signOut()}catch(_){}
  }
}
function applyRole(){
  $("sidebarUserName").textContent=profile?.name||profile?.email||"Akun";
  $("sidebarRole").textContent=isAdmin()?"Administrator":"Siswa";
  buildNavigation();
  if(isAdmin())showPage("adminDashboard");else showPage("studentAcademic");
}
async function logout(){try{await auth.signOut()}catch(e){console.error(e)}}
$("desktopLogoutBtn").addEventListener("click",logout);
$("mobileLogoutBtn").addEventListener("click",logout);

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("loginId").value.trim(),pw=$("loginPassword").value;
  if(!id||!pw)return msg("loginMessage","Masukkan email/NIS dan password.","error");
  const email=id.includes("@")?id:studentEmail(id);
  msg("loginMessage","Memeriksa akun…");
  try{await auth.signInWithEmailAndPassword(email,pw)}
  catch(e){console.error(e);msg("loginMessage",friendlyAuthError(e),"error")}
});
$("togglePassword").addEventListener("click",()=>{$("loginPassword").type=$("loginPassword").type==="password"?"text":"password"});
$("forgotPasswordBtn").addEventListener("click",async()=>{
  const id=$("loginId").value.trim();
  if(!id.includes("@"))return msg("loginMessage","Reset password siswa dilakukan oleh admin.","error");
  try{await auth.sendPasswordResetEmail(id);msg("loginMessage","Email reset password sudah dikirim.","success")}
  catch(e){msg("loginMessage",friendlyAuthError(e),"error")}
});
function friendlyAuthError(e){
  const c=e?.code||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found"))return"Email/NIS atau password salah.";
  if(c.includes("network-request-failed"))return"Koneksi ke Firebase bermasalah.";
  if(c.includes("too-many-requests"))return"Terlalu banyak percobaan. Coba lagi beberapa saat.";
  return e?.message||"Login gagal.";
}

async function fetchCollection(label, queryRef){
  try{
    const snap=await queryRef.get();
    return snap.docs.map(d=>{
      const data=d.data();
      return label==="users"
        ? {id:d.id,...data,uid:d.id}
        : {id:d.id,...data};
    });
  }catch(e){
    console.error("Firestore access failed:",label,e);
    const err=new Error(`Akses Firestore ditolak pada ${label}: ${e.message}`);
    err.code=e.code; throw err;
  }
}
async function loadRoleData(){
  records=[];summaries=[];users=[];attendance=[];leaveRequests=[];classRoster=[];subjects=[];
  if(isAdmin()){
    // Sequential on purpose: if Rules reject something, UI tells us the exact collection.
    records=await fetchCollection("records",db.collection("records"));
    summaries=await fetchCollection("studentSummaries",db.collection("studentSummaries"));
    users=await fetchCollection("users",db.collection("users"));
    attendance=await fetchCollection("attendance",db.collection("attendance"));
    leaveRequests=await fetchCollection("leaveRequests",db.collection("leaveRequests"));
    classRoster=await fetchCollection("classRoster",db.collection("classRoster"));
    subjects=await fetchCollection("subjects",db.collection("subjects"));
  }else{
    const nis=String(profile.nis||"");
    records=await fetchCollection("records",db.collection("records").where("nis","==",nis));
    summaries=await fetchCollection("studentSummaries",db.collection("studentSummaries").where("nis","==",nis));
    attendance=await fetchCollection("attendance",db.collection("attendance").where("nis","==",nis));
    leaveRequests=await fetchCollection("leaveRequests",db.collection("leaveRequests").where("nis","==",nis));
  }
}
async function refreshAdminData(){await loadRoleData();renderAdminDashboard()}

/* ADMIN DASHBOARD */
function studentProfiles(){return users.filter(u=>u.role==="student")}
function renderAdminDashboard(){
  $("adminGreeting").textContent=(profile?.name||"Admin").split(" ")[0];
  const students=studentProfiles();$("dashStudentCount").textContent=students.length;
  const latestByNis=new Map();
  records.forEach(r=>{const n=String(r.nis);const old=latestByNis.get(n);if(!old||semesterRank(r.semester)>=semesterRank(old.semester))latestByNis.set(n,r)});
  const avgs=[...latestByNis.values()].map(rowAvg).filter(Number.isFinite);
  $("dashAverage").textContent=avgs.length?fmt(avgs.reduce((a,b)=>a+b,0)/avgs.length):"—";
  const todayRows=finalAttendanceRows().filter(x=>x.date===today());
  $("dashPresent").textContent=todayRows.filter(x=>x.status==="Hadir").length;
  $("dashAttendanceState").textContent=todayRows.length?`${todayRows.length} siswa tercatat`:"Belum diabsen";
  const pending=leaveRequests.filter(x=>x.status==="Menunggu").length;$("dashPending").textContent=pending;
  renderAttentionList(); renderTodayAttendanceSummary(todayRows); renderAdminTrend();
}

function renderAttentionList(){
  const roster=activeRoster(),month=today().slice(0,7),byNis=new Map();
  records.forEach(r=>{const n=String(r.nis);if(!byNis.has(n))byNis.set(n,[]);byNis.get(n).push(r)});
  const issues=[];
  roster.forEach(s=>{
    const nis=String(s.nis),att=finalAttendanceRows().filter(x=>String(x.nis)===nis&&x.date?.startsWith(month));
    const alpa=att.filter(x=>x.status==="Alpa").length,total=att.length,hadir=att.filter(x=>x.status==="Hadir").length,rate=total?hadir/total*100:100;
    const rs=(byNis.get(nis)||[]).sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)),last=rs.at(-1),prev=rs.at(-2),la=rowAvg(last),pa=rowAvg(prev),reasons=[];
    if(alpa>=3)reasons.push(`Alpa ${alpa}× bulan ini`);
    if(total>=5&&rate<90)reasons.push(`Kehadiran ${Math.round(rate)}%`);
    if(Number.isFinite(la)&&Number.isFinite(pa)&&la<=pa-5)reasons.push(`Nilai turun ${fmt(pa-la)} poin`);
    if(reasons.length)issues.push({name:s.name||s.nama||nis,nis,reasons});
  });
  $("attentionCount").textContent=issues.length;
  $("attentionList").innerHTML=issues.slice(0,6).map(x=>`<div class="attention-row"><div><b>${esc(x.name)}</b><small>NIS ${esc(x.nis)}</small></div><span>${esc(x.reasons.join(" · "))}</span></div>`).join("")||'<div class="empty-state">✓ Tidak ada indikator perhatian utama saat ini.</div>';
}
function renderTodayAttendanceSummary(rows){
  const h=rows.filter(x=>x.status==="Hadir").length,s=rows.filter(x=>x.status==="Sakit").length,i=rows.filter(x=>x.status==="Izin").length,a=rows.filter(x=>x.status==="Alpa").length;
  $("todayAttendanceTitle").textContent=rows.length?"Kehadiran sudah tercatat":"Kehadiran belum diisi";
  $("todayAttendanceSummary").innerHTML=rows.length?`<div><strong>${h}</strong><small>Hadir</small></div><div><strong>${s}</strong><small>Sakit</small></div><div><strong>${i}</strong><small>Izin</small></div><div><strong>${a}</strong><small>Alpa</small></div>`:`<div class="empty-state wide-empty">Belum ada data kehadiran hari ini.</div>`;
}

function renderAdminTrend(){
  const semesters=unique(records.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b));
  const vals=semesters.map(s=>{const rs=records.filter(r=>String(r.semester)===String(s));const a=rs.map(rowAvg).filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null});
  charts.admin?.destroy();const ctx=$("adminTrendChart");if(!ctx)return;
  charts.admin=new Chart(ctx,{type:"line",data:{labels:semesters,datasets:[{label:"Rata-rata kelas",data:vals,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});
}

/* ADMIN ACADEMIC */
function renderAdminAcademic(){
  const classes=unique(records.map(r=>r.kelas)).sort(),sems=unique(records.map(r=>r.semester)).sort((a,b)=>semesterRank(a)-semesterRank(b));
  fillSelect("academicClassFilter",classes,"Semua kelas");fillSelect("academicSemesterFilter",sems,"Semua semester");
  renderAcademicTable();renderSubjects();
}
function fillSelect(id,vals,first){
  const el=$(id);if(!el)return;const old=el.value;
  el.innerHTML=`<option value="">${esc(first)}</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(vals.includes(old))el.value=old;
}
function renderAcademicTable(){
  const cls=$("academicClassFilter").value,sem=$("academicSemesterFilter").value,q=$("academicSearch").value.trim().toLowerCase();
  const rows=records.filter(r=>(!cls||r.kelas===cls)&&(!sem||String(r.semester)===sem)&&(!q||`${r.nama} ${r.nis}`.toLowerCase().includes(q)))
    .sort((a,b)=>(a.kelas||"").localeCompare(b.kelas||"")||(a.nama||"").localeCompare(b.nama||""));
  $("academicTableBody").innerHTML=rows.map(r=>`<tr><td>${esc(r.nis)}</td><td>${esc(r.nama)}</td><td>${esc(r.kelas)}</td><td>${esc(r.semester)}</td><td>${fmt(rowAvg(r))}</td><td><div class="row-actions"><button class="btn ghost compact" type="button" data-grade-edit="${esc(r.id)}">Edit</button><button class="btn danger compact" type="button" data-grade-delete="${esc(r.id)}">Hapus</button></div></td></tr>`).join("")||'<tr><td colspan="6">Belum ada data.</td></tr>';
}
["academicClassFilter","academicSemesterFilter","academicSearch"].forEach(id=>$(id).addEventListener(id==="academicSearch"?"input":"change",renderAcademicTable));
function renderSubjects(){
  const keys=scoreKeys(records);$("subjectList").innerHTML=keys.map(k=>`<span class="chip">${esc(subjectLabel(k))}</span>`).join("")||'<span class="muted">Belum ada mata pelajaran.</span>';
}
function parseWorkbook(file){
  return new Promise((resolve,reject)=>{
    const rd=new FileReader();rd.onerror=reject;rd.onload=()=>{
      try{const wb=XLSX.read(rd.result,{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];resolve(XLSX.utils.sheet_to_json(ws,{defval:""}))}
      catch(e){reject(e)}
    };rd.readAsArrayBuffer(file);
  });
}
function keyMap(row){const m={};Object.keys(row).forEach(k=>m[String(k).trim().toLowerCase()]=row[k]);return m}
function normalizeScoreKey(k){return String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")}
$("gradeFile").addEventListener("change",async()=>{
  gradeImportRows=[];const f=$("gradeFile").files[0];if(!f)return;
  try{
    const arr=await parseWorkbook(f);
    gradeImportRows=arr.map(row=>{
      const m=keyMap(row);const nis=String(m.nis||m.nisn||"").trim(),nama=String(m.nama||m.name||"").trim(),kelas=String(m.kelas||m.class||"").trim(),semester=String(m.semester||m.sem||"").trim();
      const scores={};Object.keys(row).forEach(k=>{const lk=String(k).trim().toLowerCase();if(["nis","nisn","nama","name","kelas","class","semester","sem"].includes(lk))return;const n=Number(row[k]);if(Number.isFinite(n))scores[normalizeScoreKey(k)]=n});
      return {nis,nama,kelas,semester,scores,valid:!!(nis&&nama&&kelas&&semester&&Object.keys(scores).length)}
    });
    const valid=gradeImportRows.filter(x=>x.valid).length;
    $("gradePreview").textContent=`${arr.length} baris dibaca · ${valid} valid`;
    $("saveGradeImportBtn").disabled=!valid;
  }catch(e){msg("gradeImportMessage","Gagal membaca file: "+e.message,"error")}
});
$("saveGradeImportBtn").addEventListener("click",async()=>{
  const rows=gradeImportRows.filter(x=>x.valid);if(!rows.length)return;
  $("saveGradeImportBtn").disabled=true;msg("gradeImportMessage","Menyimpan…");
  try{
    const latest=new Map();
    rows.forEach(r=>latest.set(`${String(r.nis)}__${String(r.semester)}`,r));
    let batch=db.batch(),count=0;
    latest.forEach(r=>{
      const id=`${slug(r.nis)}_${slug(r.semester)}`.slice(0,220);
      batch.set(db.collection("records").doc(id),{nis:r.nis,nama:r.nama,kelas:r.kelas,semester:r.semester,scores:r.scores,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      count++;
    });
    await batch.commit();
    await loadRoleData();await rebuildSummaries();await syncRoster();renderAdminAcademic();renderAdminDashboard();
    msg("gradeImportMessage",`${count} data berhasil disimpan.`,"success");
  }catch(e){msg("gradeImportMessage","Gagal menyimpan: "+e.message,"error")}
  finally{$("saveGradeImportBtn").disabled=false}
});

let editingGradeId=null;

$("academicTableBody").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-grade-edit]");
  const del=e.target.closest("[data-grade-delete]");
  if(edit){
    const r=records.find(x=>x.id===edit.dataset.gradeEdit);
    if(!r)return;
    editingGradeId=r.id;
    $("gradeEditTitle").textContent=`Edit Nilai · ${r.nama||r.nis}`;
    $("gradeEditMeta").textContent=`NIS ${r.nis} · ${r.kelas} · Semester ${r.semester}`;
    const keys=Object.keys(r.scores||{}).sort();
    $("gradeEditFields").innerHTML=keys.map(k=>`<label>${esc(subjectLabel(k))}<input type="number" min="0" max="100" step="0.01" data-grade-key="${esc(k)}" value="${esc(r.scores[k])}"></label>`).join("")||'<div class="muted">Tidak ada nilai mapel.</div>';
    $("gradeEditMessage").textContent="";
    $("gradeEditModal").classList.remove("hidden");
    return;
  }
  if(del){
    const r=records.find(x=>x.id===del.dataset.gradeDelete);
    if(!r)return;
    if(!confirm(`Hapus nilai ${r.nama||r.nis} untuk Semester ${r.semester}?\\n\\nAkun siswa dan semester lainnya tidak akan dihapus.`))return;
    try{
      await db.collection("records").doc(r.id).delete();
      await loadRoleData();await rebuildSummaries();renderAdminAcademic();renderAdminDashboard();
    }catch(err){alert("Gagal menghapus nilai: "+err.message)}
  }
});

$("closeGradeEditBtn").addEventListener("click",()=>$("gradeEditModal").classList.add("hidden"));
$("saveGradeEditBtn").addEventListener("click",async()=>{
  const r=records.find(x=>x.id===editingGradeId);if(!r)return;
  const scores={...r.scores};
  $("gradeEditFields").querySelectorAll("[data-grade-key]").forEach(inp=>{
    const n=Number(inp.value);if(Number.isFinite(n))scores[inp.dataset.gradeKey]=n;
  });
  $("saveGradeEditBtn").disabled=true;
  try{
    await db.collection("records").doc(r.id).update({scores,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await loadRoleData();await rebuildSummaries();renderAdminAcademic();renderAdminDashboard();
    $("gradeEditModal").classList.add("hidden");
  }catch(err){msg("gradeEditMessage","Gagal menyimpan: "+err.message,"error")}
  finally{$("saveGradeEditBtn").disabled=false}
});

async function rebuildSummaries(){
  if(!isAdmin())return;
  const byNis=new Map();records.forEach(r=>{const n=String(r.nis);if(!byNis.has(n))byNis.set(n,[]);byNis.get(n).push(r)});
  const currentClass=new Map();byNis.forEach((rs,n)=>{const l=latestRecord(rs);if(l?.kelas)currentClass.set(n,l.kelas)});
  const existing=await db.collection("studentSummaries").get();let del=db.batch();existing.docs.forEach(d=>del.delete(d.ref));if(existing.docs.length)await del.commit();
  let batch=db.batch(),count=0;
  for(const [nis,rs] of byNis){
    const cls=currentClass.get(nis);const peers=[...currentClass.entries()].filter(([,c])=>c===cls).map(([n])=>n);
    for(const r of rs){
      const cohort=peers.map(p=>(byNis.get(p)||[]).find(x=>String(x.semester)===String(r.semester))).filter(Boolean);
      const ranked=cohort.map(x=>({nis:String(x.nis),a:rowAvg(x)||0})).sort((a,b)=>b.a-a.a);
      const rank=ranked.findIndex(x=>x.nis===String(nis))+1;
      const id=`${slug(nis)}_${slug(r.semester)}`;
      batch.set(db.collection("studentSummaries").doc(id),{nis,nama:r.nama||"",kelas:cls,semester:r.semester,studentAverage:rowAvg(r),rank:rank||null,classSize:ranked.length,cohortMode:"current_class",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      count++;if(count>=400){await batch.commit();batch=db.batch();count=0}
    }
  }
  if(count)await batch.commit();
}

/* ATTENDANCE SHARED */
function activeRoster(){
  if(classRoster.length)return [...classRoster].sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  return studentProfiles().map(u=>({nis:String(u.nis||""),name:u.name||"",kelas:u.kelas||""})).filter(x=>x.nis).sort((a,b)=>a.name.localeCompare(b.name));
}

function attendancePriority(r){
  if(r?.source==="Pengajuan") return 30;
  if(r?.source==="Manual") return 20;
  if(r?.source==="Petugas Siswa") return 15;
  if(r?.source==="Upload") return 10;
  return 1;
}

function finalAttendanceRows(rows=attendance){
  const map=new Map();
  rows.forEach(r=>{
    if(!r?.nis || !r?.date) return;
    const key=`${String(r.nis)}__${String(r.date)}`;
    const old=map.get(key);
    if(!old || attendancePriority(r)>=attendancePriority(old)){
      map.set(key,r);
    }
  });
  return [...map.values()];
}

function recordForAttendance(nis,date){return finalAttendanceRows().find(x=>String(x.nis)===String(nis)&&x.date===date)}
function attendanceRowHtml(s,date,helper=false){
  const old=recordForAttendance(s.nis,date);
  const locked=helper&&old?.source==="Pengajuan";
  const rawStatus=old?.status||"Hadir";
  const status=helper?(rawStatus==="Hadir"?"Hadir":(locked?rawStatus:"Alpa")):rawStatus;
  const choices=helper?["Hadir","Alpa"]:["Hadir","Sakit","Izin","Alpa"];
  const label=x=>helper&&x==="Alpa"?"Tidak Hadir":x;
  return `<div class="att-row ${locked?"locked":""}" data-nis="${esc(s.nis)}" data-status="${esc(status)}" data-locked="${locked?"1":"0"}">
    <div><b>${esc(s.name||s.nama||"-")}</b><small>NIS ${esc(s.nis)}${locked?" · status dari pengajuan disetujui":helper?" · klik untuk Hadir / Tidak Hadir":""}</small><div class="status-picker hidden">${choices.map(x=>`<button type="button" data-status-pick="${x}" data-status-label="${label(x)}">${label(x)}</button>`).join("")}</div></div>
    <span class="status-pill">${esc(helper&&!locked?label(status):status)}</span></div>`;
}
function bindAttendanceList(id,onChange){
  $(id).onclick=e=>{
    const row=e.target.closest(".att-row");if(!row||row.dataset.locked==="1")return;
    const pick=e.target.closest("[data-status-pick]");
    if(pick){e.stopPropagation();row.dataset.status=pick.dataset.statusPick;row.querySelector(".status-pill").textContent=pick.dataset.statusLabel||pick.dataset.statusPick;row.querySelector(".status-picker").classList.add("hidden");onChange?.();return}
    row.querySelector(".status-picker").classList.toggle("hidden");
  };
}
bindAttendanceList("attendanceList",updateAttendanceCounts);
bindAttendanceList("helperAttendanceList");

function updateAttendanceCounts(){
  const vals=[...$("attendanceList").querySelectorAll(".att-row")].map(r=>r.dataset.status);
  $("countH").textContent=vals.filter(x=>x==="Hadir").length;$("countS").textContent=vals.filter(x=>x==="Sakit").length;$("countI").textContent=vals.filter(x=>x==="Izin").length;$("countA").textContent=vals.filter(x=>x==="Alpa").length;
}
async function refreshAttendanceViews(messageId="",successText=""){
  // Always reload Firestore first; recap must never render from stale in-memory attendance.
  await loadRoleData();
  renderAttendanceToday();
  renderLeaveRequestsAdmin();
  renderRecap();
  renderAdminDashboard();
  if(messageId && successText)msg(messageId,successText,"success");
}

function renderAdminAttendance(){
  if(!$("attendanceDate").value)$("attendanceDate").value=today();
  if(!$("recapMonth").value)$("recapMonth").value=today().slice(0,7);
  renderAttendanceToday();renderLeaveRequestsAdmin();renderRecap();
}
$("attendanceDate").addEventListener("change",renderAttendanceToday);
function renderAttendanceToday(){
  const d=$("attendanceDate").value||today(),list=activeRoster();
  $("attendanceSavedBanner").classList.toggle("hidden",finalAttendanceRows().filter(x=>x.date===d).length===0);
  $("attendanceList").innerHTML=list.map(s=>attendanceRowHtml(s,d,false)).join("")||'<div class="muted">Belum ada daftar siswa.</div>';updateAttendanceCounts();
}
$("saveAttendanceBtn").addEventListener("click",async()=>{
  const d=$("attendanceDate").value||today(),rows=[...$("attendanceList").querySelectorAll(".att-row")],roster=activeRoster();
  msg("attendanceSaveMessage","Menyimpan…");
  try{
    let batch=db.batch(),count=0;
    rows.forEach(row=>{const nis=row.dataset.nis,s=roster.find(x=>String(x.nis)===nis),old=recordForAttendance(nis,d);batch.set(db.collection("attendance").doc(attendanceId(nis,d)),{nis,name:s?.name||"",kelas:s?.kelas||"",date:d,status:row.dataset.status||"Hadir",note:old?.note||"",source:old?.source==="Pengajuan"?"Pengajuan":"Manual",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});count++});
    await batch.commit();
    await refreshAttendanceViews("attendanceSaveMessage",`${count} siswa disimpan. Rekap sudah diperbarui.`);

  }catch(e){msg("attendanceSaveMessage","Gagal menyimpan: "+e.message,"error")}
});
function renderLeaveRequestsAdmin(){
  const rows=[...leaveRequests].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  const pending=rows.filter(x=>x.status==="Menunggu").length;$("requestBadge").textContent=pending;$("requestBadge").classList.toggle("hidden",!pending);
  $("leaveRequestList").innerHTML=rows.map(x=>`<div class="request-row"><div><b>${esc(x.name||x.nis)} · ${esc(x.type)}</b><small>${esc(x.startDate)}${x.endDate&&x.endDate!==x.startDate?" s.d. "+esc(x.endDate):""} · ${esc(x.note||"Tanpa keterangan")}</small>${x.attachmentUrl?`<a class="evidence-link" href="${esc(x.attachmentUrl)}" target="_blank" rel="noopener">📎 Lihat Bukti</a>`:""}</div><div class="request-actions">${x.status==="Menunggu"?`<button class="btn primary compact" data-approve="${x.id}">Setujui</button><button class="btn ghost compact" data-reject="${x.id}">Tolak</button>`:`<span class="chip">${esc(x.status)}</span>`}</div></div>`).join("")||'<div class="muted">Belum ada pengajuan.</div>';
}
$("leaveRequestList").addEventListener("click",async e=>{
  const approve=e.target.closest("[data-approve]"),reject=e.target.closest("[data-reject]");if(!approve&&!reject)return;
  const id=(approve||reject).dataset.approve||(approve||reject).dataset.reject;const req=leaveRequests.find(x=>x.id===id);if(!req)return;
  try{
    if(approve){await approveLeave(req)}else await db.collection("leaveRequests").doc(id).update({status:"Ditolak",updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await refreshAttendanceViews();
  }catch(err){alert("Gagal memproses pengajuan: "+err.message)}
});
function dateRange(start,end){const arr=[],a=new Date(start+"T00:00:00"),b=new Date((end||start)+"T00:00:00");for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))arr.push(d.toISOString().slice(0,10));return arr}
async function approveLeave(req){
  const batch=db.batch();

  for(const d of dateRange(req.startDate,req.endDate)){
    const canonicalId=attendanceId(req.nis,d);

    // Bersihkan dokumen duplikat lama pada siswa + tanggal yang sama.
    attendance
      .filter(x=>String(x.nis)===String(req.nis) && x.date===d && x.id!==canonicalId)
      .forEach(x=>batch.delete(db.collection("attendance").doc(x.id)));

    // Status dari pengajuan menjadi status final untuk tanggal tersebut.
    batch.set(
      db.collection("attendance").doc(canonicalId),
      {
        nis:String(req.nis),
        name:req.name||"",
        kelas:req.kelas||"",
        date:d,
        status:req.type,
        note:req.note||"",
        source:"Pengajuan",
        leaveRequestId:req.id,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },
      {merge:true}
    );
  }

  batch.update(
    db.collection("leaveRequests").doc(req.id),
    {
      status:"Disetujui",
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    }
  );

  await batch.commit();
}
$("recapMonth").addEventListener("change",renderRecap);
function renderRecap(){
  const month=$("recapMonth").value||today().slice(0,7),roster=activeRoster();
  $("recapBody").innerHTML=roster.map(s=>{const a=finalAttendanceRows().filter(x=>String(x.nis)===String(s.nis)&&x.date?.startsWith(month));const h=a.filter(x=>x.status==="Hadir").length,sa=a.filter(x=>x.status==="Sakit").length,i=a.filter(x=>x.status==="Izin").length,al=a.filter(x=>x.status==="Alpa").length,total=h+sa+i+al,p=total?Math.round(h/total*100):0;return `<tr><td>${esc(s.nis)}</td><td>${esc(s.name)}</td><td>${h}</td><td>${sa}</td><td>${i}</td><td>${al}</td><td>${p}%</td></tr>`}).join("")||'<tr><td colspan="7">Belum ada data.</td></tr>';
}

/* ATTENDANCE IMPORT */
$("attendanceFile").addEventListener("change",async()=>{
  attendanceImportRows=[];const f=$("attendanceFile").files[0],month=$("attendanceUploadMonth").value;
  if(!f||!month)return msg("attendanceImportMessage","Pilih bulan dan file terlebih dahulu.","error");
  try{
    const arr=await parseWorkbook(f),[year,mon]=month.split("-").map(Number),max=new Date(year,mon,0).getDate(),roster=new Map(activeRoster().map(x=>[String(x.nis),x]));
    arr.forEach((row,ri)=>{const m=keyMap(row),nis=String(m.nis||m.nisn||"").trim(),student=roster.get(nis);for(let day=1;day<=max;day++){const raw=m[String(day)];if(raw===undefined||String(raw).trim()==="")continue;const status=normalizeStatus(raw);if(status&&student)attendanceImportRows.push({nis,date:`${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`,status,student})}});
    $("attendancePreview").textContent=`${attendanceImportRows.length} catatan kehadiran siap disimpan.`;$("saveAttendanceImportBtn").disabled=!attendanceImportRows.length;
  }catch(e){msg("attendanceImportMessage","Gagal membaca: "+e.message,"error")}
});
$("saveAttendanceImportBtn").addEventListener("click",async()=>{
  if(!attendanceImportRows.length)return;msg("attendanceImportMessage","Menyimpan…");$("saveAttendanceImportBtn").disabled=true;
  try{let batch=db.batch(),n=0;for(const x of attendanceImportRows){batch.set(db.collection("attendance").doc(attendanceId(x.nis,x.date)),{nis:x.nis,name:x.student.name||"",kelas:x.student.kelas||"",date:x.date,status:x.status,note:"",source:"Upload",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});n++;if(n%400===0){await batch.commit();batch=db.batch()}}if(n%400)await batch.commit();await loadRoleData();renderRecap();msg("attendanceImportMessage",`${n} catatan disimpan.`,"success")}
  catch(e){msg("attendanceImportMessage","Gagal menyimpan: "+e.message,"error")}finally{$("saveAttendanceImportBtn").disabled=false}
});


/* MANUAL STUDENT */
function randomStudentPassword(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out="";
  for(let i=0;i<8;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

$("generateStudentPasswordBtn")?.addEventListener("click",()=>{
  $("manualStudentPassword").value=randomStudentPassword();
});

$("manualStudentForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!isAdmin())return;

  const nis=String($("manualStudentNis").value||"").trim();
  const name=String($("manualStudentName").value||"").trim();
  const kelas=String($("manualStudentClass").value||"").trim();
  const password=String($("manualStudentPassword").value||"");

  if(!nis||!name||!kelas||!password){
    return msg("manualStudentMessage","Lengkapi seluruh data siswa.","error");
  }
  if(password.length<6){
    return msg("manualStudentMessage","Password minimal 6 karakter.","error");
  }
  const duplicate=users.find(u=>String(u.nis||"").trim()===nis);
  if(duplicate){
    return msg("manualStudentMessage",`NIS ${nis} sudah digunakan oleh ${duplicate.name||"siswa lain"}.`,"error");
  }

  const email=studentEmail(nis);
  const btn=$("saveManualStudentBtn");
  btn.disabled=true;
  msg("manualStudentMessage","Membuat akun siswa…");

  let secondaryApp=null;
  try{
    const secondaryName="student-create-"+Date.now();
    secondaryApp=firebase.initializeApp(firebaseConfig,secondaryName);
    const secondaryAuth=secondaryApp.auth();

    const cred=await secondaryAuth.createUserWithEmailAndPassword(email,password);
    const uid=cred.user.uid;

    const batch=db.batch();
    batch.set(db.collection("users").doc(uid),{
      nis,name,kelas,email,role:"student",
      defaultPassword:true,
      attendanceHelper:false,
      attendanceHelperClass:"",
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});

    batch.set(db.collection("classRoster").doc(slug(nis)),{
      nis,name,kelas,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});

    await batch.commit();
    await secondaryAuth.signOut();

    await loadRoleData();
    renderSettings();
    renderAdminDashboard();

    $("manualStudentForm").reset();
    $("manualStudentClass").value="9F";
    $("manualStudentPassword").value="123456";

    msg("manualStudentMessage",`${name} berhasil ditambahkan. Login siswa menggunakan NIS ${nis}.`,"success");
  }catch(err){
    console.error("Manual student create error:",err);
    let text=err?.message||String(err);
    const code=err?.code||"";
    if(code.includes("email-already-in-use"))text=`NIS ${nis} sudah memiliki akun Authentication.`;
    else if(code.includes("weak-password"))text="Password terlalu lemah. Gunakan minimal 6 karakter.";
    else if(code.includes("operation-not-allowed"))text="Login Email/Password belum diaktifkan di Firebase Authentication.";
    else if(code.includes("permission-denied"))text="Firestore menolak pembuatan profil siswa. Pastikan akun yang login adalah admin.";
    msg("manualStudentMessage","Gagal menambah siswa: "+text,"error");
  }finally{
    try{ if(secondaryApp) await secondaryApp.delete(); }catch(_){}
    btn.disabled=false;
  }
});


/* SETTINGS / HELPERS */
async function syncRoster(){
  if(!isAdmin())return 0;
  const students=studentProfiles();let batch=db.batch(),n=0;
  for(const u of students){
    const nis=String(u.nis||"").trim(),kelas=String(u.kelas||latestRecord(records.filter(r=>String(r.nis)===nis))?.kelas||"").trim();
    if(!nis||!kelas)continue;
    batch.set(db.collection("classRoster").doc(slug(nis)),{nis,name:u.name||"",kelas,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});n++;
    if(n%400===0){await batch.commit();batch=db.batch()}
  }
  if(n%400)await batch.commit();return n;
}
function renderSettings(){
  $("rosterStatus").textContent=`${classRoster.length} siswa tersinkron`;
  const students=studentProfiles().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  $("helperList").innerHTML=students.map(u=>`<div class="helper-row"><div><b>${esc(u.name||u.nis)}</b><small>NIS ${esc(u.nis)} · ${esc(u.kelas||"-")}</small></div><label><input type="checkbox" data-helper-uid="${u.uid||u.id}" ${u.attendanceHelper===true?"checked":""}></label></div>`).join("")||'<div class="muted">Belum ada akun siswa.</div>';
}
$("syncRosterBtn").addEventListener("click",async()=>{
  msg("helperMessage","Menyinkronkan…");try{const n=await syncRoster();await loadRoleData();renderSettings();msg("helperMessage",`${n} siswa berhasil disinkronkan.`,"success")}catch(e){msg("helperMessage","Sinkronisasi gagal: "+e.message,"error")}
});
$("helperList").addEventListener("change",async e=>{
  const input=e.target.closest("[data-helper-uid]");if(!input)return;const u=users.find(x=>(x.uid||x.id)===input.dataset.helperUid);if(!u)return;
  input.disabled=true;try{
    const cls=String(u.kelas||latestRecord(records.filter(r=>String(r.nis)===String(u.nis)))?.kelas||"").trim();
    if(input.checked&&!cls)throw new Error("Kelas siswa belum tersedia.");
    const userDocId=u.uid||u.id;
    if(!userDocId)throw new Error("UID siswa tidak ditemukan.");
    await db.collection("users").doc(userDocId).update({attendanceHelper:input.checked,attendanceHelperClass:input.checked?cls:"",updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await loadRoleData();renderSettings();msg("helperMessage",input.checked?`${u.name||u.nis} menjadi Petugas Kehadiran kelas ${cls}.`:`Akses petugas ${u.name||u.nis} dicabut.`,"success");
  }catch(err){input.checked=!input.checked;msg("helperMessage","Gagal mengubah petugas: "+err.message,"error")}finally{input.disabled=false}
});

/* STUDENT ACADEMIC */
function renderStudentAcademic(){
  const ordered=[...records].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)),latest=ordered.at(-1),avgs=ordered.map(rowAvg).filter(Number.isFinite),combined=avgs.length?avgs.reduce((a,b)=>a+b,0)/avgs.length:null;
  $("studentGreeting").textContent=`Selamat datang, ${(profile?.name||"Siswa").split(" ")[0]} 👋`;$("studentMeta").textContent=`NIS ${profile?.nis||"-"} · ${profile?.kelas||latest?.kelas||"-"}`;
  $("studentLatestAvg").textContent=fmt(rowAvg(latest));$("studentCombinedAvg").textContent=fmt(combined);
  const latestSummary=[...summaries].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)).at(-1);$("studentPosition").textContent=latestSummary?.rank?`${latestSummary.rank} / ${latestSummary.classSize||"—"}`:"—";
  const keys=scoreKeys(ordered),metric=$("studentMetricSelect"),old=metric.value;metric.innerHTML='<option value="average">Rata-rata</option>'+keys.map(k=>`<option value="${esc(k)}">${esc(subjectLabel(k))}</option>`).join("");if([...metric.options].some(o=>o.value===old))metric.value=old;
  const sem=$("studentSemesterSelect"),oldSem=sem.value,sems=ordered.map(r=>r.semester);sem.innerHTML=sems.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");if(sems.includes(oldSem))sem.value=oldSem;else if(sems.length)sem.value=sems.at(-1);
  renderStudentChart();renderStudentGrades();
}
$("studentMetricSelect").addEventListener("change",renderStudentChart);$("studentSemesterSelect").addEventListener("change",renderStudentGrades);
function renderStudentChart(){
  const ordered=[...records].sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester)),metric=$("studentMetricSelect").value;
  const vals=ordered.map(r=>metric==="average"?rowAvg(r):Number(r.scores?.[metric]));
  charts.student?.destroy();charts.student=new Chart($("studentTrendChart"),{type:"line",data:{labels:ordered.map(r=>r.semester),datasets:[{label:metric==="average"?"Rata-rata":subjectLabel(metric),data:vals,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{suggestedMin:0,suggestedMax:100}}}});
}
function renderStudentGrades(){
  const sem=$("studentSemesterSelect").value,r=records.find(x=>String(x.semester)===String(sem));$("studentGradeGrid").innerHTML=r?Object.entries(r.scores||{}).map(([k,v])=>`<div class="grade-card"><b>${esc(subjectLabel(k))}</b><strong>${fmt(v)}</strong></div>`).join(""):'<div class="muted">Belum ada nilai.</div>';
}

/* STUDENT ATTENDANCE */
function renderStudentAttendance(){
  $("helperAccessCard").classList.toggle("hidden",profile?.attendanceHelper!==true);
  if(!$("studentAttendanceMonth").value)$("studentAttendanceMonth").value=today().slice(0,7);
  const finalRows=finalAttendanceRows();
  const h=finalRows.filter(x=>x.status==="Hadir").length,s=finalRows.filter(x=>x.status==="Sakit").length,i=finalRows.filter(x=>x.status==="Izin").length,a=finalRows.filter(x=>x.status==="Alpa").length;
  $("stuH").textContent=h;$("stuS").textContent=s;$("stuI").textContent=i;$("stuA").textContent=a;
  $("studentAttendanceHistory").innerHTML=[...finalRows].sort((x,y)=>String(y.date).localeCompare(String(x.date))).map(x=>`<div class="history-row"><b>${esc(x.date)}</b> · ${esc(x.status)}${x.note?`<small> · ${esc(x.note)}</small>`:""}</div>`).join("")||'<div class="muted">Belum ada data kehadiran.</div>';
  $("studentLeaveHistory").innerHTML=[...leaveRequests].sort((x,y)=>String(y.createdAt||"").localeCompare(String(x.createdAt||""))).map(x=>`<div class="history-row"><b>${esc(x.type)} · ${esc(x.startDate)}</b><small>${esc(x.status||"Menunggu")}${x.note?` · ${esc(x.note)}`:""}</small></div>`).join("")||'<div class="muted">Belum ada pengajuan.</div>';  renderStudentAttendanceCalendar();
}
$("studentAttendanceMonth").addEventListener("change",renderStudentAttendanceCalendar);
function renderStudentAttendanceCalendar(){
  const month=$("studentAttendanceMonth").value||today().slice(0,7),[y,m]=month.split("-").map(Number),days=new Date(y,m,0).getDate(),first=new Date(y,m-1,1).getDay(),byDate=new Map(finalAttendanceRows().filter(x=>x.date?.startsWith(month)).map(x=>[x.date,x]));
  let html=["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map(x=>`<div class="cal-head">${x}</div>`).join("");
  for(let i=0;i<first;i++)html+='<div class="cal-day blank"></div>';
  for(let d=1;d<=days;d++){const date=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,r=byDate.get(date),code=r?.status?.[0]?.toLowerCase()||"";html+=`<div class="cal-day ${code?`cal-${code}`:""}"><b>${d}</b>${r?`<small>${esc(r.status)}</small>`:""}</div>`}
  $("studentAttendanceCalendar").innerHTML=html;
}
$("openHelperBtn").addEventListener("click",()=>showPage("studentHelper"));$("backToStudentAttendanceBtn").addEventListener("click",()=>showPage("studentAttendance"));
async function loadHelperRoster(){
  if(profile?.attendanceHelper!==true)throw new Error("Akses petugas tidak aktif.");
  const cls=String(profile.attendanceHelperClass||profile.kelas||"").trim();if(!cls)throw new Error("Kelas petugas belum ditetapkan.");
  const [r,a]=await Promise.all([
    db.collection("classRoster")
      .where("kelas","==",cls)
      .get(),
    db.collection("attendance")
      .where("date","==",today())
      .where("kelas","==",cls)
      .get()
  ]);
  classRoster=r.docs.map(d=>({id:d.id,...d.data()}));
  attendance=a.docs.map(d=>({id:d.id,...d.data()}));
  return cls;
}
async function renderHelperAttendance(){
  $("helperAttendanceList").innerHTML='<div class="muted">Memuat daftar siswa…</div>';
  try{const cls=await loadHelperRoster();$("helperTitle").textContent=`Isi Kehadiran ${cls}`;$("helperAttendanceList").innerHTML=classRoster.sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(s=>attendanceRowHtml(s,today(),true)).join("")||'<div class="muted">Daftar siswa kelas masih kosong. Hubungi admin untuk Sinkronkan Daftar Siswa.</div>'}
  catch(e){
    console.error("Helper attendance load error:",e);
    let text=e.message||String(e);
    if((e.code||"").includes("permission-denied"))text="Akses kehadiran kelas ditolak. Pastikan status Petugas Kehadiran aktif dan kelas petugas sesuai.";
    if((e.code||"").includes("failed-precondition"))text="Query kehadiran membutuhkan index Firestore untuk tanggal + kelas.";
    $("helperAttendanceList").innerHTML=`<div class="message error">${esc(text)}</div>`;
  }
}
$("saveHelperAttendanceBtn").addEventListener("click",async()=>{
  const rows=[...$("helperAttendanceList").querySelectorAll(".att-row")],cls=String(profile.attendanceHelperClass||profile.kelas||"");
  msg("helperSaveMessage","Menyimpan…");try{
    let batch=db.batch(),n=0;
    rows.forEach(row=>{if(row.dataset.locked==="1")return;const nis=row.dataset.nis,s=classRoster.find(x=>String(x.nis)===nis);batch.set(db.collection("attendance").doc(attendanceId(nis,today())),{nis,name:s?.name||"",kelas:cls,date:today(),status:row.dataset.status||"Hadir",note:"",source:"Petugas Siswa",helperUid:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});n++});
    await batch.commit();msg("helperSaveMessage",`${n} siswa berhasil disimpan.`,"success");await renderHelperAttendance();
  }catch(e){msg("helperSaveMessage","Gagal menyimpan: "+e.message,"error")}
});

/* LEAVE REQUEST + DRIVE */
$("openLeaveBtn").addEventListener("click",()=>{
  preparedPhoto=null;
  $("leavePhoto").value="";
  $("leavePhotoPreview").innerHTML="";
  $("leavePhotoPreview").classList.add("hidden");
  $("leaveStart").value=today();
  $("leaveEnd").value=today();
  msg("leaveMessage","");
  $("leaveModal").classList.remove("hidden");
});
$("closeLeaveModalBtn").addEventListener("click",()=>$("leaveModal").classList.add("hidden"));
$("leavePhoto").addEventListener("change",async()=>{
  preparedPhoto=null;const f=$("leavePhoto").files[0];if(!f)return;
  try{preparedPhoto=await compressPhoto(f);$("leavePhotoPreview").innerHTML=`<img src="${preparedPhoto.preview}"><div>Foto siap dilampirkan.</div>`;$("leavePhotoPreview").classList.remove("hidden")}
  catch(e){msg("leaveMessage",e.message,"error")}
});
function fileDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
async function compressPhoto(file){
  if(file.size>8*1024*1024)throw new Error("Foto maksimal 8 MB.");const src=await fileDataUrl(file),img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
  let w=img.width,h=img.height,max=1280;if(Math.max(w,h)>max){const s=max/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s)}const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);const out=c.toDataURL("image/jpeg",.78);return{mimeType:"image/jpeg",base64:out.split(",")[1],preview:out}
}
async function uploadEvidence(photo,meta){
  const r=await fetch(APPS_SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...meta,mimeType:photo.mimeType,fileBase64:photo.base64})});const t=await r.text();let data;try{data=JSON.parse(t)}catch(_){throw new Error("Respons upload foto tidak dapat dibaca.")}if(!data.success)throw new Error(data.message||"Upload foto gagal.");return data;
}
$("submitLeaveBtn").addEventListener("click",async()=>{
  const type=$("leaveType").value,startDate=$("leaveStart").value,endDate=$("leaveEnd").value||startDate,note=$("leaveNote").value.trim();
  if(!startDate)return msg("leaveMessage","Tanggal wajib diisi.","error");
  if(!preparedPhoto)return msg("leaveMessage","Foto bukti wajib dilampirkan untuk pengajuan Izin/Sakit.","error");
  $("submitLeaveBtn").disabled=true;msg("leaveMessage","Mengunggah foto bukti…");
  try{
    const attachment=await uploadEvidence(preparedPhoto,{nis:String(profile.nis),nama:profile.name||"",tanggal:startDate,jenis:type});
    if(!attachment?.fileUrl && !attachment?.fileId)throw new Error("Foto bukti belum berhasil tersimpan.");
    await db.collection("leaveRequests").add({nis:String(profile.nis),name:profile.name||"",kelas:profile.kelas||"",type,startDate,endDate,note,status:"Menunggu",attachmentUrl:attachment?.fileUrl||"",attachmentName:attachment?.fileName||"",driveFileId:attachment?.fileId||"",createdAt:new Date().toISOString()});
    $("leaveModal").classList.add("hidden");preparedPhoto=null;$("leavePhoto").value="";$("leavePhotoPreview").classList.add("hidden");await loadRoleData();renderStudentAttendance();msg("leaveMessage","");
  }catch(e){msg("leaveMessage","Pengajuan gagal: "+e.message,"error")}finally{$("submitLeaveBtn").disabled=false}
});

init();
})();