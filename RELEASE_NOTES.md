## Voldena v1.2.2

- Oyun açılışındaki uygulama kapatma ve eşlikçi uygulama başlatma işlemleri tamamlanınca Voldena tepsi dahil tamamen çıkar. Bu seçenek varsayılan olarak açıktır; oyun sonrası otomatik geri açma kapalıdır. Sonraki oyun oturumu için Voldena yeniden başlatılır.
- Seçili OneDrive örneklerine `/shutdown` gönderilir. Kişisel ve okul hesaplarının aynı oturumdaki örnekleri birlikte ele alınır.
- Seçili OneDrive, AnyDesk ve Overwolf normal çıkıştan sonra açık kalırsa yalnızca doğrulanan kullanıcı işlemi sonlandırılabilir. Overwolf'un bilinen yardımcı uygulamaları da kapsanır; işlem ağacı sonlandırılmaz.
- Önceki koruma listesinde kapatılmak üzere seçilmiş OneDrive / AnyDesk için çakışan varsayılan koruma kaldırılır. Diğer korumalar korunur.
- NVIDIA App ve NVIDIA Denetim Masası pencerelerine normal kapatma isteği gönderilir. NVIDIA Container, grafik sürücüsü, NVIDIA Overlay, Windows servisleri, Explorer ve oyun başlatıcıları sonlandırılmaz. NVIDIA'nın sürücüye ait tepsi simgesi kalabilir; bu simgenin kaybolması için sürücü servisi durdurulmaz.
- Arka plandaki PowerShell/tasklist komutları konsol penceresi açmayacak şekilde çalıştırılır. Voldena'nın kendi donanım grafik hızlandırması kapatıldı. Otomatik çıkışta açılır bildirim gösterilmez. Sistem çözünürlüğü, ekran tazeleme hızı, GPU sürücüsü, işlemci saat hızı ve sistem genelindeki RAM çalışma kümeleri değiştirilmez.
- Uygulama seçici açılır açılmaz çalışan uygulamaları yükler. Bu yükleme, yüklü program taramasından bağımsızdır; tarama yavaşlasa veya hata verse bile çalışan liste görüntülenir. Çalışan sekmesine geçildiğinde de liste otomatik yenilenir.
- Son işlemin kapanan, kapatılamayan ve atlanan uygulamaları yeniden açıldığında arayüzde görülebilir.

31 otomatik test Windows yayın iş akışında çalıştırılır; 30 test yerel ortamda başarılı, PowerShell sözdizimi testi Windows üzerinde çalışır. Windows derlemesindeki paket ve kaynak eşleşmesi ayrıca doğrulanır. Kullanıcının bilgisayarındaki kısa siyah ekranın giderildiği ve tüm uygulamaların gerçekten kapandığı bu ortamda doğrulanamaz. Belirli bir FPS artışı veya anti-cheat sonucu garanti edilmez.

### İndirme / güncelleme

- **Setup:** `Voldena.Oyun.Hizlandiricisi.Setup.1.2.2.exe`
- **Portable:** `Voldena.Oyun.Hizlandiricisi.1.2.2.exe`
- **Kaynak:** `Voldena.Source.1.2.2.zip`

v1.2.1 setup sürümünde Ayarlar → Uygulama Güncellemeleri bölümünden kontrol edip indirin; oyunu kapattıktan sonra kurulumu başlatın. Portable sürüm yeni EXE indirilerek güncellenir. Mevcut oyun profilleri korunur. EXE'ler Windows x64 içindir ve imzasızdır.
