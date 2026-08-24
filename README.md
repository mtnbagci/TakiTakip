# TakiTakip

Dugunde davetlilerin taktigi takilari kaydetmek icin Expo + React Native uygulamasi.

## Supabase kurulumu

1. [Supabase](https://supabase.com) panelinden yeni bir proje olusturun.
2. SQL Editor ekraninda `supabase/schema.sql` dosyasinin tamamini calistirin.
3. Project Settings > API ekranindan Project URL ve anon public key degerlerini alin.
4. Proje kokunde `.env` dosyasi olusturun:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

5. Authentication > URL Configuration ekranindan **Redirect URLs** alanina `takitakip://**` ekleyin (magic link'in uygulamaya geri donebilmesi icin).

6. Expo sunucusunu yeniden baslatin:

```bash
npm start
```

Uygulama mobilde kayitlari once cihazdaki `takitakip.db` SQLite dosyasindan acar. Kullanici e-posta ile giris yaptiginda Supabase'deki kendi kayitlarini cekip cihaz DB'sini yeniler; her uygulama acilisinda bu senkron tekrarlanir. Yeni kayitlar, duzenlemeler ve silme islemleri, giris yapilmissa hem uzak hem yerel DB'ye yazilir. Giris yapilmamissa cihaz DB'si tek basina kullanilir ("yerel onizleme").

## Giris (e-posta ile magic link / sifre / Google)

Giris yapmak icin TT logosuna dokunup **Hesap**'i acin. Uc yontem var:

- **Magic Link**: e-posta girip **Giris Linki Gonder**'e basin, gelen e-postadaki linke tiklayin.
- **Sifre**: e-posta + sifre ile **Hesap Olustur** veya **Giris Yap**.
- **Google**: **Google ile Giris Yap** butonu (asagida kurulum adimlari var, once Supabase'de aktif edilmesi gerekiyor).

Ilk kayit olurken (Magic Link veya Sifre ile) opsiyonel bir **isim** alani da var; bu isim, paylasim ozelliginde davetinizi alan kisiye e-posta yerine gorunur.

Cikis yapmak icin **Hesap** ekranindan **Cikis Yap**'a basabilirsiniz; cikis yapildiginda cihazdaki yerel kayitlar da temizlenir (paylasilan cihazlarda bir sonraki kullanicinin onceki verileri gormemesi icin).

> Kategoriler su an kullaniciya degil cihaza ozeldir; birden fazla hesap ayni cihazda kullanilirsa kategori listesi ortak kalir.

### Google ile giris kurulumu

Bu, kod tarafinda hazir ama **Google Cloud** ve **Supabase panelinde** ek kurulum gerektiriyor:

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 'da bir proje acin (veya var olani kullanin).
2. **Create Credentials > OAuth client ID** > Application type: **Web application**.
3. **Authorized redirect URIs** alanina Supabase'in kendi callback adresini ekleyin:
   ```
   https://rawfjllgzoimqmitnwci.supabase.co/auth/v1/callback
   ```
4. Olusturulan **Client ID** ve **Client Secret**'i kopyalayin.
5. Supabase Dashboard > **Authentication > Sign In / Providers > Google** > etkinlestirin, Client ID ve Client Secret'i yapistirin, kaydedin.

Bu adimlar tamamlanmadan "Google ile Giris Yap" butonu hata verir.

## Paylasim (readonly)

TT menusundeki **Paylas** ile kendi kayitlariniz baska bir hesaba (e-posta ile) davet olarak gonderilebilir; karsi taraf **Benimle Paylasilanlar** ekranindan davetini kabul/red edebilir. Kabul edilen bir paylasima dokununca ekran o kisinin kayitlariyla (salt okunur) dolar, kendi kayitlarinizla karismaz; **Geri Don** ile kendi kayitlariniza donersiniz. Paylasan taraf istedigi zaman **Iptal Et** ile erisimi geri alabilir.

Bu ozellik `supabase/schema.sql` icindeki `shares` tablosu ve ona bagli fonksiyonlari kullanir — mevcut Supabase projenizde bu dosyanin guncel halini SQL Editor'de tekrar calistirmaniz gerekir.

SQLite dosyasi uygulamanin telefon sandbox'inda tutulur; kullanici dosya sisteminde normal bir klasor olarak gorunmez. Expo gelistirme menusu icinden SQLite inspector ile incelenebilir.

## Deger karsilastirma (TL kayitlari)

TL turundeki kayitlarda, kayit tarihini (formdaki **Tarih** alani) girip uzun basinca acilan menuden **Degerini Karsilastir**'a basinca, o tarihteki ve bugunku USD/TRY kurunu TCMB'nin resmi (key gerektirmeyen) `tcmb.gov.tr/kurlar` XML bultenlerinden cekip karsilastiriyor. Hafta sonu/tatil gunlerinde bulten olmadigi icin bir onceki is gunune geri dusuluyor. Bu ozellik **sadece native'de (telefon/APK) calisir**, web'de tarayici CORS kisitlamasi yuzunden calismaz.

## Calistirma

```bash
npm start
npm run web
```

> `EXPO_PUBLIC_SUPABASE_ANON_KEY` istemci uygulamasinda kullanilan public anahtardir. Supabase service role key gibi gizli anahtarlari mobil uygulamaya koymayin.
