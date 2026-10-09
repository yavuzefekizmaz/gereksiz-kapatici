## Voldena v1.2.1

- Oyun açılışında riskli Smart Sweep, sistem genelinde RAM boşaltma, CPU önceliği değiştirme, Windows servisi durdurma ve Explorer kapatma kaldırıldı. Eski ayarlar bu işlemleri yeniden etkinleştiremez.
- Yalnızca seçili ve desteklenen masaüstü uygulamalarına normal kapatma isteği gönderilir. Zorla sonlandırma ve alt işlem ağacını kapatma yoktur.
- Oyunla birlikte açılacak program zaten çalışıyorsa tekrar başlatılmaz. Geri açma sırasında da aynı kontrol uygulanır.
- Setup sürümüne GitHub üzerinden güncelleme kontrolü, indirme ve uygulama içinden kurulum eklendi: Ayarlar → Uygulama Güncellemeleri.
- 17 otomatik test başarılı. Windows'ta kullanıcı tarafından bildirilen görüntü/giriş sorununun giderildiği henüz doğrulanmamıştır.

### İndirme

- **Setup:** `Voldena.Oyun.Hizlandiricisi.Setup.1.2.1.exe`
- **Portable:** `Voldena.Oyun.Hizlandiricisi.1.2.1.exe`
- **Kaynak kod:** `Voldena.Source.1.2.1.zip` ve bu etiketin GitHub kaynak arşivleri.
- `latest.yml` ve `.blockmap` setup sürümünün sonraki güncellemeleri için yayımlanır.

### v1.2.0'dan güncelleme

Kurulu v1.2.0 sürümünde **GitHub'dan Güncellemeleri Denetle** düğmesini kullanın. Bu yayın v1.2.0'dan daha yeni olan v1.2.1 olarak yayımlanır. Setup dosyası GitHub Releases altında sunulur; uygulama ayarları aynı uygulama kimliği ve kullanıcı veri konumunda korunur.

Yayımlanmış v1.0.0 EXE'sinde güncelleyici bulunmadığı için yalnızca o eski sürümden geçişte setup bir kez elle çalıştırılmalıdır. Portable sürüm yeni portable EXE indirilerek güncellenir.

Paketler Windows x64 içindir. Kod imzalama sertifikası sağlanmadığından imzasızdır. Mevcut uygulama ayarları aynı uygulama kimliği ve kullanıcı veri konumu altında korunur.
