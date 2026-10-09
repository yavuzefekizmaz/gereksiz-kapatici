## Voldena v1.2.3

Güncelleme kurulumunun başlamadan uygulamayı kapatabilmesine ve kurulum sonrasında yeniden açılmamasına karşı güncelleme akışı düzeltildi.

- İndirilen setup dosyasının varlığı, Windows EXE başlığı ve GitHub güncelleme bilgisindeki SHA-512 değeri kurulumdan önce tekrar doğrulanır.
- Kurucu mevcut çalışan uygulamanın klasörüne yönlendirilir. NSIS güncellemesi sessiz modda, kurulum tamamlandığında uygulamayı yeniden açma seçeneğiyle başlatılır.
- Kurucunun Windows tarafından başlatıldığı doğrulanmadan Voldena kapanmaz. Başlatma hatasında uygulama açık kalır, hata gösterilir ve tekrar denemek mümkündür.
- Güncelleme işlemleri uygulamanın kullanıcı verisi klasöründeki `update.log` dosyasına yazılır.
- v1.2.2'deki otomatik uygulama listesi, oyun işlemleri tamamlanınca tamamen çıkış, seçili tepsi uygulamalarını kapatma ve sistem süreçlerini koruma değişiklikleri korunur.

### v1.2.0'da kalan kullanıcılar

Eski sürümün güncelleyicisi yeni kod kurulmadan değiştirilemez. Güncelleme sonrasında hâlâ v1.2.0 görünüyorsa **aşağıdaki setup dosyasını bir kez elle indirip çalıştırın**. Eski uygulamayı tepsiden de tamamen kapatın ve mevcut kurulum klasörünü seçin. Kurulumdan sonra uygulamada v1.2.3 göründüğünü kontrol edin. Eski portable EXE'yi açmak kurulu uygulamayı açmakla aynı şey değildir; setup'ın oluşturduğu kısayolu kullanın. Uygulama verileri kurulum sırasında silinmez.

- **Setup:** `Voldena.Oyun.Hizlandiricisi.Setup.1.2.3.exe`
- **Portable:** `Voldena.Oyun.Hizlandiricisi.1.2.3.exe` — yeni EXE indirerek güncellenir.
- **Kaynak:** `Voldena.Source.1.2.3.zip`

36 otomatik testin yanında Windows yayın iş akışı, gerçek v1.2.2 setup kurulumunu yeni setup ile aynı klasörde güncelleyip sürüm değişikliğini ve uygulamanın otomatik yeniden başlamasını doğrular. Bu kontrol başarılı olmadan yayın yapılmaz. Kullanıcının v1.2.0 kurulumunun başarısızlık nedeni, o sürümün yerel günlükleri olmadan kesinleştirilemez. EXE'ler Windows x64 içindir ve imzasızdır.
