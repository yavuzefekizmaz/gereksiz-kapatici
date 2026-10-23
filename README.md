# Voldena Oyun Hızlandırıcı — 1.5

Windows için oyun ve uygulama profilleri. Kapatılacak, oyunla açılacak ve oyun bitince açılacak uygulamalar ayrı listelerdir. Otomatik algılanan oyuna tıklayarak özel profil oluşturabilirsiniz.

- Normal otomatik çıkış artık işlemler bittikten **3 dakika** sonradır. Hızlandır ve Kapat masaüstü kısayolu ise açık oyunu hemen işler ve çıkar.
- Profildeki **Oyun bitince açılacak uygulamalar** listesi bağımsız penceresiz izleyiciyle çalışır; Voldena kapansa da yalnızca seçtikleriniz açılır. Wallpaper Engine resmî stop/play komutlarıyla yönetilir.
- Kısa sonuç ana ekranda, ayrıntılar **Ayarlar → İşlem Günlükleri** içindedir. **Bunu bir daha kapatma** düğmesi uygulamayı beyaz listeye ekler.
- Disk taraması düğmeyle başlar; sonuçlar sekme değiştirince korunur. Geçici dosya önizlemesi eksik/başarısız okumayla gerçekten boş sonucu ayırır.
- Sayfalar arasında ilerleyen tanıtım turu, on tema ve özel arka plan/menü/üst çubuk/vurgu renkleri vardır.
- Toplu kapatma yalnızca seçili desteklenen kullanıcı uygulamalarını işler. Yüksek CPU/RAM önerileri kullanıcı onayı ister. Windows, sürücüler, oyunlar ve korumalı uygulamalar kapanmaz.
- Explorer her seviyede varsayılan korunur; geçici kapatma yeni açık onay ve ayrı kurtarma izleyicisi gerektirir. Ctrl+Alt+R, tepsi ve ana sayfa kurtarma seçenekleri bulunur. Sistem genelinde zorla RAM boşaltılmaz.

Paketler dijital olarak imzalı değildir. SHA256SUMS indirme bütünlüğünü kontrol eder; bağımsız yayıncı kimlik doğrulaması değildir. Kesin FPS artışı veya tüm donanım/sürücü sorunlarının olmayacağı vaat edilmez.

[Güncel indirmeler](https://github.com/yavuzefekizmaz/gereksiz-kapatici/releases/latest) · [Kullanıcı test adımları](TEST_GUIDE_TR.md) · [Sürüm notları](RELEASE_NOTES.md)

Geliştirme için Node.js 24 kullanılır. Aşağıdaki bölümler önceki sürümlerin tarihsel açıklamalarını da içerir; güncel davranış yukarıdaki 1.5 maddeleridir.

## Önceki sürümlerin notları

[🇺🇸 English version](README.en.md)

Arka plan işlemlerini ve RAM önbelleğini yöneterek bilgisayar oyun performansını artırmak için tasarlanmış gelişmiş bir masaüstü işlem yöneticisi ve optimizasyon aracı.

## ✨ Özellikler

- ⚡ **Hızlandır ve Kapat**: Masaüstündeki kısayola çift tıklayın. Açık oyunun kayıtlı profili (veya otomatik oyun ayarları) hemen uygulanır, sonuç kaydedilir ve Voldena tamamen kapanır. Normal uygulama açıkken de çalışır. Oyun bulunmazsa hiçbir arka plan uygulaması kapatılmaz; Windows bildirimi gösterilir. Sonuç raporu `%APPDATA%\voldena\last-quick-boost.json` içindedir. Portable dosyası da `--quick-boost` seçeneğini destekler.

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
