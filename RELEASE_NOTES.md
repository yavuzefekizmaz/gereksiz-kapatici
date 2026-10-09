## Voldena v1.0.1

- Oyun açılışında riskli Smart Sweep, sistem genelinde RAM boşaltma, CPU önceliği değiştirme, Windows servisi durdurma ve Explorer kapatma kaldırıldı. Eski ayarlar bu işlemleri yeniden etkinleştiremez.
- Yalnızca seçili ve desteklenen masaüstü uygulamalarına normal kapatma isteği gönderilir. Zorla sonlandırma ve alt işlem ağacını kapatma yoktur.
- Oyunla birlikte açılacak program zaten çalışıyorsa tekrar başlatılmaz. Geri açma sırasında da aynı kontrol uygulanır.
- Setup sürümüne GitHub üzerinden güncelleme kontrolü, indirme ve uygulama içinden kurulum eklendi: Ayarlar → Uygulama Güncellemeleri.
- 17 otomatik test başarılı. Windows'ta kullanıcı tarafından bildirilen görüntü/giriş sorununun giderildiği henüz doğrulanmamıştır.

### İndirme

- **Setup:** `Voldena.Oyun.Hizlandiricisi.Setup.1.0.1.exe`
- **Portable:** `Voldena.Oyun.Hizlandiricisi.1.0.1.exe`
- **Kaynak kod:** `Voldena.Source.1.0.1.zip` ve bu etiketin GitHub kaynak arşivleri.
- `latest.yml` ve `.blockmap` setup sürümünün sonraki güncellemeleri için yayımlanır.

### v1.0.0'dan geçiş

Depodaki ve yayımlanmış v1.0.0 EXE'deki kaynaklarda otomatik güncelleyici bulunmuyor. İlk geçişte eski uygulamayı sistem tepsisinden tamamen kapatıp yeni setup'ı bir kez çalıştırmak gerekir. Yeni setup sonraki sürümleri uygulama içinden alabilir. Portable sürüm güncellenirken yeni portable EXE indirilir; kendisini otomatik değiştirmez.

Paketler Windows x64 içindir. Kod imzalama sertifikası sağlanmadığından imzasızdır. Mevcut uygulama ayarları aynı uygulama kimliği ve kullanıcı veri konumu altında korunur.
