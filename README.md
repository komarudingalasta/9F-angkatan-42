# PakKom Student Analytics

Repository siap deploy ke GitHub Pages.

## Login demo
- Username: `admin`
- Password: `123456`

## Fitur
- Dashboard modern
- Maksimal 60 siswa
- Upload leger Excel
- Preview import
- Mapping kolom
- 60 Student Pulse
- Student Journey
- Growth Index
- Personal Best
- Most Improved Student
- Analisis mapel
- Pengaturan nama mata pelajaran
- Tampilan responsif desktop dan HP

## Format Excel
Minimal memiliki kolom:
- NIS / NISN
- Nama / Nama Siswa
- Kelas / Rombel
- Semester

Kolom angka lainnya dibaca sebagai nilai mata pelajaran.

## Deploy GitHub Pages
1. Buat repository baru di GitHub.
2. Upload semua file dari repository ini ke root repository.
3. Buka **Settings > Pages**.
4. Pada **Build and deployment**, pilih **Deploy from a branch**.
5. Pilih branch **main** dan folder **/root**.
6. Simpan.

## Catatan
Versi ini menyimpan data di `localStorage` browser, jadi tetap gratis tanpa server/database.
