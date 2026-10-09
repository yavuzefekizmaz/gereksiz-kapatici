# ⚡ Voldena Game Booster

[🇺🇸 English version](README.en.md)

Arka plan işlemlerini ve RAM önbelleğini yöneterek bilgisayar oyun performansını artırmak için tasarlanmış gelişmiş bir masaüstü işlem yöneticisi ve optimizasyon aracı.

## ✨ Özellikler

- 🎮 **Oyun Modları**: Valorant ve Counter-Strike 2 gibi oyunlar için özelleştirilmiş hazır ayarlar.
- 🛡️ **Sistem Koruması**: Toplu RAM boşaltma, Windows servislerini durdurma, Explorer kapatma ve CPU önceliği değiştirme devre dışıdır.
- ⚙️ **Uygulama Kapatma**: Seçili ve desteklenen masaüstü uygulamalarına normal kapatma isteği gönderin; gerçekten kapananları oyun bitince geri açın. Kapanmayı reddeden uygulamalar açık kalır.
- 🚀 **Eşlikçi Uygulamalar**: Oyunla birlikte açılacak program zaten çalışıyorsa tekrar başlatılmaz.
- 🛡️ **Korumalı Uygulamalar**: Önemli araçların (VS Code, AnyDesk, OneDrive) kapatılmasını engelleyin.

---

[Efe Kızmaz](https://github.com/yavuzefekizmaz) tarafından geliştirilmiştir.


## Bu düzeltmeyi çalıştırma

Windows üzerinde Node.js kurulu olmalı. Proje klasöründe `npm install`, ardından `npm start` çalıştırın. Yönetici olarak başlatmanız gerekmez. Testler: `npm test`.

Kaynak kod mevcut kurulu EXE’yi kendiliğinden güncellemez. Setup ve portable paketleri [GitHub Releases](https://github.com/yavuzefekizmaz/gereksiz-kapatici/releases/latest) bölümünde yayımlanır. Ayrıntılar ve Windows doğrulaması için [DUZELTME_NOTLARI.md](DUZELTME_NOTLARI.md) dosyasına bakın.

## Güncellemeler

v1.0.1 setup sürümü GitHub üzerinden yeni sürüm kontrolü yapar. Ayarlar → Uygulama Güncellemeleri bölümünden indirip kurabilirsiniz. v1.0.0’da güncelleyici bulunmadığından ilk geçişte yeni setup bir kez çalıştırılmalıdır. Portable sürümün güncellemesi yeni EXE indirilerek yapılır.

`v` ile başlayan ve package.json sürümüyle eşleşen bir etiket gönderildiğinde GitHub Actions Windows x64 setup, portable, güncelleme metadatası ve kaynak ZIP’i oluşturur; testler ve paket kontrolleri başarılıysa sürümü yayımlar.
