# Voldena düzeltme notları

İncelenen depo: https://github.com/yavuzefekizmaz/gereksiz-kapatici

## Bulgular

Orijinal sürüm oyun tetiklendiğinde her seviyede oyunun CPU önceliğini High yapıyor ve tüm erişilebilir işlemlerin RAM çalışma kümelerini boşaltıyor. Yüksek seviyede DiagTrack, WSearch ve Spooler servislerini durdurabiliyor; ayara göre Explorer'ı da kapatıyor. Özel kurallarda Smart Sweep koruma listesinde olmayan her işlemi hedefleyebiliyor. Kapatma komutu `taskkill /F /IM ... /T`: uygulamayı ve alt işlemlerini zorla sonlandırıyor. Tarayıcı, oyun, sürücü ve servisleri yalnızca isimlerden oluşan eksik bir koruma listesiyle ayırmak güvenilir değil.

Sesin devam ettiği ve Alt+Tab'ın görüntüde değişiklik yaptığı bildirilmiştir. Bu, tamamen durmuş bir sistemden farklıdır; masaüstü/görüntü/giriş sorunuyla da uyumludur. Bu ortamda Windows olay günlükleri veya sürücü tanılaması yoktur. Yukarıdaki riskler kodda doğrulanmıştır; bildirilen sorunun kesin nedeni ve düzeltmenin o bilgisayardaki sonucu henüz doğrulanmamıştır.

## Değişiklikler

- Smart Sweep, RAM çalışma kümesi boşaltma, CPU önceliği değiştirme, Windows servisi durdurma/başlatma ve Explorer kapatma kaldırıldı. Eski ayarlar bu işlemleri açamaz.
- Normal kapatma yalnızca Chrome, Edge, Opera, Firefox, Brave, Discord (PTB/Canary dahil), Spotify, Telegram, WhatsApp, Skype ve VLC için desteklenir. Korunan uygulamalar ve aktif oyun her durumda hariç tutulur.
- Aynı Windows oturumunda, Windows klasörü dışında bulunan, dosya adı doğrulanan ve penceresi olan uygulamalara CloseMainWindow gönderilir. Zorla sonlandırma veya alt işlem ağacını kapatma yoktur. Kapanmayan program açık kalır. Bu yüzden bazı tepsi uygulamaları kapanmayabilir.
- Yalnızca kapandığı doğrulanan uygulamalar geri açma listesine eklenir. Çok geç kapanan uygulamalar otomatik geri açma listesine girmeyebilir.
- Oyunla birlikte açılacak uygulama, EXE adı veya dosya yolu üzerinden çalışan işlemlerle karşılaştırılır. Zaten açıksa tekrar başlatılmaz. Seçilen ad başka bir EXE'ye çözümleniyorsa o EXE de kontrol edilir. Liste alınamazsa mükerrer başlatmayı önlemek için açılış atlanır. Web adresleri bu kontrolden ayrıdır; adresin tarayıcı sekmesinde açık olup olmadığı denetlenmez.
- Oyun bitince geri açılacak uygulama kullanıcı tarafından zaten açılmışsa tekrar başlatılmaz.
- Süreç listesi alınamazsa oyun kapandı kabul edilmez. Boş kapatma listesi varsayılan programları kapatmaz.
- Otomatik yönetici yükseltmesi kaldırıldı. Düşük mod yalnızca izler; orta ve yüksek mod aynı sınırlı, normal kapatmayı uygular. Arayüz metinleri buna göre güncellendi.
- package-lock.json paket tanımıyla eşitlendi. Depoda bulunmayan build/icon.ico referansı kaldırıldı; paketleyici varsayılan simgeyi kullanabilir.

## Windows'ta çalıştırma

Kaynak ZIP’i hazır bir EXE değildir. Windows setup ve portable dosyaları GitHub Releases altında ayrıca yayımlanır. Kaynak ZIP’i bilgisayarınızdaki kurulu sürümü değiştirmez.

1. Eski Voldena'yı sistem tepsisinden tamamen kapatın; eski sürüm başlangıçta çalışıyorsa o başlangıç girişini kapatın.
2. ZIP'i ayrı bir klasöre çıkarın. Node.js kuruluysa proje klasöründe terminal açın.
3. `npm install` çalıştırın.
4. `npm start` çalıştırın. Yönetici olarak çalıştırmanız gerekmez.
5. Windows'ta kurulum dosyası üretmek için `npm run dist` kullanılabilir. Windows paketleri GitHub Actions ile oluşturulur.

## Doğrulama

`npm test`: 17 test başarılı. İşlem komutları taklit edilmiştir; gerçek sistem işlemleri sonlandırılmamıştır. Kritik/bilinmeyen hedeflerin engellenmesi, koruma adlarının normalleştirilmesi, zorla sonlandırma olmaması, başarısız kapatmanın geri açma listesine eklenmemesi, eski agresif ayarların etkisiz olması, başarısız sorgunun yanlış oyun çıkışı üretmemesi ve eşlikçi uygulama tekrar açılışının engellenmesi denetlenir.

Windows'ta henüz yapılmamış kontroller:

1. Düşük modda oyun açılışı: masaüstü, Alt+Tab ve giriş çalışmalı; uygulama kapatılmamalı.
2. Tracker zaten açıkken ilgili oyunu açın: ek bir Tracker başlatılmamalı.
3. Tracker kapalıyken oyunu açın: seçilen Tracker başlatılmalı. Kuralda programın gerçek EXE'sini veya tam yolunu seçin; başka bir başlatıcı seçilirse onun işlemi kontrol edilir.
4. Orta modda tek bir desteklenen uygulamayla normal kapatma ve oyun çıkışında geri açmayı doğrulayın. Windows servisleri ve Explorer açık kalmalı.

Bu kontroller ve bildirilen görüntü/giriş sorununun giderilmesi Windows bilgisayarda doğrulanmalıdır. Kesin çözüm iddiası yoktur.

## Güncelleme yayını

v1.0.1 setup sürümüne electron-updater tabanlı GitHub güncelleyicisi eklendi. İlk açılışta kontrol yapılır; Ayarlar bölümünden güncelleme indirilebilir ve oyun kapalıyken kurulabilir. Portable EXE otomatik değiştirilmez. v1.0.0 EXE’si çıkarılarak incelendi; güncelleyici bulunmadığı doğrulandı. Bu yüzden ilk geçişte setup bir kez çalıştırılmalıdır. Yayın iş akışı iki EXE’yi, latest.yml’yi, blockmap dosyasını, kaynak ZIP’ini ve SHA256SUMS.txt dosyasını birlikte yayımlar.
