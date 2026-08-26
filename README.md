# PakKom Student Analytics — V20 Clean Rebuild

Versi ini adalah rebuild bersih. Tidak membawa struktur halaman/CSS lama dari V15–V18.

## Struktur
- Login otomatis mengenali email admin atau NIS siswa.
- Admin: Ringkasan, Akademik, Kehadiran, Pengaturan.
- Siswa: Akademik, Kehadiran.
- Petugas kehadiran ditentukan langsung dari web admin.
- Petugas tetap ber-role student dan hanya dapat mengisi kelas yang ditetapkan.
- Pengajuan Izin/Sakit yang disetujui admin otomatis menulis ke attendance dan rekap.
- Lampiran foto menggunakan Google Apps Script/Drive yang sudah dikonfigurasi.
- Mobile memakai satu bottom navigation; desktop memakai satu sidebar. Tidak ada menu ganda.

## Setelah deploy
1. Upload seluruh isi repository ke root GitHub.
2. Publish `firestore.rules`.
3. Login admin.
4. Pengaturan → Sinkronkan Daftar Siswa.
5. Pilih petugas kehadiran dari web.
6. Logout dan uji akun siswa petugas.

## Catatan
Collection yang digunakan: users, records, studentSummaries, subjects, classRoster, attendance, leaveRequests.


## V21 UI & Insight
Dashboard command center, status absensi harian, panel Perlu Perhatian, kalender kehadiran siswa, dan indikator absensi tersimpan. Firestore Rules tidak berubah dari V20.


## V21.1 Permissions Fix
- Firestore Rules diselaraskan dengan query V21.
- `get` dan `list` dibuat eksplisit.
- Helper functions Rules aman jika profil belum ada.
- Loader data sekarang menunjukkan collection yang ditolak jika terjadi permission error.
- Firestore Rules BERUBAH dan wajib dipublish.


## V21.2 Helper Attendance Query Fix
- Query attendance petugas difilter berdasarkan tanggal dan kelas tugas.
- Query diselaraskan dengan Firestore Rules.
- Pesan error untuk permission/index dibuat lebih spesifik.
- Firestore Rules tidak berubah dari V21.1.


## V21.3 Helper Identity Fix
- Fixed critical user UID mapping bug that could assign helper access to the wrong student (e.g. first/undefined UID user).
- Users loaded from Firestore now always carry uid=documentId.
- Helper checkbox uses uid||id defensively.
- classRoster helper query is restricted to the assigned class.
- classRoster Rules are restricted to helperClass and therefore changed.
- Firestore Rules MUST be republished.


## V21.4 Simple Helper Attendance + No Login Flicker
- Petugas siswa hanya memilih Hadir atau Tidak Hadir.
- Tidak Hadir disimpan sebagai Alpa.
- Sakit/Izin hanya dapat ditetapkan admin atau berasal dari pengajuan yang disetujui.
- Rules membatasi write petugas hanya status Hadir/Alpa.
- Startup screen menunggu Firebase memulihkan sesi sehingga login tidak berkedip saat refresh.
- Firestore Rules BERUBAH dan wajib dipublish.


## V21.5 — Tambah Siswa Manual
- Admin dapat menambah siswa satu per satu dari Pengaturan.
- Form: NIS, nama, kelas, password awal.
- Secondary Firebase Auth mencegah sesi admin berubah menjadi akun siswa baru.
- users/{uid} dan classRoster dibuat otomatis.
- NIS duplikat dicek.
- Lampiran izin tetap dapat memilih galeri/file/kamera.
- Firestore Rules disertakan dan selaras dengan V21.4/V21.5.


## V21.6 — Attendance Final Status Fix
- Satu siswa dan satu tanggal hanya dihitung satu status final.
- Alpa yang kemudian disetujui sebagai Izin/Sakit tidak lagi ikut terhitung.
- Pengajuan yang disetujui memiliki prioritas tertinggi pada rekap, dashboard, kalender, dan ringkasan siswa.
- Saat persetujuan, duplikat lama pada NIS + tanggal yang sama dibersihkan.
- Firestore Rules tidak berubah dari V21.5.


## V21.7 — Kelola Nilai Admin
- NIS + semester menjadi kunci nilai; upload terbaru menimpa data semester lama.
- Jika file upload mengandung NIS + semester berulang, baris terakhir yang dipakai.
- Admin dapat Edit dan Hapus nilai per siswa/semester.
- Hapus hanya menghapus nilai semester terkait, bukan akun siswa.
- Ringkasan, posisi akademik, grafik, dan dashboard dihitung ulang setelah perubahan.
- Siswa tetap read-only; Firestore Rules tidak berubah dari V21.6.


## V21.8 — Foto Bukti Wajib
- Pengajuan Izin dan Sakit wajib melampirkan foto bukti.
- Submit ditolak bila foto belum dipilih.
- Pengajuan baru disimpan setelah upload foto berhasil.
- Preview/foto lama direset setiap membuka form pengajuan.
- Firestore Rules tidak berubah dari V21.7.
