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
