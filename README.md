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
