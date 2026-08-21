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

5. Expo sunucusunu yeniden baslatin:

```bash
npm start
```

Uygulama mobilde kayitlari once cihazdaki `takitakip.db` SQLite dosyasindan acar. Son uzak senkronizasyondan 24 saat gecmisse Supabase'deki listeyi cekip cihaz DB'sini yeniler. Yeni kayitlar ve silme islemleri Supabase ayarlari varsa hem uzak hem yerel DB'ye yazilir. Ayarlar yoksa cihaz DB'si tek basina kullanilir.

SQLite dosyasi uygulamanin telefon sandbox'inda tutulur; kullanici dosya sisteminde normal bir klasor olarak gorunmez. Expo gelistirme menusu icinden SQLite inspector ile incelenebilir.

## Calistirma

```bash
npm start
npm run web
```

> `EXPO_PUBLIC_SUPABASE_ANON_KEY` istemci uygulamasinda kullanilan public anahtardir. Supabase service role key gibi gizli anahtarlari mobil uygulamaya koymayin.
