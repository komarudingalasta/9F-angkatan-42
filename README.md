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
