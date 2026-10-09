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

v1.2.1 setup sürümü GitHub üzerinden yeni sürüm kontrolü yapar. Ayarlar → Uygulama Güncellemeleri bölümünden indirip kurabilirsiniz. Kurulu v1.2.0 sürümünün güncelleme ekranından yeni yayın denetlenebilir. Yayımlanmış v1.0.0 EXE’sinde güncelleyici bulunmadığından yalnızca o sürümden geçişte setup elle çalıştırılmalıdır. Portable sürümün güncellemesi yeni EXE indirilerek yapılır.

`v` ile başlayan ve package.json sürümüyle eşleşen bir etiket gönderildiğinde GitHub Actions Windows x64 setup, portable, güncelleme metadatası ve kaynak ZIP’i oluşturur; testler ve paket kontrolleri başarılıysa sürümü yayımlar.

## v1.2.2 oyun sonrası çıkış ve tepsi uygulamaları

Varsayılan davranış: oyun algılanır → seçili uygulamalara kapatma uygulanır → eşlikçi uygulamalar başlatılmış olur → Voldena tepsi dahil tamamen çıkar. Programlar oyun bitince geri açılmaz. Sonraki oyun oturumunda Voldena'yı yeniden başlatın. Ayarlardan otomatik çıkışı kapatabilirsiniz.

Seçili OneDrive, AnyDesk ve Overwolf için tepsi uygulamasını sonlandırma desteği eklendi; NVIDIA App / Denetim Masası yalnızca normal pencere kapatma ile ele alınır. Grafik sürücüsü ve NVIDIA Container korunur. Uygulama seçici çalışan programları otomatik yükler. Kaynak kullanımı seçili programların ve Voldena'nın kapanmasıyla azaltılır; donanım saat hızları değiştirilmez.

### v1.2.3 güncelleme düzeltmesi

İndirilen setup dosyası tekrar doğrulanır; mevcut kurulum klasöründe sessiz güncelleme ve otomatik yeniden açılma kullanılır. Kurucu başlatılamazsa Voldena açık kalır ve hata gösterir. Güncelleme günlüğü kullanıcı verisi klasöründe `update.log` dosyasındadır. Windows yayın kontrolü gerçek eski kurulumdan yükseltmeyi ve yeniden başlatmayı doğrular. Güncelleme sonrası v1.2.0'da kalan kullanıcılar yeni setup'ı bir defa elle çalıştırmalıdır; eski portable EXE yerine kurulum kısayolunu açmalıdır.
