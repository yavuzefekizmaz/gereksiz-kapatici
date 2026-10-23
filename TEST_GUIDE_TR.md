# Voldena 1.5 — kısa kullanıcı denemesi

Önce açık oyunu kapatıp yeni Setup sürümünü kurun. Mevcut profiller korunur. Eski görünümün kaynağı 1.4.1 etiketinde ve yerel yedekte saklanır.

## Temel deneme

1. Ayarlar'dan tanıtımı başlatın. Sonraki düğmesi ilgili sekmeyi açmalı ve alanı işaretlemeli. Açılış/oyun algılama/geri açma tercihlerinin seçilebilir olduğunu kontrol edin.
2. Disk Temizliği'nde Diski Tara'ya basın. Başka sekmeye gidip dönün: sonuçlar kalmalı, tekrar tarama başlamamalı. Geçici dosya önizlemesinde silme yapmadan incelenen ve atlanan dosya açıklamalarına bakın.
3. Otomatik algılanan bir oyuna tıklayın. Kapatılacak ve açılacak uygulamaları ayrı ekleyip kaydedin. Profil özel profillerde görünmeli. Korumalı listede olanlar kapanmamalı.
4. Voldena açıkken oyunu başlatın. Ana ekranda kısa tamamlanma özeti, Ayarlar → İşlem Günlükleri'nde gerçek sonuçlar olmalı. Bir uygulamada Bunu bir daha kapatma'yı seçin; korumalı listeye eklenmeli.
5. Normal otomatik çıkış açıksa, işlemler tamamlandıktan sonra yaklaşık 3 dakika beklenmeli. Hızlandır ve Kapat masaüstü kısayolu ise işi bitirince doğrudan çıkar; bu davranış bilinçlidir.

## Yalnızca seçilenleri oyun bitince geri açma

1. Tüm uygulamaları otomatik geri açma kapalı kalabilir.
2. CS2 profilini düzenleyin. Oyun sırasında durdurulacak Wallpaper Engine ana EXE’sini Kapatılacak Uygulamalar'a ekleyin.
3. Oyun / uygulama bitince açılacak uygulamalar alanına dosya seçiciden aynı Wallpaper Engine EXE’sini ekleyin. Diğer kapatılan uygulamaları buraya eklemeyin.
4. Oyunu başlatın. Wallpaper Engine resmî stop komutuyla durdurulmalı; işlem günlüğünde bu durum kapatmadan ayrı yazmalı.
5. Voldena'nın otomatik çıkmasına izin verin. Oyunu kapatınca Wallpaper Engine devam etmeli; listede olmayan diğer uygulamalar açılmamalı. Zaten açık bir uygulama ikinci kez açılmamalı.

Bu mekanizma ayrı, penceresiz bir PowerShell izleyicisi kullanır; tam arayüz arka planda kalmaz. Bilgisayar kapanırsa izleme sona erer. İzleyici başlatılamazsa rapor hata gösterir ve normal izleme uygulaması yedek olarak açık kalır.

## İsteğe bağlı Explorer denemesi

Bu özellik varsayılan kapalıdır; denemek için açık dosya kopyalamalarını bitirin. Günlük oyun kullanımında Explorer korumasını açık bırakabilirsiniz.

1. Koruma tikini kaldırınca uyarı gelmeli. Hayır seçerseniz tik açık kalmalı.
2. Evet seçildiyse yeni tetiklenen oyun/uygulama profilinde masaüstü ve görev çubuğu geçici kaybolabilir. Ctrl+Alt+R veya tepsi/ana sayfa kurtarma düğmesiyle geri açılmalı.
3. Tetikleyici uygulama kapanınca da Explorer geri başlamalı. Bu deneme gerçek bilgisayarda kullanıcıyla birlikte yapılmalıdır; birim ve yalıtılmış arayüz testleri gerçek masaüstü kapatma testi yerine geçmez.

Siyah ekran, geri gelmeyen görev çubuğu, profil dışı uygulama kapanması veya yinelenen başlatma görürseniz saatini, oyun adını ve İşlem Günlükleri sonucunu iletin. Donanım/sürücüye bağlı tüm sorunların olmayacağına dair garanti verilmez.
