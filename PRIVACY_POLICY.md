# Gizlilik Politikası — Takı Takip

Yürürlük tarihi: 24 Ağustos 2026

Takı Takip ("uygulama"), düğün ve nişan gibi organizasyonlarda davetlilerin taktığı hediyeleri (takı, para vb.) kaydetmenizi sağlayan bir mobil uygulamadır. Bu belge, uygulamayı kullanırken verilerinizin nasıl işlendiğini açıklar.

## Hangi veriler toplanıyor?

**Hesap açmadan kullanırsanız:** Kaydettiğiniz bilgiler (davetli adı, hediye türü, adet/tutar, tarih, not) yalnızca cihazınızda, uygulamanın kendi yerel veritabanında (SQLite) saklanır ve hiçbir sunucuya gönderilmez.

**Hesap açıp giriş yaparsanız** (kayıtlarınızı başka bir cihazdan da görmek için opsiyonel bir özelliktir):

- **E-posta adresiniz** ve (girdiyseniz) **isminiz**, kimlik doğrulama sağlayıcımız [Supabase](https://supabase.com) tarafından saklanır. Şifre ile giriş yapıyorsanız şifreniz düz metin olarak değil, hash'lenmiş (geri döndürülemez) şekilde tutulur.
- **Google ile giriş** seçeneğini kullanırsanız, Google'dan e-posta adresiniz ve temel profil bilgileriniz alınır.
- Kaydettiğiniz takı/hediye kayıtları, hesabınıza bağlı olarak Supabase'in veritabanında saklanır, böylece farklı cihazlardan erişebilirsiniz.

## Paylaşım özelliği

Uygulama içinden kayıtlarınızı başka bir kullanıcıyla **salt okunur** olarak paylaşabilirsiniz. Bunu yaptığınızda, paylaştığınız kişinin e-posta adresi sistemde saklanır ve o kişi (kabul ettiği takdirde) sadece sizin kayıtlarınızı görüntüleyebilir; değiştiremez veya silemez.

## Üçüncü taraf servisler

- **Supabase** — kimlik doğrulama ve veritabanı barındırma (veri işleyicimiz).
- **Google** — sadece "Google ile Giriş" özelliğini kullanırsanız devreye girer.
- **TCMB (Türkiye Cumhuriyet Merkez Bankası)** — TL kayıtlarında "Değer Karşılaştırma" özelliği kullanıldığında, güncel/geçmiş döviz kurunu almak için TCMB'nin herkese açık kur verisine istek atılır; bu istekte kişisel veri gönderilmez.

Uygulama reklam ağı veya analitik/izleme (tracking) SDK'sı kullanmamaktadır.

## Verilerinizin kontrolü

- Uygulama içinden istediğiniz kaydı düzenleyebilir veya silebilirsiniz.
- Hesap açmadıysanız, uygulamayı cihazınızdan kaldırdığınızda (uninstall) tüm yerel veriler kalıcı olarak silinir.
- Hesap açtıysanız, **Hesap** ekranından **"Hesabımı Sil"** ile hesabınızı ve buluttaki tüm kayıtlarınızı (paylaşımlar dahil) kalıcı ve geri alınamaz şekilde silebilirsiniz.

## Çocukların gizliliği

Uygulama bilerek 13 yaş altı çocuklardan veri toplamaz ve onlara yönelik değildir.

## Politika değişiklikleri

Uygulamaya yeni özellikler eklendikçe bu politika güncellenecek ve değişiklikler bu sayfada yayınlanacaktır.

## İletişim

Sorularınız için: mtnbgc@gmail.com
