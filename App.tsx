import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteLocalRecord,
  getLastSyncAt,
  getLocalRecords,
  initializeLocalDatabase,
  replaceLocalRecords,
  saveLocalRecord,
  setLastSyncAt,
  type LocalGiftRecord,
} from './lib/localDb';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type GiftRecord = {
  id: string;
  guest: string;
  type: string;
  quantity: number;
  value: number;
  note: string;
};

const categories = ['Tümü', 'Çeyrek', 'Yarım', 'Tam', 'Bilezik', 'Diğer'];

const formatMoney = (value: number) =>
  `${new Intl.NumberFormat('tr-TR').format(value)} TL`;

const createRecordId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

export default function App() {
  const [records, setRecords] = useState<GiftRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [guest, setGuest] = useState('');
  const [type, setType] = useState('Çeyrek');
  const [quantity, setQuantity] = useState('1');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(
    isSupabaseConfigured || Platform.OS !== 'web',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState('');

  useEffect(() => {
    const client = supabase;
    const useLocalDatabase = Platform.OS !== 'web';
    let cancelled = false;

    const loadRecords = async () => {
      try {
        if (useLocalDatabase) {
          await initializeLocalDatabase();
          const localRecords = await getLocalRecords();
          if (!cancelled) {
            setRecords(localRecords);
            setIsLoading(false);
          }
        }

        if (!client) {
          if (!cancelled) {
            setIsLoading(false);
          }
          return;
        }

        let shouldSync = true;
        if (useLocalDatabase) {
          const lastSyncAt = await getLastSyncAt();
          shouldSync =
            !lastSyncAt || Date.now() - Date.parse(lastSyncAt) >= 24 * 60 * 60 * 1000;
        }

        if (!shouldSync) {
          return;
        }

        const { data, error } = await client
          .from('gift_records')
          .select('id, guest, type, quantity, value, note')
          .order('created_at', { ascending: false });

        if (error) {
          if (!cancelled) {
            setDbError('Kayıtlar yenilenemedi. Yerel kayıtlar gösteriliyor.');
          }
          return;
        }

        const syncedRecords = (data ?? []).map((record) => ({
          ...record,
          quantity: Number(record.quantity),
          value: Number(record.value),
        }));

        if (useLocalDatabase) {
          await replaceLocalRecords(syncedRecords);
          await setLastSyncAt(new Date().toISOString());
        }
        if (!cancelled) {
          setRecords(syncedRecords);
        }
      } catch {
        if (!cancelled) {
          setDbError('Veriler yüklenemedi. Yerel kayıtlar gösteriliyor.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');

    return records.filter((record) => {
      const matchesCategory =
        selectedCategory === 'Tümü' || record.type === selectedCategory;
      const matchesSearch =
        !normalizedSearch ||
        record.guest.toLocaleLowerCase('tr-TR').includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [records, search, selectedCategory]);

  const totalValue = records.reduce((total, record) => total + record.value, 0);
  const totalQuantity = records.reduce(
    (total, record) => total + record.quantity,
    0,
  );

  const resetForm = () => {
    setGuest('');
    setType('Çeyrek');
    setQuantity('1');
    setValue('');
    setNote('');
  };

  const addRecord = async () => {
    const parsedQuantity = Number.parseInt(quantity, 10);
    const parsedValue = Number.parseFloat(value.replace(',', '.')) || 0;

    if (!guest.trim() || !parsedQuantity || parsedQuantity < 1) {
      return;
    }

    const newRecord: LocalGiftRecord = {
      id: createRecordId(),
      guest: guest.trim(),
      type,
      quantity: parsedQuantity,
      value: parsedValue,
      note: note.trim(),
    };

    setIsSaving(true);
    setDbError('');

    let savedRecord = newRecord;

    if (supabase) {
      const { data, error } = await supabase
        .from('gift_records')
        .insert(newRecord)
        .select('id, guest, type, quantity, value, note')
        .single();

      if (error) {
        setDbError('Kayıt eklenemedi. Supabase ayarlarını kontrol edin.');
        setIsSaving(false);
        return;
      }

      savedRecord = {
        ...data,
        quantity: Number(data.quantity),
        value: Number(data.value),
      };
    }

    if (Platform.OS !== 'web') {
      await saveLocalRecord(savedRecord);
    }

    setRecords((currentRecords) => [savedRecord, ...currentRecords]);

    setIsSaving(false);
    resetForm();
    setIsFormVisible(false);
  };

  const removeRecord = async (id: string) => {
    if (supabase) {
      const { error } = await supabase.from('gift_records').delete().eq('id', id);
      if (error) {
        setDbError('Kayıt silinemedi.');
        return;
      }
    }

    if (Platform.OS !== 'web') {
      await deleteLocalRecord(id);
    }

    setRecords((currentRecords) =>
      currentRecords.filter((record) => record.id !== id),
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <FlatList
        contentContainerStyle={styles.content}
        data={filteredRecords}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>DÜĞÜN HATIRASI</Text>
                <Text style={styles.title}>Takı Takip</Text>
                <Text style={styles.subtitle}>
                  Kim ne taktı, hepsi tek yerde.
                </Text>
                <Text style={styles.connectionStatus}>
                  {isSupabaseConfigured ? '● Canlı veritabanı' : '● Yerel önizleme'}
                </Text>
              </View>
              <View style={styles.headerMark}>
                <Text style={styles.headerMarkText}>TT</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
                <Text style={styles.summaryLabelLight}>TOPLAM DEĞER</Text>
                <Text style={styles.summaryValueLight}>
                  {formatMoney(totalValue)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>KAYIT</Text>
                <Text style={styles.summaryValue}>{records.length}</Text>
                <Text style={styles.summaryHint}>{totalQuantity} parça</Text>
              </View>
            </View>

            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Davetli ara..."
                placeholderTextColor="#9B958A"
                style={styles.searchInput}
              />
            </View>

            <FlatList
              data={categories}
              horizontal
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelectedCategory(item)}
                  style={[
                    styles.categoryChip,
                    selectedCategory === item && styles.categoryChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategory === item && styles.categoryTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Takılanlar</Text>
              <Text style={styles.sectionCount}>
                {filteredRecords.length} kayıt
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.recordCard}>
            <View style={styles.recordIcon}>
              <Text style={styles.recordIconText}>✦</Text>
            </View>
            <View style={styles.recordDetails}>
              <Text style={styles.recordGuest}>{item.guest}</Text>
              <Text style={styles.recordMeta}>
                {item.quantity} x {item.type}
                {item.note ? `  ·  ${item.note}` : ''}
              </Text>
            </View>
            <View style={styles.recordAmount}>
              <Text style={styles.recordValue}>{formatMoney(item.value)}</Text>
              <Pressable onPress={() => removeRecord(item.id)}>
                <Text style={styles.deleteText}>Sil</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✦</Text>
            <Text style={styles.emptyTitle}>
              {isLoading
                ? 'Kayıtlar yükleniyor...'
                : records.length
                  ? 'Aradığın kayıt yok'
                  : 'Henüz takı kaydı yok'}
            </Text>
            <Text style={styles.emptyText}>
              {dbError || (records.length
                ? 'Farklı bir isim veya kategori dene.'
                : 'İlk kaydı ekleyerek düğün listenizi oluşturmaya başlayın.')}
            </Text>
          </View>
        }
      />

      <Pressable style={styles.addButton} onPress={() => setIsFormVisible(true)}>
        <Text style={styles.addButtonPlus}>+</Text>
        <Text style={styles.addButtonText}>Takı Ekle</Text>
      </Pressable>

      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFormVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.formSheet}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formEyebrow}>YENİ KAYIT</Text>
                <Text style={styles.formTitle}>Takı bilgileri</Text>
              </View>
              <Pressable onPress={() => setIsFormVisible(false)}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Davetli adı</Text>
            <TextInput
              value={guest}
              onChangeText={setGuest}
              placeholder="Örn. Ayşe ve Mehmet"
              placeholderTextColor="#9B958A"
              style={styles.input}
              autoFocus
            />

            <Text style={styles.inputLabel}>Takı türü</Text>
            <View style={styles.typeGrid}>
              {categories.slice(1).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setType(item)}
                  style={[
                    styles.typeOption,
                    type === item && styles.typeOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      type === item && styles.typeOptionTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>Adet</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>Değer (TL)</Text>
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  placeholder="0"
                  placeholderTextColor="#9B958A"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Not (opsiyonel)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Örn. kutu ile birlikte"
              placeholderTextColor="#9B958A"
              style={styles.input}
            />

            <Pressable style={styles.saveButton} onPress={addRecord}>
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Kaydediliyor...' : 'Kaydı Ekle'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F4EE' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 110 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24,
  },
  eyebrow: { color: '#B56A45', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#25231F', fontSize: 34, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#777168', fontSize: 15, marginTop: 5 },
  connectionStatus: { color: '#3B8061', fontSize: 11, fontWeight: '700', marginTop: 7 },
  headerMark: {
    alignItems: 'center', backgroundColor: '#E6B85C', borderRadius: 18, height: 58,
    justifyContent: 'center', transform: [{ rotate: '8deg' }], width: 58,
  },
  headerMarkText: { color: '#4C3821', fontSize: 18, fontWeight: '800', transform: [{ rotate: '-8deg' }] },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 16, flex: 1, minHeight: 112, padding: 16 },
  summaryCardPrimary: { backgroundColor: '#263F3A', flex: 1.35 },
  summaryLabel: { color: '#918B81', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  summaryLabelLight: { color: '#B9D0C3', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  summaryValue: { color: '#263F3A', fontSize: 30, fontWeight: '800', marginTop: 12 },
  summaryValueLight: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 12 },
  summaryHint: { color: '#918B81', fontSize: 12, marginTop: 1 },
  searchBox: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#ECE7DE', borderRadius: 13,
    borderWidth: 1, flexDirection: 'row', height: 52, paddingHorizontal: 14,
  },
  searchIcon: { color: '#B56A45', fontSize: 25, marginRight: 8, marginTop: -4 },
  searchInput: { color: '#25231F', flex: 1, fontSize: 15 },
  categoryList: { gap: 8, paddingVertical: 17 },
  categoryChip: { borderColor: '#DED8CC', borderRadius: 20, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 },
  categoryChipActive: { backgroundColor: '#B56A45', borderColor: '#B56A45' },
  categoryText: { color: '#777168', fontSize: 13, fontWeight: '600' },
  categoryTextActive: { color: '#FFFFFF' },
  sectionHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#25231F', fontSize: 21, fontWeight: '800' },
  sectionCount: { color: '#918B81', fontSize: 12 },
  recordCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, flexDirection: 'row', marginBottom: 10, minHeight: 78, padding: 12 },
  recordIcon: { alignItems: 'center', backgroundColor: '#F8E6D9', borderRadius: 12, height: 48, justifyContent: 'center', marginRight: 12, width: 48 },
  recordIconText: { color: '#B56A45', fontSize: 22 },
  recordDetails: { flex: 1 },
  recordGuest: { color: '#25231F', fontSize: 16, fontWeight: '700' },
  recordMeta: { color: '#918B81', fontSize: 12, marginTop: 5 },
  recordAmount: { alignItems: 'flex-end' },
  recordValue: { color: '#263F3A', fontSize: 14, fontWeight: '800' },
  deleteText: { color: '#B56A45', fontSize: 12, marginTop: 5 },
  emptyState: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 38 },
  emptyIcon: { color: '#D3B27A', fontSize: 35 },
  emptyTitle: { color: '#4C4841', fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptyText: { color: '#918B81', fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  addButton: {
    alignItems: 'center', backgroundColor: '#B56A45', borderRadius: 16, bottom: 22, elevation: 4,
    flexDirection: 'row', justifyContent: 'center', left: 20, minHeight: 56, position: 'absolute', right: 20,
    shadowColor: '#7A4227', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  addButtonPlus: { color: '#FFFFFF', fontSize: 25, fontWeight: '300', marginRight: 8 },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalBackdrop: { backgroundColor: 'rgba(28, 28, 25, 0.42)', flex: 1, justifyContent: 'flex-end' },
  formSheet: { backgroundColor: '#F7F4EE', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 22 },
  formHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  formEyebrow: { color: '#B56A45', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  formTitle: { color: '#25231F', fontSize: 25, fontWeight: '800', marginTop: 3 },
  closeText: { color: '#777168', fontSize: 30, fontWeight: '300', lineHeight: 28 },
  inputLabel: { color: '#4C4841', fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 9 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 11, borderWidth: 1, color: '#25231F', fontSize: 15, height: 48, paddingHorizontal: 13 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeOption: { backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 10, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  typeOptionActive: { backgroundColor: '#263F3A', borderColor: '#263F3A' },
  typeOptionText: { color: '#777168', fontSize: 13, fontWeight: '600' },
  typeOptionTextActive: { color: '#FFFFFF' },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  saveButton: { alignItems: 'center', backgroundColor: '#B56A45', borderRadius: 12, height: 52, justifyContent: 'center', marginTop: 21 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
