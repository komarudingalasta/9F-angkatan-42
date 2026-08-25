/* Firebase Compat bridge V18.6.4 */
function initializeApp(config){
  if(!window.firebase) throw new Error("Firebase library belum dimuat.");
  return firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
}
function getApps(){ return window.firebase ? firebase.apps : []; }
function getAuth(app){ return app.auth(); }
function onAuthStateChanged(auth,cb){ return auth.onAuthStateChanged(cb); }
function signInWithEmailAndPassword(auth,email,password){ return auth.signInWithEmailAndPassword(email,password); }
function signOut(auth){ return auth.signOut(); }
function sendPasswordResetEmail(auth,email){ return auth.sendPasswordResetEmail(email); }
var browserLocalPersistence = window.firebase ? firebase.auth.Auth.Persistence.LOCAL : "local";
function setPersistence(auth,persistence){ return auth.setPersistence(persistence); }
function createUserWithEmailAndPassword(auth,email,password){ return auth.createUserWithEmailAndPassword(email,password); }
function getFirestore(app){ return app.firestore(); }
function collection(db,name){ return db.collection(name); }
function doc(a,b,c){
  if(arguments.length===3) return a.collection(b).doc(c);
  if(arguments.length===2 && a && typeof a.doc==="function") return a.doc(b);
  throw new Error("Referensi dokumen tidak valid.");
}
function getDocs(ref){ return ref.get(); }
async function getDoc(ref){
  const snap=await ref.get();
  return {
    id:snap.id,
    ref:snap.ref,
    exists:function(){ return snap.exists; },
    data:function(){ return snap.data(); }
  };
}
function setDoc(ref,data,options){ return ref.set(data,options||{}); }
function deleteDoc(ref){ return ref.delete(); }
function updateDoc(ref,data){ return ref.update(data); }
function addDoc(ref,data){ return ref.add(data); }
function writeBatch(db){ return db.batch(); }
function serverTimestamp(){ return firebase.firestore.FieldValue.serverTimestamp(); }
function where(field,op,value){ return {type:"where",field:field,op:op,value:value}; }
function query(ref){
  var q=ref;
  for(var i=1;i<arguments.length;i++){
    var c=arguments[i];
    if(c && c.type==="where") q=q.where(c.field,c.op,c.value);
  }
  return q;
}

const $=id=>document.getElementById(id);
document.body.classList.add("auth-locked");
window.__PAKKOM_BOOT_OK__ = !!(window.firebase && window.firebaseConfig);
if($("bootStatus")){
  $("bootStatus").textContent=window.__PAKKOM_BOOT_OK__?"Sistem login siap.":"Library Firebase belum siap.";
  $("bootStatus").classList.add("ready");
}
const CORE=["nis","nama","kelas","semester"];
let app,auth,db,records=[],subjects=[],pendingFileRows=[],pendingHeaders=[],selectedStudent=null,charts={},currentProfile=null,currentLoginRole=null,studentSummaries=[];

function configReady(){
  return !!(window.firebase && window.firebaseConfig &&
    firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_") &&
    firebaseConfig.projectId && !firebaseConfig.projectId.includes("PASTE_"));
}
if(!configReady()){
  $("setupScreen")?.classList.add("hidden");
  $("loginScreen")?.classList.remove("hidden");
  setMessage("loginMessage","Library Firebase belum berhasil dimuat. Muat ulang halaman atau coba jaringan lain.",true);
}else{
  $("setupScreen")?.classList.add("hidden");
  $("loginScreen")?.classList.remove("hidden");
  try{
    app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app);
    (async()=>{
      try{await setPersistence(auth,browserLocalPersistence)}catch(e){console.warn("Persistence fallback",e)}
      onAuthStateChanged(auth, async user=>{
      if(user){
        try{
          setMessage("loginMessage","Login berhasil. Membaca profil...");
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
          document.body.classList.add("auth-locked");
          document.body.classList.remove("student-mode","admin-mode");
          $("app")?.classList.add("hidden");
          $("setupScreen")?.classList.add("hidden");
          $("loginScreen")?.classList.remove("hidden");
          setMessage("loginMessage","Gagal membaca profil akses: "+(e?.message||e),true);
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
  const isAdmin=currentProfile?.role==="admin";

  document.body.classList.toggle("student-mode",isStudent);
  document.body.classList.toggle("admin-mode",isAdmin);

  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin));
  document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",!isStudent));

  $("semesterFilter")?.classList.toggle("hidden",isStudent);
  $("classFilter")?.classList.toggle("hidden",isStudent);

  if(isStudent){
    $("studentBottomNav")?.classList.remove("hidden");
    $("adminBottomNav")?.classList.add("hidden");
    $("attendanceHelperAccessCard")?.classList.toggle("hidden",currentProfile?.attendanceHelper!==true);
    showPage("studentAcademicV15");
    return;
  }

  if(isAdmin){
    $("studentBottomNav")?.classList.add("hidden");
    $("adminBottomNav")?.classList.remove("hidden");
    $("attendanceHelperAccessCard")?.classList.add("hidden");
    showPage("dashboard");
    return;
  }

  $("studentBottomNav")?.classList.add("hidden");
  $("adminBottomNav")?.classList.add("hidden");
}

$("loginForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const identifier=$("email")?.value.trim()||"";
  const password=$("password")?.value||"";
  if(!identifier||!password)return setMessage("loginMessage","Masukkan email/NIS dan password.",true);

  if(!auth){
    return setMessage("loginMessage","Layanan login belum siap. Muat ulang halaman.",true);
  }

  const authEmail=identifier.includes("@")?identifier:studentInternalEmail(identifier);
  setMessage("loginMessage","Memeriksa akun...");

  try{
    await signInWithEmailAndPassword(auth,authEmail,password);
    setMessage("loginMessage","Login berhasil. Memuat data...");
  }catch(err){
    console.error("Login error",err);
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
  if(c.includes("network-request-failed"))return"Koneksi ke layanan login Firebase gagal.";
  if(c.includes("operation-not-allowed"))return"Login Email/Password belum diaktifkan di Firebase Authentication.";
  if(c.includes("user-disabled"))return"Akun ini dinonaktifkan.";
  if(c.includes("user-not-found"))return"Akun tidak ditemukan.";
  if(c.includes("wrong-password"))return"Password salah.";
  return e?.message||"Login gagal.";
}
function setMessage(id,text,error=false){
  const el=$(id); if(!el)return;
  el.textContent=text;
  el.className="message "+(error?"error":text?"success":"");
}
function setSync(text,ok=true){
  if($("syncText"))$("syncText").textContent=text;
  if($("syncDot"))$("syncDot").style.color=ok?"var(--green)":"var(--red)";
}

document.querySelectorAll(".nav[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function adminPrimaryForPage(page){
 if(page==="dashboard")return"summary";
 if(["records","students","subjects","upload","pulse"].includes(page))return"academic";
 if(page==="attendance")return"attendance";
 if(page==="settings")return"settings";
 return"";
}
function syncAdminNavigation(page){
 const primary=adminPrimaryForPage(page);
 document.querySelectorAll("[data-primary]").forEach(b=>b.classList.toggle("active",b.dataset.primary===primary));
 document.querySelectorAll(".academic-admin-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.academicPage===page||(page==="pulse"&&b.dataset.academicPage==="students")));
 const n=$("adminBottomNav"); if(n){n.classList.toggle("hidden",currentProfile?.role!=="admin")}
}

function showPage(page){
  setTimeout(()=>syncStudentBottom(page),0);setTimeout(()=>syncAdminNavigation(page),0);
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const target=$(page+"Page");
  if(!target){console.error("Halaman tidak ditemukan:",page);return}
  target.classList.remove("hidden");
  document.querySelectorAll(".nav[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const meta={
    dashboard:["Ringkasan","Kondisi kelas dan informasi penting"],
    upload:["Upload Leger","Import Excel dengan validasi dan mapping"],
    records:["Akademik","Nilai dan perkembangan siswa"],
    pulse:["Peta Perkembangan Siswa","Meningkat, stabil, dipantau, dan perlu perhatian"],
    students:["Perkembangan Siswa","Student Journey dan Growth Index"],
    subjects:["Analisis Mapel","Tren rata-rata mata pelajaran"],
    settings:["Pengaturan","Mata pelajaran dan akses siswa"],attendance:["Kehadiran","Absensi dan pengajuan kehadiran"],studentAcademicV15:["Akademik","Perkembangan akademik saya"],studentAttendanceV15:["Kehadiran","Rekap dan pengajuan ketidakhadiran"],studentAttendanceHelper:["Isi Kehadiran","Bantu pencatatan kehadiran kelas"],
    myGrades:["Nilai Saya","Nilai pribadi dan hasil semester"],
    studentHome:["Beranda Saya","Ringkasan perkembangan akademik pribadi"],
    studentProgress:["Grafik Perkembangan","Tren nilai dari semester ke semester"],
    studentAnalysis:["Analisis Saya","Kekuatan dan area yang perlu ditingkatkan"],
    studentCompare:["Perbandingan Kelas","Nilai saya dibanding rata-rata kelas"],
    studentRank:["Posisi Akademik Saya","Perkembangan posisi dibanding kelompok kelas saat ini"]
  }[page]||[page,""];
  if($("pageTitle"))$("pageTitle").textContent=meta[0]; if($("pageSubtitle"))$("pageSubtitle").textContent=meta[1];
  if(page==="studentAcademicV15"){ if($("pageTitle"))$("pageTitle").textContent="Ringkasan"; if($("pageSubtitle"))$("pageSubtitle").textContent=""; }
  if(page==="studentAttendanceV15"){ if($("pageTitle"))$("pageTitle").textContent="Kehadiran"; if($("pageSubtitle"))$("pageSubtitle").textContent="Rekap dan pengajuan ketidakhadiran"; }
  if(page==="records")renderTable();
  if(page==="pulse")renderPulse("pulseGrid");
  if(page==="students")renderStudentList();
  if(page==="subjects")renderSubjects();
  if(page==="settings"){renderSettings();renderStudentAccess();}
  if(page==="attendance")renderAttendanceV18();
  if(page==="studentAcademicV15"){
    try{requestAnimationFrame(()=>renderAcademicV15())}catch(e){console.error(e);target.innerHTML='<div class="card" style="padding:18px"><h3>Data akademik belum dapat ditampilkan</h3><p>Silakan muat ulang halaman atau hubungi admin.</p></div>'}
  }
  if(page==="studentAttendanceV15"){
    try{renderAttendanceV15()}catch(e){console.error(e);target.innerHTML='<div class="card" style="padding:18px"><h3>Data kehadiran belum dapat ditampilkan</h3><p>Silakan muat ulang halaman atau hubungi admin.</p></div>'}
  }
  if(page==="studentAttendanceHelper"){
    try{renderStudentAttendanceHelper()}catch(e){console.error(e);target.innerHTML='<div class="card" style="padding:18px"><h3>Kehadiran belum dapat ditampilkan</h3></div>'}
  }
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

      // Data is now ready. Render the actual student dashboard only now.
      try{
        renderAllStudentAnalytics();
      }catch(renderErr){
        console.error("Student render error:",renderErr);
        setDataStatus("warn","Data siswa berhasil dimuat, tetapi sebagian tampilan perlu dimuat ulang.");
      }
      showPage("studentAcademicV15");
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
  ensureSubjectObjects();
      syncClassRosterFromRecords().then(()=>refreshClassRosterStatus()).catch(e=>console.warn("Roster sync",e));
      const sorted=[...subjects].sort((a,b)=>(a.order??999)-(b.order??999));
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

function renderAllStudentAnalytics(){
  if(currentProfile?.role!=="student")return;
  renderAcademicV15();
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
function combinedAverageAllSemesters(rows){
  const values=[];
  rows.forEach(r=>{
    Object.values(r.scores||{}).forEach(v=>{
      const n=Number(v);
      if(Number.isFinite(n))values.push(n);
    });
  });
  return values.length?avg(values):NaN;
}
function semesterRangeLabel(rows){
  if(!rows.length)return "Semua semester";
  const first=rows[0]?.semester||"Semester awal";
  const last=rows.at(-1)?.semester||"Semester terakhir";
  return first===last?first:`${first} – ${last}`;
}

function renderAcademicV15(){const rows=mineV15();
  if(!rows.length){
    if($("v16Greeting"))$("v16Greeting").textContent=`Selamat datang, ${(currentProfile?.name||"Siswa").split(" ")[0]} 👋`;
    if($("v15Meta"))$("v15Meta").textContent=currentProfile?.nis?`NIS ${currentProfile.nis}`:"";
    if($("v15Latest"))$("v15Latest").textContent="—";
    if($("v15Combined"))$("v15Combined").textContent="—";if($("v15CombinedRange"))$("v15CombinedRange").textContent="Semua semester";
    if($("v15Position"))$("v15Position").textContent="—";
    if($("v15Delta"))$("v15Delta").textContent="Data nilai belum tersedia";
    $("v15Grades").innerHTML='<div class="empty">Belum ada data nilai yang dapat ditampilkan.</div>';
    $("v15Journey").innerHTML='<div class="empty">Belum ada riwayat posisi akademik.</div>';
    return;
  }const last=rows.at(-1),prev=rows.at(-2),la=rowAvg(last),pa=prev?rowAvg(prev):la,d=la-pa,p=posV15(last.semester,la);$("v16Greeting").textContent=`Selamat datang, ${(currentProfile.name||last.nama||"Siswa").split(" ")[0]} 👋`;$("v15Meta").textContent=`NIS ${currentProfile.nis} · Kelas ${classNow()}`;$("v15Latest").textContent=fmt(la);$("v15Combined").textContent=fmt(combinedAverageAllSemesters(rows));$("v15CombinedRange").textContent=semesterRangeLabel(rows);$("v15Delta").textContent=prev?`${d>=0?"↑":"↓"} ${fmt(Math.abs(d))} dari semester sebelumnya`:"Semester pertama";$("v15Position").textContent=p.n?`${p.p} / ${p.n}`:"—";if($("v15Growth")) $("v15Growth").textContent=d>=2?"Meningkat":d<=-2?"Perlu perhatian":"Stabil";const subs=subjectKeys(rows,false),metric=$("v15Metric"),old=metric.value;metric.innerHTML='<option value="AVG">Rata-rata Rapor</option>'+subs.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(subjectLabel(s))}</option>`).join("");if([...metric.options].some(o=>o.value===old))metric.value=old;metric.onchange=drawV15;const sel=$("v15Semester"),os=sel.value;sel.innerHTML=rows.map(r=>`<option>${escapeHtml(r.semester)}</option>`).join("");sel.value=rows.some(r=>r.semester===os)?os:last.semester;sel.onchange=gradesV15;drawV15();gradesV15();let vals=subs.map(s=>({s,v:Number(last.scores?.[s])})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>b.v-a.v);$("v15Strong").textContent=vals[0]?subjectLabel(vals[0].s):"—";$("v15StrongVal").textContent=vals[0]?fmt(vals[0].v):"—";$("v15Focus").textContent=vals.at(-1)?subjectLabel(vals.at(-1).s):"—";$("v15FocusVal").textContent=vals.at(-1)?fmt(vals.at(-1).v):"—";let inc=[];if(prev)subs.forEach(s=>{let a=Number(prev.scores?.[s]),b=Number(last.scores?.[s]);if(Number.isFinite(a)&&Number.isFinite(b))inc.push({s,d:b-a})});inc.sort((a,b)=>b.d-a.d);$("v15Improve").textContent=inc[0]?subjectLabel(inc[0].s):"—";$("v15ImproveVal").textContent=inc[0]?`${inc[0].d>=0?"+":""}${fmt(inc[0].d)} poin`:"Belum ada pembanding";$("v15Journey").innerHTML=rows.map(r=>{let q=posV15(r.semester,rowAvg(r));return `<div class="v15-step"><span>${escapeHtml(r.semester)}</span><b>${q.p?"#"+q.p:"—"}</b><small>${fmt(rowAvg(r))}${q.n?" · "+q.n+" siswa":""}</small></div>`}).join("")}
function drawV15(){const rows=mineV15(),m=$("v15Metric").value,mine=rows.map(r=>m==="AVG"?rowAvg(r):Number(r.scores?.[m])),grp=rows.map(r=>{const s=summaryV17(r.semester);return m==="AVG"?Number(s?.classReportAverage):Number(s?.subjectAverages?.[m]);});if(v15ChartObj)v15ChartObj.destroy();v15ChartObj=new Chart($("v15Chart"),{type:"line",data:{labels:rows.map(r=>r.semester),datasets:[{label:"Nilai Saya",data:mine,tension:.35,pointRadius:5}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:20}},scales:{y:{suggestedMin:0,suggestedMax:100}}}})}
function gradesV15(){
  const r=mineV15().find(x=>x.semester===$("v15Semester").value);
  if(!r)return;

  const sum=summaryV17(r.semester);
  const subs=subjectKeys([r],false);

  const rows=subs.map(s=>{
    const mine=Number(r.scores?.[s]);
    const group=Number(sum?.subjectAverages?.[s]);
    const diff=mine-group;
    return {
      label:subjectLabel(s),
      mine,
      group,
      diff
    };
  });

  const desktop=`<div class="grade-desktop"><table class="v15-table">
    <thead><tr><th>Mata Pelajaran</th><th>Nilai Saya</th><th>Rata-rata Kelas</th><th>Selisih</th></tr></thead>
    <tbody>${rows.map(x=>`<tr>
      <td>${escapeHtml(x.label)}</td>
      <td class="num">${fmt(x.mine)}</td>
      <td class="num">${Number.isFinite(x.group)?fmt(x.group):"—"}</td>
      <td class="num ${Number.isFinite(x.diff)?(x.diff>=0?"up":"down"):""}">${Number.isFinite(x.diff)?`${x.diff>=0?"+":""}${fmt(x.diff)}`:"—"}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;

  const mobile=`<div class="grade-mobile-list">${rows.map(x=>`
    <article class="grade-mobile-card">
      <div class="grade-mobile-head">
        <div><span>Mata Pelajaran</span><b>${escapeHtml(x.label)}</b></div>
        <strong>${fmt(x.mine)}</strong>
      </div>
      <div class="grade-mobile-meta">
        <span>Rata-rata kelas <b>${Number.isFinite(x.group)?fmt(x.group):"—"}</b></span>
        <span class="${Number.isFinite(x.diff)?(x.diff>=0?"positive-diff":"negative-diff"):""}">Selisih <b>${Number.isFinite(x.diff)?`${x.diff>=0?"+":""}${fmt(x.diff)}`:"—"}</b></span>
      </div>
    </article>`).join("")}</div>`;

  $("v15Grades").innerHTML=desktop+mobile;
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
$("leaveBtn").onclick=()=>$("leaveModal").classList.remove("hidden");$("leaveClose").onclick=()=>$("leaveModal").classList.add("hidden");$("leaveSubmit").onclick=async()=>{
 const startDate=$("leaveStart").value,endDate=$("leaveEnd").value||startDate,type=$("leaveType").value,note=$("leaveNote").value.trim();
 if(!startDate)return setMessage("leaveMsg","Tanggal wajib diisi.",true);
 $("leaveSubmit").disabled=true;
 try{
   setMessage("leaveMsg",preparedLeavePhoto?"Mengunggah bukti foto...":"Mengirim pengajuan...");
   let attachment=null;
   if(preparedLeavePhoto)attachment=await uploadEvidenceToDrive(preparedLeavePhoto,{nis:String(currentProfile.nis),nama:currentProfile.name||"",tanggal:startDate,jenis:type});
   await addDoc(collection(db,"leaveRequests"),{
     nis:String(currentProfile.nis),name:currentProfile.name||"",kelas:classNow(),type,startDate,endDate,note,status:"Menunggu",
     attachmentUrl:attachment?.fileUrl||"",attachmentName:attachment?.fileName||"",driveFileId:attachment?.fileId||"",
     createdAt:new Date().toISOString()
   });
   setMessage("leaveMsg","Pengajuan berhasil dikirim.");
   preparedLeavePhoto=null;$("leavePhoto").value="";$("leavePhotoPreview")?.classList.add("hidden");
   setTimeout(()=>{$("leaveModal").classList.add("hidden");renderAttendanceV15()},500);
 }catch(e){console.error(e);setMessage("leaveMsg","Pengajuan gagal: "+(e.message||e),true)}
 finally{$("leaveSubmit").disabled=false}
}
async function renderAdminAttendance(){return renderAttendanceV18();}

document.querySelectorAll("[data-student-go]").forEach(b=>b.addEventListener("click",()=>{
  showPage(b.dataset.studentGo);
  closeSidebar();
}));
function syncStudentBottom(page){
  const student=!!(currentProfile&&currentProfile.role==="student");
  const n=$("studentBottomNav");
  if(!n)return;

  if(student){
    n.classList.remove("hidden");
    n.style.display="flex";
    document.querySelector(".sidebar")?.classList.remove("open");
    $("sidebarBackdrop")?.classList.add("hidden");
  }else{
    n.classList.add("hidden");
    n.style.display="";
  }

  n.querySelectorAll("button").forEach(b=>{
    b.classList.toggle("active",b.dataset.studentGo===page);
  });
}


// ===== V18 ATTENDANCE CORE =====
let adminAttendanceRows=[];
let pendingAttendanceUpload=[];
let allAttendanceRows=[];
let allLeaveRows=[];

function isoToday(){
  const d=new Date();
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function attendanceDocId(nis,date){
  return `${String(nis).replace(/[^a-zA-Z0-9_-]/g,"_")}_${date}`;
}
function currentStudentList(){
  const map=new Map();
  records.forEach(r=>{
    if(!r.nis)return;
    const k=String(r.nis);
    const prev=map.get(k);
    if(!prev||semesterRank(r.semester)>=semesterRank(prev.semester))map.set(k,r);
  });
  return [...map.values()].sort((a,b)=>(a.nama||"").localeCompare(b.nama||""));
}
async function loadAllAttendanceV18(){
  const [attSnap,leaveSnap]=await Promise.all([
    getDocs(collection(db,"attendance")),
    getDocs(collection(db,"leaveRequests"))
  ]);
  allAttendanceRows=attSnap.docs.map(d=>({id:d.id,...d.data()}));
  allLeaveRows=leaveSnap.docs.map(d=>({id:d.id,...d.data()}));
}
function attendanceFor(nis,date){
  return allAttendanceRows.find(x=>String(x.nis)===String(nis)&&x.date===date);
}
function updateAttendanceKpis(){
  const date=$("attendanceDate").value;
  const students=currentStudentList();
  const daily=students.map(s=>attendanceFor(s.nis,date));
  const c=status=>daily.filter(x=>x?.status===status).length;
  $("adminAttH").textContent=c("Hadir");
  $("adminAttS").textContent=c("Sakit");
  $("adminAttI").textContent=c("Izin");
  $("adminAttA").textContent=c("Alpa");
  $("adminAttU").textContent=daily.filter(x=>!x).length;
}
function renderDailyAttendanceList(){
  const date=$("attendanceDate").value;
  const students=currentStudentList();

  $("dailyAttendanceList").innerHTML=students.map(s=>{
    const old=attendanceFor(s.nis,date);
    const status=old?.status||"Hadir";
    const note=old?.note||"";
    return `<div class="v18-att-row quick" data-nis="${escapeAttr(String(s.nis))}" data-status="${escapeAttr(status)}">
      <div class="v18-student">
        <b>${escapeHtml(s.nama||"-")}</b>
        <small>NIS ${escapeHtml(String(s.nis))}${note?` · ${escapeHtml(note)}`:""}</small>
        <div class="quick-att-picker hidden">
          ${["Hadir","Sakit","Izin","Alpa"].map(x=>`<button type="button" data-pick="${x}">${x}</button>`).join("")}
        </div>
      </div>
      <span class="quick-status">${escapeHtml(status)}</span>
    </div>`;
  }).join("")||'<div class="empty">Belum ada data siswa.</div>';

  updateAttendanceKpisFromQuickRows();
}
async function renderAttendanceV18(){
  if(currentProfile?.role!=="admin")return;
  if(!$("attendanceDate").value)$("attendanceDate").value=isoToday();
  try{
    await loadAllAttendanceV18();
    renderDailyAttendanceList();
    renderLeaveRequestsV18();
    renderAttendanceRecapOptions();
    renderAttendanceRecap();
  }catch(e){
    console.error(e);
    $("dailyAttendanceList").innerHTML='<div class="empty">Data kehadiran belum dapat dimuat.</div>';
  }
}
$("attendanceDate")?.addEventListener("change",renderDailyAttendanceList);

function updateAttendanceKpisFromQuickRows(){
  const vals=[...document.querySelectorAll("#dailyAttendanceList .v18-att-row.quick")].map(x=>x.dataset.status||"Hadir");
  $("adminAttH").textContent=vals.filter(x=>x==="Hadir").length;
  $("adminAttS").textContent=vals.filter(x=>x==="Sakit").length;
  $("adminAttI").textContent=vals.filter(x=>x==="Izin").length;
  $("adminAttA").textContent=vals.filter(x=>x==="Alpa").length;
  $("adminAttU").textContent=0;
}
$("resetAllPresentBtn")?.addEventListener("click",()=>{
  document.querySelectorAll("#dailyAttendanceList .v18-att-row.quick").forEach(row=>{
    row.dataset.status="Hadir";
    row.querySelector(".quick-status").textContent="Hadir";
    row.querySelector(".quick-att-picker")?.classList.add("hidden");
  });
  updateAttendanceKpisFromQuickRows();
});



$("dailyAttendanceList")?.addEventListener("click",e=>{
  const row=e.target.closest(".v18-att-row.quick");
  if(!row)return;

  const pick=e.target.closest("[data-pick]");
  if(pick){
    e.stopPropagation();
    row.dataset.status=pick.dataset.pick;
    row.querySelector(".quick-status").textContent=pick.dataset.pick;
    row.querySelector(".quick-att-picker")?.classList.add("hidden");
    updateAttendanceKpisFromQuickRows();
    return;
  }

  row.querySelector(".quick-att-picker")?.classList.toggle("hidden");
});

$("saveDailyAttendanceBtn")?.addEventListener("click",async()=>{
  const date=$("attendanceDate").value;
  if(!date)return setMessage("dailyAttendanceMessage","Pilih tanggal terlebih dahulu.",true);

  const rows=[...document.querySelectorAll("#dailyAttendanceList .v18-att-row.quick")];
  setMessage("dailyAttendanceMessage","Menyimpan...");

  try{
    let batch=writeBatch(db),count=0;
    const students=currentStudentList();

    for(const row of rows){
      const nis=row.dataset.nis;
      const status=row.dataset.status||"Hadir";
      const student=students.find(s=>String(s.nis)===String(nis));
      const existing=attendanceFor(nis,date);
      const note=existing?.note||"";
      const source=existing?.source==="Pengajuan" ? "Pengajuan" : "Manual";

      batch.set(doc(db,"attendance",attendanceDocId(nis,date)),{
        nis,name:student?.nama||"",kelas:student?.kelas||"",date,status,note,source,
        updatedAt:serverTimestamp()
      },{merge:true});

      count++;
      if(count%400===0){await batch.commit();batch=writeBatch(db)}
    }

    await batch.commit();
    setMessage("dailyAttendanceMessage","Kehadiran berhasil disimpan.");
    await loadAllAttendanceV18();
    renderDailyAttendanceList();
    renderAttendanceRecap();
  }catch(e){
    console.error(e);
    setMessage("dailyAttendanceMessage","Gagal menyimpan kehadiran: "+e.message,true);
  }
});

// Panel navigation
function showAttendancePanel(id){
  ["dailyAttendancePanel","attendanceUploadPanel","leaveRequestsPanel","attendanceRecapPanel"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));
  document.querySelectorAll(".v18-tab").forEach(b=>b.classList.toggle("active",b.dataset.attPanel===id));
}
$("openDailyAttendanceBtn")?.addEventListener("click",()=>showAttendancePanel("dailyAttendancePanel"));
$("openAttendanceUploadBtn")?.addEventListener("click",()=>showAttendancePanel("attendanceUploadPanel"));
$("openLeaveRequestsBtn")?.addEventListener("click",()=>showAttendancePanel("leaveRequestsPanel"));
$("openAttendanceRecapBtn")?.addEventListener("click",()=>showAttendancePanel("attendanceRecapPanel"));

// Leave approvals
function renderLeaveRequestsV18(){
  const pending=allLeaveRows.filter(x=>(x.status||"Menunggu")==="Menunggu");
  $("pendingLeaveBadge").textContent=pending.length;
  $("adminLeaveRequestsV18").innerHTML=pending.length?pending.map(x=>`
    <div class="v18-request" data-id="${escapeAttr(x.id)}">
      <div><b>${escapeHtml(x.name||x.nis||"-")} · ${escapeHtml(x.type||"-")}</b>
      <small>${escapeHtml(x.startDate||"-")}${x.endDate&&x.endDate!==x.startDate?` s.d. ${escapeHtml(x.endDate)}`:""} · ${escapeHtml(x.note||"Tanpa keterangan")}</small>${x.attachmentUrl?`<a class="evidence-link" href="${escapeAttr(x.attachmentUrl)}" target="_blank" rel="noopener">📎 Lihat Bukti</a>`:""}</div>
      <div class="v18-request-actions">
        <button class="btn small approve-leave">Setujui</button>
        <button class="btn small danger reject-leave">Tolak</button>
      </div>
    </div>`).join(""):'<div class="empty">Tidak ada pengajuan yang menunggu.</div>';
}
$("adminLeaveRequestsV18")?.addEventListener("click",async e=>{
  const card=e.target.closest(".v18-request");if(!card)return;
  const req=allLeaveRows.find(x=>x.id===card.dataset.id);if(!req)return;
  if(e.target.classList.contains("approve-leave")){
    try{
      const start=new Date(req.startDate+"T00:00:00"),end=new Date((req.endDate||req.startDate)+"T00:00:00");
      let batch=writeBatch(db);
      for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
        const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        batch.set(doc(db,"attendance",attendanceDocId(req.nis,date)),{
          nis:String(req.nis),name:req.name||"",kelas:req.kelas||"",date,status:req.type,note:req.note||"",
          source:"Pengajuan",updatedAt:serverTimestamp()
        },{merge:true});
      }
      batch.update(doc(db,"leaveRequests",req.id),{status:"Disetujui",reviewedAt:serverTimestamp()});
      await batch.commit();
      await renderAttendanceV18();
      renderAttendanceRecap();
    }catch(err){alert("Gagal menyetujui: "+err.message)}
  }
  if(e.target.classList.contains("reject-leave")){
    try{
      await updateDoc(doc(db,"leaveRequests",req.id),{status:"Ditolak",reviewedAt:serverTimestamp()});
      await renderAttendanceV18();
    }catch(err){alert("Gagal menolak: "+err.message)}
  }
});

// Upload attendance
function normalizeAttendanceStatus(v){
  const s=String(v||"").trim().toLowerCase();
  if(["h","hadir"].includes(s))return "Hadir";
  if(["s","sakit"].includes(s))return "Sakit";
  if(["i","izin","ijin"].includes(s))return "Izin";
  if(["a","alpa","alpha"].includes(s))return "Alpa";
  return "";
}
function normalizeDateValue(v){
  if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;
  if(typeof v==="number"&&window.XLSX?.SSF?.parse_date_code){
    const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s=String(v||"").trim();
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  return "";
}
$("parseAttendanceFileBtn")?.addEventListener("click",async()=>{
  const file=$("attendanceFileInput").files?.[0];if(!file)return setMessage("attendanceUploadSummary","Pilih file terlebih dahulu.",true);
  try{
    const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]];
    const arr=XLSX.utils.sheet_to_json(ws,{defval:""});
    const students=new Map(currentStudentList().map(s=>[String(s.nis),s]));
    pendingAttendanceUpload=$("attendanceUploadMode")?.value==="daily" ? arr.map((r,i)=>{
 const keyMap={};Object.keys(r).forEach(k=>keyMap[k.toLowerCase().trim()]=r[k]);
 const nis=String(keyMap["nis"]||keyMap["nisn"]||"").trim(),date=normalizeDateValue(keyMap["tanggal"]||keyMap["date"]),status=normalizeAttendanceStatus(keyMap["status"]||keyMap["kehadiran"]);
 const students=new Map(currentStudentList().map(s=>[String(s.nis),s]));
 return {row:i+2,nis,date,status,note:String(keyMap["keterangan"]||keyMap["catatan"]||"").trim(),student:students.get(nis),valid:!!(nis&&date&&status&&students.get(nis))};
}) : parseMonthlyAttendanceRows(arr);
    const valid=pendingAttendanceUpload.filter(x=>x.valid).length,invalid=pendingAttendanceUpload.length-valid;
    setMessage("attendanceUploadSummary",`${valid} baris valid${invalid?`, ${invalid} bermasalah`:""}.`,invalid>0);
    $("attendanceUploadPreview").innerHTML=`<table class="v18-table"><thead><tr><th>Baris</th><th>NIS</th><th>Nama</th><th>Tanggal</th><th>Status</th><th>Validasi</th></tr></thead><tbody>${pendingAttendanceUpload.slice(0,150).map(x=>`<tr><td>${x.row}</td><td>${escapeHtml(x.nis)}</td><td>${escapeHtml(x.student?.nama||"-")}</td><td>${escapeHtml(x.date||"-")}</td><td>${escapeHtml(x.status||"-")}</td><td>${x.valid?"✓":"Periksa"}</td></tr>`).join("")}</tbody></table>`;
    $("saveAttendanceUploadBtn").disabled=!valid;
  }catch(e){console.error(e);setMessage("attendanceUploadSummary","File tidak dapat dibaca: "+e.message,true)}
});
$("saveAttendanceUploadBtn")?.addEventListener("click",async()=>{
  const mode=document.querySelector('input[name="attendanceConflict"]:checked')?.value||"skip";
  const valid=pendingAttendanceUpload.filter(x=>x.valid);if(!valid.length)return;
  try{
    await loadAllAttendanceV18();
    let batch=writeBatch(db),count=0,skipped=0;
    for(const x of valid){
      const exists=attendanceFor(x.nis,x.date);
      if(exists&&mode==="skip"){skipped++;continue}
      batch.set(doc(db,"attendance",attendanceDocId(x.nis,x.date)),{
        nis:x.nis,name:x.student.nama||"",kelas:x.student.kelas||"",date:x.date,status:x.status,note:x.note,
        source:"Upload",updatedAt:serverTimestamp()
      },{merge:true});count++;
      if(count%400===0){await batch.commit();batch=writeBatch(db)}
    }
    await batch.commit();
    setMessage("attendanceUploadSummary",`Selesai. ${count} data disimpan${skipped?`, ${skipped} dilewati`:""}.`);
    pendingAttendanceUpload=[];$("saveAttendanceUploadBtn").disabled=true;
    await renderAttendanceV18();
  }catch(e){setMessage("attendanceUploadSummary","Gagal menyimpan hasil upload: "+e.message,true)}
});

// Download simple CSV template
$("downloadAttendanceTemplateBtn")?.addEventListener("click",()=>{
 const monthly=$("attendanceUploadMode")?.value!=="daily";let csv,name;
 if(monthly){
  const heads=["NIS","Nama",...Array.from({length:31},(_,i)=>String(i+1))];
  const rows=currentStudentList().map(s=>[s.nis,s.nama||"",...Array(31).fill("")]);
  csv=[heads,...rows].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  name="template-kehadiran-bulanan.csv";
 }else{csv="NIS,Nama,Tanggal,Status,Keterangan\n";name="template-kehadiran-harian.csv";}
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
});

// Recap
function renderAttendanceRecapOptions(){
  const months=uniq(allAttendanceRows.map(x=>String(x.date||"").slice(0,7)).filter(Boolean)).sort().reverse();
  const sel=$("attendanceRecapMonth"),old=sel.value;
  sel.innerHTML='<option value="ALL">Semua Bulan</option>'+months.map(m=>`<option value="${m}">${m}</option>`).join("");
  if(months.includes(old)||old==="ALL")sel.value=old||"ALL";
}
$("attendanceRecapMonth")?.addEventListener("change",renderAttendanceRecap);
function renderAttendanceRecap(){
  const month=$("attendanceRecapMonth")?.value||"ALL";
  const students=currentStudentList();
  const rows=students.map(s=>{
    const data=allAttendanceRows.filter(x=>String(x.nis)===String(s.nis)&&(month==="ALL"||String(x.date).startsWith(month)));
    const n=st=>data.filter(x=>x.status===st).length,h=n("Hadir"),sa=n("Sakit"),iz=n("Izin"),al=n("Alpa"),total=h+sa+iz+al;
    return {s,h,sa,iz,al,total,rate:total?Math.round(h/total*100):0};
  });
  $("attendanceRecapTable").innerHTML=`<table class="v18-table"><thead><tr><th>NIS</th><th>Nama</th><th>H</th><th>S</th><th>I</th><th>A</th><th>Kehadiran</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${escapeHtml(String(x.s.nis))}</td><td>${escapeHtml(x.s.nama||"-")}</td><td>${x.h}</td><td>${x.sa}</td><td>${x.iz}</td><td>${x.al}</td><td>${x.total?x.rate+"%":"—"}</td></tr>`).join("")}</tbody></table>`;
}

// ===== V18.1 MONTHLY IMPORT =====
function syncAttendanceUploadMode(){
 const monthly=$("attendanceUploadMode")?.value!=="daily";
 $("attendanceUploadMonthWrap")?.classList.toggle("hidden",!monthly);
 if($("downloadAttendanceTemplateBtn"))$("downloadAttendanceTemplateBtn").textContent=monthly?"Unduh Template Bulanan":"Unduh Template Harian";
 if($("monthlyFormatHelp"))$("monthlyFormatHelp").innerHTML=monthly?"<b>Format bulanan:</b> NIS | Nama | 1 | 2 | 3 | ... | 31. Isi H, S, I, atau A. Kolom kosong dilewati.":"<b>Format harian:</b> NIS | Nama | Tanggal | Status | Keterangan.";
}
$("attendanceUploadMode")?.addEventListener("change",syncAttendanceUploadMode);
if($("attendanceUploadMonth")&&!$("attendanceUploadMonth").value)$("attendanceUploadMonth").value=isoToday().slice(0,7);
syncAttendanceUploadMode();
function parseMonthlyAttendanceRows(arr){
 const month=$("attendanceUploadMonth")?.value;if(!month)throw new Error("Pilih bulan dan tahun terlebih dahulu.");
 const [year,mon]=month.split("-").map(Number),maxDay=new Date(year,mon,0).getDate();
 const students=new Map(currentStudentList().map(s=>[String(s.nis),s])),result=[];
 arr.forEach((r,rowIndex)=>{
  const km={};Object.keys(r).forEach(k=>km[String(k).trim().toLowerCase()]=r[k]);
  const nis=String(km["nis"]||km["nisn"]||"").trim(),student=students.get(nis);
  for(let day=1;day<=maxDay;day++){
   const raw=km[String(day)];if(raw===undefined||String(raw).trim()==="")continue;
   const status=normalizeAttendanceStatus(raw),date=`${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
   result.push({row:rowIndex+2,nis,date,status,note:"",student,valid:!!(nis&&student&&status)});
  }
 });
 return result;
}


// V18.2 Google Drive evidence upload
const EVIDENCE_UPLOAD_URL="https://script.google.com/macros/s/AKfycbxQWu2CkXHqdSilxwkxLTDN90o0gsFrR_jWE3NbXLHCZAe2Q4INlpO7oW8d1uB0-HyA/exec";
let preparedLeavePhoto=null;

function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);})}

async function compressEvidencePhoto(file){
 if(!file)return null;
 if(file.size>8*1024*1024)throw new Error("Ukuran foto maksimal 8 MB.");
 if(!file.type.startsWith("image/"))throw new Error("Lampiran harus berupa foto.");
 const src=await fileToDataUrl(file);
 const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});
 let w=img.width,h=img.height;const max=1280;
 if(Math.max(w,h)>max){const s=max/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
 const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
 const out=c.toDataURL("image/jpeg",0.78);
 return {fileBase64:out.split(",")[1],mimeType:"image/jpeg",previewUrl:out};
}

async function uploadEvidenceToDrive(photo,meta){
 const res=await fetch(EVIDENCE_UPLOAD_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...meta,mimeType:photo.mimeType,fileBase64:photo.fileBase64}),redirect:"follow"});
 if(!res.ok)throw new Error("Upload bukti gagal.");
 const text=await res.text();let data;try{data=JSON.parse(text)}catch(e){throw new Error("Respons upload tidak dapat dibaca.");}
 if(!data.success)throw new Error(data.message||"Upload bukti gagal.");return data;
}

$("leavePhoto")?.addEventListener("change",async()=>{
 preparedLeavePhoto=null;const f=$("leavePhoto").files?.[0],box=$("leavePhotoPreview");
 if(!f){box?.classList.add("hidden");return;}
 try{setMessage("leaveMsg","Menyiapkan foto...");preparedLeavePhoto=await compressEvidencePhoto(f);box.innerHTML=`<img src="${preparedLeavePhoto.previewUrl}"><div><b>Foto siap dilampirkan</b><small>${escapeHtml(f.name)}</small></div>`;box.classList.remove("hidden");setMessage("leaveMsg","");}
 catch(e){$("leavePhoto").value="";box?.classList.add("hidden");setMessage("leaveMsg",e.message,true);}
});


// ===== V18.4 STUDENT ATTENDANCE HELPERS =====
async function renderAttendanceHelpers(){
  const box=$("attendanceHelperList"); if(!box || currentProfile?.role!=="admin")return;
  try{
    const snap=await getDocs(collection(db,"users"));
    const profiles=snap.docs.map(d=>({uid:d.id,...d.data()}))
      .filter(x=>x.role==="student")
      .sort((a,b)=>(a.name||a.nis||"").localeCompare(b.name||b.nis||""));
    box.innerHTML=profiles.map(p=>`
      <div class="helper-row" data-nis="${escapeAttr(String(p.nis||""))}">
        <div><b>${escapeHtml(p.name||p.nis||"-")}</b><small>NIS ${escapeHtml(String(p.nis||"-"))}</small></div>
        <label class="helper-toggle"><input type="checkbox" data-helper-uid="${escapeAttr(p.uid)}" ${p.attendanceHelper===true?"checked":""}> Petugas</label>
      </div>`).join("")||'<div class="empty">Belum ada akun siswa.</div>';
  }catch(e){box.innerHTML='<div class="empty">Daftar siswa belum dapat dimuat.</div>'}
}

$("attendanceHelperList")?.addEventListener("change",async e=>{
  const input=e.target.closest("[data-helper-uid]");if(!input)return;
  input.disabled=true;
  try{
    const row=input.closest(".helper-row");
    const nis=String(row?.dataset?.nis||"").trim();

    const latest=records
      .filter(r=>String(r.nis)===nis)
      .sort((a,b)=>semesterRank(a.semester)-semesterRank(b.semester))
      .at(-1);

    let helperClass=String(latest?.kelas||"").trim();

    if(input.checked && !helperClass){
      const rosterSnap=await getDocs(collection(db,"classRoster"));
      const roster=rosterSnap.docs.map(d=>d.data()).find(x=>String(x.nis)===nis);
      helperClass=String(roster?.kelas||"").trim();
    }

    if(input.checked && !helperClass){
      input.checked=false;
      throw new Error("Kelas siswa belum ditemukan. Sinkronkan daftar siswa terlebih dahulu.");
    }

    await updateDoc(doc(db,"users",input.dataset.helperUid),{
      attendanceHelper:input.checked,
      attendanceHelperClass:input.checked?helperClass:"",
      attendanceHelperUpdatedAt:serverTimestamp()
    });

    setMessage(
      "attendanceHelperMessage",
      input.checked
        ? `Akses petugas kehadiran diberikan untuk kelas ${helperClass}.`
        : "Akses petugas kehadiran dicabut."
    );
  }catch(err){
    input.checked=false;
    setMessage("attendanceHelperMessage","Gagal mengubah akses: "+(err.message||err),true);
  }finally{
    input.disabled=false;
  }
});

// Render helper controls whenever Settings opens.
const _oldRenderSettingsV184=renderSettings;
renderSettings=function(){
  _oldRenderSettingsV184();
  setTimeout(renderAttendanceHelpers,0);
  setTimeout(refreshClassRosterStatus,0);
};

function helperCurrentClass(){
  return currentProfile?.kelas || mineV15().at(-1)?.kelas || "-";
}
async function helperStudentList(){return await loadHelperClassRoster();}
async function loadHelperAttendanceToday(){
  const date=isoToday();
  const snap=await getDocs(query(collection(db,"attendance"),where("date","==",date)));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function renderStudentAttendanceHelper(){
  if(currentProfile?.role!=="student"||currentProfile?.attendanceHelper!==true){
    $("helperAttendanceList").innerHTML='<div class="empty">Anda tidak memiliki akses sebagai petugas kehadiran.</div>';
    return;
  }
  const date=isoToday();
  $("helperAttendanceDateLabel").textContent=date;
  $("helperAttendanceList").innerHTML='<div class="empty">Memuat daftar siswa...</div>';
  try{
    const [existing,students]=await Promise.all([loadHelperAttendanceToday(),helperStudentList()]);
    $("helperAttendanceList").innerHTML=students.map(s=>{
      const old=existing.find(x=>String(x.nis)===String(s.nis));
      const status=old?.status||"Hadir";
      const locked=old?.source==="Pengajuan";
      return `<div class="v18-att-row quick ${locked?"helper-locked":""}" data-nis="${escapeAttr(String(s.nis))}" data-status="${escapeAttr(status)}" data-locked="${locked?"1":"0"}">
        <div class="v18-student">
          <b>${escapeHtml(s.name||"-")}</b>
          <small>NIS ${escapeHtml(String(s.nis))}${locked?" · Status dari pengajuan disetujui":""}</small>
          <div class="quick-att-picker hidden">${["Hadir","Sakit","Izin","Alpa"].map(x=>`<button type="button" data-pick="${x}">${x}</button>`).join("")}</div>
        </div>
        <span class="quick-status">${escapeHtml(status)}</span>
      </div>`;
    }).join("")||'<div class="empty">Daftar siswa kelas masih kosong. Minta admin membuka Pengaturan → Petugas Kehadiran lalu tekan Sinkronkan Daftar Siswa.</div>';
  }catch(e){
    console.error(e);
    $("helperAttendanceList").innerHTML=`<div class="empty">Daftar siswa belum dapat dimuat: ${escapeHtml(e?.message||e)}</div>`;
  }
}

$("helperAttendanceList")?.addEventListener("click",e=>{
  const row=e.target.closest(".v18-att-row.quick");if(!row || row.dataset.locked==="1")return;
  const pick=e.target.closest("[data-pick]");
  if(pick){
    e.stopPropagation();
    row.dataset.status=pick.dataset.pick;
    row.querySelector(".quick-status").textContent=pick.dataset.pick;
    row.querySelector(".quick-att-picker")?.classList.add("hidden");
    return;
  }
  row.querySelector(".quick-att-picker")?.classList.toggle("hidden");
});

$("helperResetAllPresentBtn")?.addEventListener("click",()=>{
  document.querySelectorAll("#helperAttendanceList .v18-att-row.quick").forEach(row=>{
    if(row.dataset.locked==="1")return;
    row.dataset.status="Hadir";
    row.querySelector(".quick-status").textContent="Hadir";
    row.querySelector(".quick-att-picker")?.classList.add("hidden");
  });
});

$("helperSaveAttendanceBtn")?.addEventListener("click",async()=>{
  if(currentProfile?.attendanceHelper!==true)return;
  const date=isoToday(),rows=[...document.querySelectorAll("#helperAttendanceList .v18-att-row.quick")];
  setMessage("helperAttendanceMessage","Menyimpan...");
  try{
    const students=await helperStudentList();
    let batch=writeBatch(db),count=0;
    for(const row of rows){
      if(row.dataset.locked==="1")continue;
      const nis=row.dataset.nis,status=row.dataset.status||"Hadir";
      const student=students.find(s=>String(s.nis)===String(nis));
      batch.set(doc(db,"attendance",attendanceDocId(nis,date)),{
        nis,name:student?.name||"",kelas:student?.kelas||currentProfile?.attendanceHelperClass||"",
        date,status,note:"",source:"Petugas Siswa",helperUid:auth.currentUser?.uid||"",updatedAt:serverTimestamp()
      },{merge:true});
      count++;
      if(count%400===0){await batch.commit();batch=writeBatch(db)}
    }
    await batch.commit();
    setMessage("helperAttendanceMessage","Kehadiran berhasil disimpan.");
    await renderStudentAttendanceHelper();
  }catch(e){console.error(e);setMessage("helperAttendanceMessage","Gagal menyimpan: "+e.message,true)}
});

document.querySelectorAll("[data-academic-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.academicPage)));
document.querySelectorAll("[data-admin-go]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.adminGo)));
$("openStudentAttendanceHelperBtn")?.addEventListener("click",()=>{if(currentProfile?.attendanceHelper===true)showPage("studentAttendanceHelper")});


// ===== V18.6 SAFE CLASS ROSTER =====
async function syncClassRosterFromRecords(){
  if(!db || currentProfile?.role!=="admin" || !Array.isArray(records) || !records.length)return 0;

  const latestByNis=new Map();
  records.forEach(r=>{
    if(!r.nis)return;
    const key=String(r.nis);
    const old=latestByNis.get(key);
    if(!old || semesterRank(r.semester)>=semesterRank(old.semester))latestByNis.set(key,r);
  });

  let batch=writeBatch(db),count=0,total=0;
  for(const r of latestByNis.values()){
    const nis=String(r.nis).trim();
    const kelas=String(r.kelas||"").trim();
    if(!nis || !kelas)continue;

    batch.set(doc(db,"classRoster",slug(nis)),{
      nis,
      name:r.nama||"",
      kelas,
      updatedAt:serverTimestamp()
    },{merge:true});

    count++; total++;
    if(count>=400){
      await batch.commit();
      batch=writeBatch(db);
      count=0;
    }
  }

  if(count>0)await batch.commit();
  return total;
}
async function loadHelperClassRoster(){
  const cls=String(currentProfile?.attendanceHelperClass||currentProfile?.kelas||"").trim();
  if(!cls)throw new Error("Kelas petugas belum ditetapkan. Admin perlu menonaktifkan lalu mengaktifkan kembali status Petugas setelah sinkronisasi.");

  // Read permitted classRoster documents, then filter locally.
  // This is more reliable across Firebase Compat and avoids query/index issues.
  const snap=await getDocs(collection(db,"classRoster"));
  return snap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(x=>String(x.kelas||"").trim()===cls)
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""));
}

async function mobileLogout(){try{await signOut(auth)}catch(e){console.error(e)}}
window.addEventListener("error",e=>{
  console.error("Runtime error:",e.error||e.message);
  const app=document.getElementById("app");
  const login=document.getElementById("loginScreen");
  if(app && app.classList.contains("hidden") && login){
    login.classList.remove("hidden");
    document.body.classList.add("auth-locked");
    const msg=document.getElementById("loginMessage");
    if(msg && !msg.textContent)msg.textContent="Aplikasi mengalami kendala saat dimuat. Silakan muat ulang atau login kembali.";
  }
});
window.addEventListener("unhandledrejection",e=>{
  console.error("Unhandled promise:",e.reason);
});

$("syncClassRosterBtn")?.addEventListener("click",async()=>{
  const btn=$("syncClassRosterBtn");
  const status=$("classRosterStatus");
  btn.disabled=true;
  if(status)status.textContent="Menyinkronkan...";
  setMessage("attendanceHelperMessage","Menyinkronkan daftar siswa...");
  try{
    const total=await syncClassRosterFromRecords();
    if(status)status.textContent=total?`${total} siswa tersinkron`:"Tidak ada siswa yang dapat disinkronkan";
    setMessage("attendanceHelperMessage",`${total} siswa berhasil disinkronkan ke daftar kehadiran.`);
    await renderAttendanceHelpers();
  }catch(e){
    if(status)status.textContent="Sinkronisasi gagal";
    setMessage("attendanceHelperMessage","Sinkronisasi gagal: "+(e.message||e),true);
  }finally{
    btn.disabled=false;
  }
});

$("studentFloatingLogoutBtn")?.addEventListener("click",mobileLogout);


async function refreshClassRosterStatus(){
  const el=$("classRosterStatus");
  if(!el || currentProfile?.role!=="admin")return;
  try{
    const snap=await getDocs(collection(db,"classRoster"));
    const count=snap.docs.length;
    el.textContent=count?`${count} siswa tersinkron`:"Belum ada siswa tersinkron";
  }catch(e){
    el.textContent="Status sinkronisasi belum dapat dibaca";
  }
}

$("adminFloatingLogoutBtn")?.addEventListener("click",mobileLogout);
// V18.7 navigation safety fallback
document.addEventListener("click",function(e){
  const s=e.target.closest("[data-student-go]");
  if(s && currentProfile?.role==="student"){
    e.preventDefault();
    showPage(s.dataset.studentGo);
    return;
  }
  const a=e.target.closest("[data-admin-go]");
  if(a && currentProfile?.role==="admin"){
    e.preventDefault();
    showPage(a.dataset.adminGo);
  }
});
