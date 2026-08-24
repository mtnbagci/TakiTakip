const pad2 = (value: number) => String(value).padStart(2, '0');

const buildUrl = (date: Date) => {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  return `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;
};

const extractUsdForexBuying = (xml: string): number | null => {
  const usdBlockMatch = xml.match(/<Currency[^>]*Kod="USD"[^>]*>([\s\S]*?)<\/Currency>/);
  if (!usdBlockMatch) {
    return null;
  }
  const rateMatch = usdBlockMatch[1].match(/<ForexBuying>([\d.,]+)<\/ForexBuying>/);
  if (!rateMatch) {
    return null;
  }
  const value = Number.parseFloat(rateMatch[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * TCMB, hafta sonu/resmi tatil gunlerinde bulten yayinlamiyor.
 * Verilen tarihten geriye dogru en fazla 7 gun denenir.
 */
export const getUsdRateNear = async (date: Date): Promise<number | null> => {
  const cursor = new Date(date);

  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(buildUrl(cursor));
      if (response.ok) {
        const xml = await response.text();
        const rate = extractUsdForexBuying(xml);
        if (rate) {
          return rate;
        }
      }
    } catch {
      // ag hatasi olursa bir onceki gune dus
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return null;
};

export const getUsdRateForToday = () => getUsdRateNear(new Date());
