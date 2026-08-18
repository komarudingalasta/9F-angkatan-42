# PakKom Student Analytics

Web statis untuk menganalisis perkembangan nilai siswa dari leger Excel.

## Login demo
- Username: `admin`
- Password: `123456`

## Fitur
- Login sederhana
- Upload file Excel `.xlsx` / `.xls`
- Penyimpanan data lokal di browser (localStorage)
- Dashboard jumlah siswa, rata-rata, siswa meningkat, dan siswa perlu dipantau
- Grafik perkembangan rata-rata semester
- Grafik rata-rata mata pelajaran
- Analisis perkembangan per siswa
- Analisis tren per mata pelajaran
- Filter semester dan kelas
- Export data JSON
- Template CSV

## Format Excel
Minimal memiliki:
- NIS atau NISN (disarankan)
- Nama / Nama Siswa
- Kelas
- Semester

Kolom lainnya yang berisi angka akan dianggap sebagai mata pelajaran.

Contoh:
| NIS | Nama | Kelas | Semester | Matematika | IPA | Bahasa Indonesia |
|---|---|---|---|---:|---:|---:|
| 1001 | Ahmad | 8A | 2025/2026-1 | 82 | 84 | 86 |

## Menjalankan
Bisa langsung membuka `index.html` pada browser modern.

Untuk GitHub Pages:
1. Buat repository baru.
2. Upload `index.html`, `style.css`, dan `app.js`.
3. Buka Settings > Pages.
4. Deploy dari branch `main`, folder `/root`.

## Catatan keamanan
Versi ini menggunakan login lokal dan localStorage, sehingga cocok untuk prototipe/uji coba.
Untuk penggunaan sekolah sungguhan, autentikasi dan data sebaiknya dipindahkan ke Firebase Authentication + Firestore atau backend lain.
