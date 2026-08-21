# PakKom Student Analytics — Firebase Edition

Web analisis perkembangan nilai siswa untuk maksimal sekitar 60 siswa. Data tersimpan di **Cloud Firestore** sehingga dapat dibuka dari beberapa perangkat. Login menggunakan **Firebase Authentication Email/Password**.

## Fitur

- Firebase Authentication
- Cloud Firestore
- Upload leger Excel `.xlsx` / `.xls`
- Mapping kolom sebelum import:
  - NIS/NISN
  - Nama
  - Kelas
  - Semester
  - Mata Pelajaran
  - Abaikan
- Nama mapel dapat diubah sebelum import
- Kolom ranking, jumlah, rata-rata, sakit, izin, alpa dapat diabaikan
- Dashboard perkembangan nilai
- 60 Student Pulse
- Growth Index
- Most Improved Student
- Student Journey
- Personal Best
- Kekuatan dan fokus pengembangan
- Analisis mapel
- Pengaturan nama/singkatan/status mapel
- Responsive desktop / tablet / HP

## Struktur Firestore

### `records/{recordId}`

```text
nis
nama
kelas
semester
scores {
  matematika: 90
  ipa: 85
}
updatedAt
```

### `subjects/{subjectKey}`

```text
key
name
short
order
active
updatedAt
```

## Setup Firebase

### 1. Buat project Firebase

Buka Firebase Console dan buat project.

### 2. Tambahkan Web App

Project Settings → Your apps → pilih Web.

Salin konfigurasi Firebase ke `firebase-config.js`.

Contoh:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

### 3. Aktifkan Authentication

Firebase Console → Authentication → Sign-in method → aktifkan **Email/Password**.

Kemudian buat akun admin di Authentication → Users → Add user.

Login web menggunakan email dan password akun ini.

### 4. Buat Firestore Database

Firebase Console → Firestore Database → Create database.

Setelah database dibuat, gunakan isi `firestore.rules` sebagai Rules lalu **Publish**.

Rules yang disediakan hanya mengizinkan akses bila pengguna sudah login Firebase Authentication.

### 5. Deploy gratis

#### Pilihan A — GitHub Pages

Upload seluruh file repository ke GitHub lalu aktifkan:

Settings → Pages → Deploy from a branch → `main` → `/root`.

Firebase Authentication + Firestore tetap dapat digunakan dari GitHub Pages.

Tambahkan domain GitHub Pages Anda ke:

Firebase Authentication → Settings → Authorized domains

Contoh:

```text
username.github.io
```

#### Pilihan B — Firebase Hosting

Jika memakai Firebase CLI:

```bash
firebase login
firebase use --add
firebase deploy
```

File `firebase.json` dan `firestore.rules` sudah disediakan.

## Catatan keamanan

Konfigurasi Web Firebase (`apiKey`, `projectId`, dll.) memang berada pada client web. Keamanan database tidak bergantung pada kerahasiaan konfigurasi tersebut, tetapi pada Firebase Authentication dan Firestore Security Rules.

Versi rules repository ini cocok untuk sistem sederhana dengan hanya akun admin yang dibuat di Firebase Authentication. Jika nanti dibuat login siswa, rules harus ditingkatkan agar siswa hanya dapat membaca data miliknya sendiri.

## Data Excel

Tidak ada file Excel yang disimpan ke Firebase. Browser membaca Excel menggunakan SheetJS, lalu hanya data nilai hasil parsing yang dikirim ke Firestore.

Saat upload, selalu periksa Mapping Kolom dan Preview Import sebelum memilih **Simpan Data Valid ke Firebase**.


## Template Upload Excel
File `template-upload-pakkom-student-analytics.xlsx` sudah tersedia di repository dan dapat diunduh langsung dari halaman Upload Leger.
Kolom inti: NIS/NISN, Nama, Kelas, Semester. Setelahnya boleh menambahkan mata pelajaran sebanyak yang dibutuhkan.


## V6 — Akses Siswa dengan NIS

### Admin pertama kali
Sebelum memakai Rules V6, buat dokumen Firestore berikut untuk akun admin yang sudah ada:

`users/{UID_ADMIN}`

Field:
- `role` = `admin`
- `name` = nama admin
- `email` = email Firebase admin

UID admin dapat dilihat di Firebase Console → Authentication → Users.

Setelah dokumen admin dibuat, publish isi `firestore.rules` V6.

### Membuat akses siswa
Admin login → Pengaturan → Akses Login Siswa:
1. Pilih siswa berdasarkan NIS.
2. Masukkan PIN minimal 6 karakter.
3. Klik **Buat / Reset Akses**.

Sistem membuat akun Firebase internal dengan format:
`NIS@siswa.pakkom.local`

Siswa tidak perlu mengetahui email internal tersebut. Di halaman login, siswa cukup memilih **Siswa**, memasukkan **NIS** dan **PIN**.

### Yang dapat dilihat siswa
Siswa hanya mendapat UI untuk:
- Nilai dirinya sendiri.
- Rata-rata masing-masing mata pelajaran di kelas.
- Rata-rata rapor kelas.
- Ranking dirinya di kelas.

Rata-rata kelas dan ranking disimpan di koleksi `studentSummaries`, sehingga siswa tidak perlu membaca nilai siswa lain.

### Setelah import nilai
V6 otomatis membangun ulang:
- rata-rata mapel per kelas,
- rata-rata rapor kelas,
- ranking siswa,
setelah admin menyimpan leger ke Firebase.


## V8 — Sidebar readable + Logout + password otomatis

- Desktop/tablet: menu menggunakan sidebar dengan ikon dan tulisan.
- HP: tombol **☰ Menu** membuka sidebar dari kiri. Sidebar tetap menampilkan ikon **dan tulisan**, bukan ikon saja.
- Tombol **Keluar** selalu tersedia di bagian bawah sidebar.
- Siswa: username = NIS, password default = `123456`.
- Admin dapat membuat akun seluruh siswa sekaligus.
- Portal siswa hanya menampilkan nilai sendiri, rata-rata mapel kelas, rata-rata rapor kelas, dan ranking dirinya.


## V9 — Perbaikan Logout dan Data Siswa

- Memperbaiki bug HP yang membuat dashboard tetap terlihat sesudah logout.
- Logout sekarang menghapus tampilan aplikasi dan hanya menampilkan halaman login.
- Admin otomatis memeriksa `studentSummaries` saat login.
- Jika ringkasan/ranking belum terbentuk atau jumlahnya tidak sesuai data nilai, sistem membangunnya otomatis.
- Siswa tetap dapat melihat nilai pribadinya walaupun ringkasan kelas belum tersedia.
- Setelah admin login satu kali, rata-rata mapel kelas, rata-rata rapor kelas, dan ranking akan diperbarui otomatis.


## V10 — Login bersih & nama menu baru

- Mengganti **60 Student Pulse** menjadi **Peta Perkembangan Siswa**.
- Saat belum login, seluruh aplikasi disembunyikan secara paksa.
- Tombol Menu dan Dashboard tidak lagi muncul di bawah halaman login.
- Setelah logout, hanya halaman login yang tampil.
- Dashboard menampilkan status koneksi/data:
  - sedang membaca Firebase,
  - data berhasil dimuat,
  - belum ada data nilai,
  - atau error Firestore.


## V11 — Portal siswa lebih lengkap

Akun siswa tetap hanya dapat membaca data miliknya sendiri, tetapi kini memiliki:
- Beranda Saya
- Nilai Saya
- Grafik Perkembangan
- Analisis Saya
- Perbandingan Kelas
- Ranking Saya
- Keluar

Tidak ada nama atau nilai siswa lain yang ditampilkan. Perbandingan kelas hanya memakai nilai agregat/rata-rata kelas.


## V12 Bug Fixes
- Sesi siswa tetap aktif setelah refresh.
- Semua menu siswa dirender saat dibuka.
- Filter semester/kelas admin diterapkan ke Dashboard, Peta Perkembangan, Daftar Siswa, Analisis Mapel, dan Data Nilai.
- Nilai dashboard semester terpilih berasal dari semester tersebut, dengan perbandingan ke semester sebelumnya.


## V13
- Login Admin/Siswa digabung menjadi satu form.
- Email mengandung @ = admin; input tanpa @ = NIS siswa.
- Auth persistence dipasang sebelum listener auth sehingga sesi siswa bertahan setelah refresh.
- Setelah refresh role dibaca dari profil Firestore.
- Siswa masuk ke Beranda Saya setelah autentikasi.
- Semua grafik garis menampilkan angka nilai pada setiap titik.


## V14
- Istilah siswa "Ranking" diganti menjadi "Posisi Akademik".
- Ditambahkan penjelasan bahwa posisi semester dibandingkan dengan kelompok siswa yang berada di kelas saat ini.
- Teks login disederhanakan.
- Istilah teknis Firebase/Firestore dihilangkan dari pesan yang dilihat pengguna.


## V16.2
- Student header renamed to Ringkasan.
- Mobile menu moved to top-left.
- Student success banner hidden to reduce clutter.
- Academic-position history now compares each semester against the CURRENT CLASS cohort, not the student's historical class.
- Missing cohort ranks display as — instead of misleading rank 0.


## V17 — Correct Current-Class Academic Position
- Fixed `addDoc` Firestore import for leave requests.
- Academic position is precomputed by admin using each student's **current class cohort**.
- Historical semester positions compare the student with classmates who are in the same class **now**, using those classmates' scores from that historical semester.
- Student accounts read only their own `records` and `studentSummaries`; they do not need access to classmates' private grades.
- Existing legacy summaries are automatically rebuilt when an admin logs in.
- Student chart and subject comparisons now use `studentSummaries` instead of attempting to calculate from inaccessible peer records.


## V17.1
- Student top Menu/header removed on mobile.
- Student opens directly to Academic.
- Student navigation reduced to bottom tabs: Academic and Attendance.
- Sidebar/drawer is not shown for student accounts.
- Attendance page reorganized into attendance ring, H/S/I/A breakdown, leave request, calendar, and history.


## V17.2 — White Screen Fix
- Fixed a fatal JavaScript duplicate `const` declaration in student bottom navigation.
- Student mobile layout now uses explicit `student-mode` instead of relying on `:has()` selectors.
- Student screen starts directly on Academic and uses only bottom navigation for Academic / Attendance.
- Added render fallbacks so a single component error no longer leaves a completely blank white screen.
