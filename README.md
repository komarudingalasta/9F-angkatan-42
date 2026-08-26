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


## V21.9 — Rekap Kehadiran Sinkron Langsung
- Setelah admin menyimpan/perbaiki kehadiran, data attendance dimuat ulang dari Firestore sebelum rekap dirender.
- Rekap, daftar harian, pengajuan, dan dashboard diperbarui dalam satu fungsi refresh terpusat.
- Persetujuan/penolakan izin-sakit juga langsung memicu refresh data terbaru.
- Import kehadiran menggunakan refresh yang sama.
- Firestore Rules tidak berubah.


## V22 — Selaras Data Kehadiran
- Hadir, Sakit, Izin, Alpa, rekap admin, dashboard, kalender, dan siswa memakai satu sumber status final per NIS + tanggal.
- Persentase kehadiran siswa = Hadir / (Hadir + Sakit + Izin + Alpa) × 100.
- Tampilan siswa menampilkan persentase dan jumlah hari hadir dari total hari tercatat.
- Istilah diseragamkan menjadi 'Alpa'.
- Firestore Rules tidak berubah.


## V22.1 — Kehadiran Konsisten per Bulan
- Input harian tetap berdasarkan tanggal yang dipilih.
- Rekap admin dan tampilan siswa memakai fungsi statistik yang sama.
- Ringkasan H/S/I/A, persentase, kalender, dan riwayat siswa semuanya mengikuti bulan yang dipilih.
- Rekap admin menampilkan Hari Tercatat.
- Hari tanpa record tidak dihitung sebagai Hadir/Alpa dan ditampilkan sebagai Belum tercatat.
- Persentase = Hadir / Hari Tercatat × 100.
- Firestore Rules tidak berubah.


## V22.2 — Canonical Attendance + Helper Schedule
- Koreksi admin menghapus record legacy/duplikat NIS+tanggal dan menulis satu dokumen canonical.
- Koreksi admin selalu menjadi source Manual dan langsung menyelaraskan input, rekap, dashboard, dan data siswa.
- Petugas siswa hanya dapat membuka/mengisi kehadiran untuk tanggal hari ini.
- Akses petugas otomatis off Sabtu, Minggu, dan daftar hari libur nasional Indonesia 2026.
- Admin tetap dapat memperbaiki tanggal lampau.
- Firestore Rules tidak berubah; pembatasan kalender petugas dilakukan di aplikasi.


## V22.3 — Ringkasan Kehadiran Keseluruhan
- Kalender kehadiran tetap per bulan.
- Ringkasan Hadir/Sakit/Izin/Alpa menghitung seluruh data kehadiran final siswa.
- Persentase kehadiran menghitung seluruh hari tercatat.
- Riwayat kehadiran dan pengajuan tampil secara keseluruhan.
- Mengganti bulan hanya memperbarui kalender, tidak mengubah ringkasan.
- Firestore Rules tidak berubah.


## V22.4 — Early Warning Siswa
- Kehadiran dianalisis berdasarkan 30 hari terakhir, bukan reset awal bulan.
- Indikator: Alpa ≥3, kehadiran <90% (min. 5 hari tercatat), Izin+Sakit ≥5, rata-rata terbaru <70, rata-rata turun ≥5, mapel turun ≥10.
- Prioritas Tinggi bila ≥2 indikator atau Alpa ≥5.
- Dashboard dapat menampilkan seluruh siswa, tidak lagi berhenti pada 6 siswa.
- Klik siswa membuka alasan dan ringkasan akademik/kehadiran.
- Firestore Rules tidak berubah.


## V22.5 — Izin/Sakit Terlihat & Terkunci untuk Petugas
- Izin/Sakit yang disetujui admin langsung menjadi status attendance final.
- Petugas siswa melihat label Izin/Sakit · Disetujui Admin.
- Status pengajuan disetujui tidak dapat diklik atau diubah petugas.
- Halaman petugas menampilkan ringkasan siswa yang sudah Izin/Sakit.
- Sebelum menyimpan, aplikasi membaca ulang attendance hari ini untuk mencegah race condition jika admin baru saja menyetujui pengajuan.
- Setelah simpan, daftar dimuat ulang sehingga status persetujuan terbaru langsung terlihat.
- Firestore Rules tidak berubah; Rules yang ada sudah melarang petugas menimpa source Pengajuan.


## V22.6 — Reset Harian Petugas Kehadiran
- Setiap hari tampilan petugas siswa dimulai ulang dengan default Hadir.
- Data Hadir/Alpa petugas dari hari lain tidak pernah terbawa.
- Bahkan jika record hari ini sudah ada dari sumber non-Pengajuan, tampilan awal petugas tetap kembali ke default Hadir sebelum pengisian.
- Hanya Izin/Sakit dari Pengajuan yang sudah disetujui admin yang otomatis tampil dan terkunci.
- Admin tetap melihat status final sebenarnya pada halaman admin.
- Firestore Rules tidak berubah.
