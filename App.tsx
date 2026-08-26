import { StatusBar } from 'expo-status-bar';
import { Checkbox } from 'expo-checkbox';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useLinkingURL } from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  createSessionFromUrl,
  deleteAccount,
  isAuthRedirectUrl,
  sendMagicLink,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './lib/auth';
import {
  clearLocalRecords,
  deleteLocalRecord,
  getLocalCategories,
  getLocalEvents,
  getLocalRecords,
  initializeLocalDatabase,
  replaceLocalEvents,
  replaceLocalRecords,
  saveLocalRecord,
  saveLocalCategory,
  saveLocalEvent,
  setLastSyncAt,
  type GiftDirection,
  type LocalEvent,
  type LocalGiftRecord,
} from './lib/localDb';
import {
  createShare,
  getIncomingShares,
  getOutgoingShares,
  respondToShare,
  revokeShare,
  type IncomingShare,
  type OutgoingShare,
  type ShareStatus,
} from './lib/sharing';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { getUsdRateNear, getUsdRateForToday } from './lib/tcmbRates';

type GiftRecord = {
  id: string;
  guest: string;
  type: string;
  quantity: number;
  value: number;
  note: string;
  hasQuantity: boolean;
  direction: GiftDirection;
  giftDate: string;
  eventId: string;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date();
  }
  return new Date(year, month - 1, day);
};

const normalizeIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return todayIsoDate();
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatIsoDateTr = (value: string) => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}.${month}.${year}`;
};

const directionFilters: Array<'Tümü' | GiftDirection> = ['Tümü', 'Gelen', 'Giden'];

const defaultCategories = [
  'Tümü',
  'Çeyrek',
  'Yarım',
  'Tam',
  'Bilezik',
  'Gram',
  'Yarım Gram',
  'TL',
  'Euro',
  'USD',
  'Diğer',
];
const currencyTypes = ['TL', 'Euro', 'USD'];

const formatRecordType = (record: GiftRecord) =>
  currencyTypes.includes(record.type)
    ? `${record.quantity} ${record.type}`
    : record.hasQuantity
      ? `${record.quantity} x ${record.type}`
      : record.type;

const shareStatusLabel = (status: ShareStatus) =>
  status === 'pending' ? 'Bekliyor' : status === 'accepted' ? 'Kabul edildi' : 'Reddedildi';

const getTypeAbbreviation = (type: string) => {
  const abbreviations: Record<string, string> = {
    'Çeyrek': 'Ç',
    'Yarım': 'Y',
    'Tam': 'T',
    'Bilezik': 'B',
    'Gram': 'G',
    'Yarım Gram': 'YG',
    'TL': 'TL',
    'Euro': 'EUR',
    'USD': 'USD',
    'Diğer': 'D',
  };

  return abbreviations[type] ?? type.slice(0, 3).toUpperCase();
};

const createRecordId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

const toSupabaseRow = (record: LocalGiftRecord) => ({
  id: record.id,
  guest: record.guest,
  type: record.type,
  quantity: record.quantity,
  value: record.value,
  note: record.note,
  has_quantity: record.hasQuantity,
  direction: record.direction,
  gift_date: record.giftDate,
  event_id: record.eventId || null,
});

  
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<GiftRecord[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [isEventPickerVisible, setIsEventPickerVisible] = useState(false);
  const [isAddEventModalVisible, setIsAddEventModalVisible] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [addEventContext, setAddEventContext] = useState<'main' | 'form'>('main');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [selectedDirection, setSelectedDirection] = useState<'Tümü' | GiftDirection>('Tümü');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isCategoryFormVisible, setIsCategoryFormVisible] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [guest, setGuest] = useState('');
  const [type, setType] = useState('Çeyrek');
  const [quantity, setQuantity] = useState('1');
  const [hasQuantity, setHasQuantity] = useState(false);
  const [direction, setDirection] = useState<GiftDirection>('Gelen');
  const [giftDate, setGiftDate] = useState(todayIsoDate());
  const [formEventId, setFormEventId] = useState('');
  const [isFormEventPickerVisible, setIsFormEventPickerVisible] = useState(false);
  const [isComparingValue, setIsComparingValue] = useState(false);
  const [valueComparison, setValueComparison] = useState<{
    guest: string;
    amount: number;
    dateLabel: string;
    usdThen: number;
    rateThen: number;
    rateNow: number;
    tlNowEquivalent: number;
  } | null>(null);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(
    isSupabaseConfigured || Platform.OS !== 'web',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'magic' | 'password'>('magic');
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [magicLinkMessage, setMagicLinkMessage] = useState('');
  const [isLoginPromptVisible, setIsLoginPromptVisible] = useState(false);
  const [pendingBackupRecords, setPendingBackupRecords] = useState<GiftRecord[] | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [isSendingShare, setIsSendingShare] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [outgoingShares, setOutgoingShares] = useState<OutgoingShare[]>([]);
  const [isIncomingSharesModalVisible, setIsIncomingSharesModalVisible] = useState(false);
  const [incomingShares, setIncomingShares] = useState<IncomingShare[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [sharedRecords, setSharedRecords] = useState<GiftRecord[]>([]);
  const [viewingShare, setViewingShare] = useState<{ ownerId: string; ownerLabel: string } | null>(
    null,
  );
  const [isSharedLoading, setIsSharedLoading] = useState(false);
  const incomingUrl = useLinkingURL();

  const isCloudActive = Boolean(supabase && session);

  const categories = useMemo(
    () => [...defaultCategories, ...customCategories],
    [customCategories],
  );

  useEffect(() => {
    const useLocalDatabase = Platform.OS !== 'web';
    let cancelled = false;

    const loadLocal = async () => {
      if (!useLocalDatabase) {
        return;
      }
      try {
        await initializeLocalDatabase();
        const localRecords = await getLocalRecords();
        const localCategories = await getLocalCategories();
        const localEvents = await getLocalEvents();
        if (!cancelled) {
          setRecords(
            localRecords.map((record) => ({
              ...record,
              hasQuantity: Boolean(record.hasQuantity),
            })),
          );
          setCustomCategories(
            localCategories.filter((category) => !defaultCategories.includes(category)),
          );
          setEvents(localEvents);
          setSelectedEventId((current) => current || localEvents[0]?.id || '');
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

    void loadLocal();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) {
        return;
      }
      setSession(data.session);
      if (!data.session) {
        setIsLoginPromptVisible(true);
      }
      if (Platform.OS === 'web') {
        setIsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession) {
        setIsLoginPromptVisible(false);
      }
      if (event === 'SIGNED_OUT') {
        setRecords([]);
        setDbError('');
        setViewingShare(null);
        setSharedRecords([]);
        setEvents([]);
        setSelectedEventId('');
        if (Platform.OS !== 'web') {
          void clearLocalRecords().then(async () => {
            await initializeLocalDatabase();
            const restoredEvents = await getLocalEvents();
            setEvents(restoredEvents);
            setSelectedEventId(restoredEvents[0]?.id ?? '');
          });
        }
      }
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!incomingUrl || !isAuthRedirectUrl(incomingUrl)) {
      return;
    }
    createSessionFromUrl(incomingUrl).catch(() => {
      setMagicLinkMessage('Giriş linki geçersiz veya süresi doldu.');
    });
  }, [incomingUrl]);

  useEffect(() => {
    if (!isCloudActive || !supabase || !session) {
      return;
    }

    const client = supabase;
    const userId = session.user.id;
    const useLocalDatabase = Platform.OS !== 'web';
    let cancelled = false;

    const syncFromCloud = async () => {
      try {
        const { data: eventData, error: eventError } = await client
          .from('events')
          .select('id, name')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (!eventError) {
          const syncedEvents = eventData ?? [];
          if (syncedEvents.length || !events.length) {
            if (useLocalDatabase) {
              await replaceLocalEvents(syncedEvents);
            }
            if (!cancelled) {
              setEvents(syncedEvents);
              setSelectedEventId((current) =>
                syncedEvents.some((event) => event.id === current)
                  ? current
                  : syncedEvents[0]?.id ?? current,
              );
            }
          }
        }

        const { data, error } = await client
          .from('gift_records')
          .select('id, guest, type, quantity, value, note, has_quantity, direction, gift_date, event_id')
          .eq('user_id', userId)
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
          hasQuantity: Boolean(record.has_quantity),
          direction: (record.direction as GiftDirection) ?? 'Gelen',
          giftDate: record.gift_date ?? todayIsoDate(),
          eventId: record.event_id ?? '',
        }));

        if (!syncedRecords.length && records.length) {
          if (!cancelled) {
            setDbError(
              'Bulutta henüz kayıt yok. Telefondaki kayıtların silinmemesi için korundu — buluta göndermek için TT menüsündeki "Yedekle"yi kullan.',
            );
          }
          return;
        }

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

    void syncFromCloud();
    return () => {
      cancelled = true;
    };
  }, [isCloudActive]);

  const performBackup = async (snapshot: GiftRecord[]) => {
    if (!supabase || !session) {
      return;
    }
    const client = supabase;

    const upload = async () => {
      setIsBackingUp(true);
      try {
        if (events.length) {
          await client
            .from('events')
            .upsert(events.map((event) => ({ id: event.id, name: event.name })));
        }

        const { error } = await client
          .from('gift_records')
          .upsert(snapshot.map((record) => toSupabaseRow(record)));

        if (error) {
          Alert.alert('Yedekle', 'Yedekleme başarısız oldu.');
          return;
        }

        if (Platform.OS !== 'web') {
          for (const record of snapshot) {
            await saveLocalRecord(record);
          }
        }
        setRecords(snapshot);
        Alert.alert('Yedekle', `${snapshot.length} kayıt buluta yedeklendi.`);
      } finally {
        setIsBackingUp(false);
      }
    };

    setIsBackingUp(true);
    const { count, error: countError } = await client
      .from('gift_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id);
    setIsBackingUp(false);

    if (countError) {
      Alert.alert('Yedekle', 'Bulut verisi kontrol edilemedi.');
      return;
    }

    if ((count ?? 0) > 0) {
      Alert.alert(
        'Yedekle',
        'Bulutta zaten kayıt var. Telefondaki kayıtları yine de eklemek ister misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Ekle', onPress: () => void upload() },
        ],
      );
      return;
    }

    await upload();
  };

  useEffect(() => {
    if (session && pendingBackupRecords) {
      const snapshot = pendingBackupRecords;
      setPendingBackupRecords(null);
      setIsAccountModalVisible(false);
      void performBackup(snapshot);
    }
  }, [session, pendingBackupRecords]);

  const handleBackupToCloud = () => {
    setIsMenuVisible(false);

    if (!isSupabaseConfigured) {
      Alert.alert('Yedekle', 'Bulut veritabanı henüz yapılandırılmadı.');
      return;
    }

    if (!records.length) {
      Alert.alert('Yedekle', 'Telefonda yedeklenecek kayıt bulunamadı.');
      return;
    }

    if (session) {
      void performBackup(records);
      return;
    }

    setPendingBackupRecords(records);
    setMagicLinkMessage('');
    setIsAccountModalVisible(true);
  };

  const handleSendMagicLink = async () => {
    const email = loginEmail.trim();
    const name = loginName.trim();
    if (!name) {
      setMagicLinkMessage('İsim girin.');
      return;
    }
    if (!email || !email.includes('@')) {
      setMagicLinkMessage('Geçerli bir e-posta adresi girin.');
      return;
    }

    setIsSendingMagicLink(true);
    setMagicLinkMessage('');

    try {
      await sendMagicLink(email, name);
      setMagicLinkMessage('Giriş linki e-postana gönderildi. Gelen kutunu kontrol et.');
    } catch {
      setMagicLinkMessage('Link gönderilemedi. E-postayı kontrol edip tekrar deneyin.');
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsAccountModalVisible(false);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabı Sil',
      'Bu işlem geri alınamaz. Hesabınız, buluttaki tüm kayıtlarınız ve paylaşımlarınız kalıcı olarak silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabımı Sil',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              await deleteAccount();
              setIsAccountModalVisible(false);
            } catch {
              Alert.alert('Hata', 'Hesap silinemedi, lütfen tekrar deneyin.');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSigningIn(true);
    setMagicLinkMessage('');

    try {
      await signInWithGoogle();
    } catch {
      setMagicLinkMessage('Google ile giriş yapılamadı.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handlePasswordSignIn = async () => {
    const email = loginEmail.trim();
    if (!email || !email.includes('@') || loginPassword.length < 6) {
      setMagicLinkMessage('Geçerli bir e-posta ve en az 6 karakterlik şifre girin.');
      return;
    }

    setIsSendingMagicLink(true);
    setMagicLinkMessage('');

    try {
      await signInWithPassword(email, loginPassword);
      setLoginPassword('');
    } catch {
      setMagicLinkMessage('Giriş yapılamadı. E-posta veya şifre hatalı olabilir.');
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  const handlePasswordSignUp = async () => {
    const email = loginEmail.trim();
    const name = loginName.trim();
    if (!name) {
      setMagicLinkMessage('İsim girin.');
      return;
    }
    if (!email || !email.includes('@') || loginPassword.length < 6) {
      setMagicLinkMessage('Geçerli bir e-posta ve en az 6 karakterlik şifre girin.');
      return;
    }

    setIsSendingMagicLink(true);
    setMagicLinkMessage('');

    try {
      await signUpWithPassword(email, loginPassword, name);
      setMagicLinkMessage('Hesap oluşturuldu. E-postana gelen onay linkine tıkla.');
    } catch {
      setMagicLinkMessage('Hesap oluşturulamadı. Bu e-posta zaten kayıtlı olabilir.');
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  const requireSession = (title: string) => {
    if (!session) {
      Alert.alert(title, 'Bu özelliği kullanmak için önce giriş yapmalısınız.');
      return false;
    }
    return true;
  };

  const loadOutgoingShares = async () => {
    if (!session) {
      return;
    }
    try {
      setOutgoingShares(await getOutgoingShares(session.user.id));
    } catch {
      setShareMessage('Paylaşım listesi yüklenemedi.');
    }
  };

  const openShareModal = () => {
    setIsMenuVisible(false);
    if (!requireSession('Paylaş')) {
      return;
    }
    setShareEmail('');
    setShareMessage('');
    setIsShareModalVisible(true);
    void loadOutgoingShares();
  };

  const handleSendShare = async () => {
    const email = shareEmail.trim();
    if (!email || !email.includes('@')) {
      setShareMessage('Geçerli bir e-posta adresi girin.');
      return;
    }

    setIsSendingShare(true);
    setShareMessage('');

    try {
      await createShare(email);
      setShareEmail('');
      setShareMessage('Davet gönderildi.');
      await loadOutgoingShares();
    } catch (error) {
      setShareMessage(
        error instanceof Error ? error.message : 'Davet gönderilemedi.',
      );
    } finally {
      setIsSendingShare(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      await revokeShare(shareId);
      await loadOutgoingShares();
    } catch {
      setShareMessage('Paylaşım iptal edilemedi.');
    }
  };

  const loadIncomingShares = async () => {
    setIsLoadingShares(true);
    try {
      setIncomingShares(await getIncomingShares());
    } catch {
      // sessizce yut, liste boş kalır
    } finally {
      setIsLoadingShares(false);
    }
  };

  const openIncomingSharesModal = () => {
    setIsMenuVisible(false);
    if (!requireSession('Benimle Paylaşılanlar')) {
      return;
    }
    setIsIncomingSharesModalVisible(true);
    void loadIncomingShares();
  };

  const handleRespondToShare = async (shareId: string, accept: boolean) => {
    try {
      await respondToShare(shareId, accept);
      await loadIncomingShares();
    } catch {
      Alert.alert('Hata', 'İşlem gerçekleştirilemedi.');
    }
  };

  const handleViewSharedRecords = async (ownerId: string, ownerLabel: string) => {
    if (!supabase) {
      return;
    }

    setIsSharedLoading(true);
    try {
      const { data, error } = await supabase
        .from('gift_records')
        .select('id, guest, type, quantity, value, note, has_quantity, direction, gift_date, event_id')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false });

      if (error) {
        Alert.alert('Hata', 'Paylaşılan kayıtlar yüklenemedi.');
        return;
      }

      const mapped = (data ?? []).map((record) => ({
        ...record,
        quantity: Number(record.quantity),
        value: Number(record.value),
        hasQuantity: Boolean(record.has_quantity),
        direction: (record.direction as GiftDirection) ?? 'Gelen',
        giftDate: record.gift_date ?? todayIsoDate(),
        eventId: record.event_id ?? '',
      }));

      setSharedRecords(mapped);
      setViewingShare({ ownerId, ownerLabel });
      setIsIncomingSharesModalVisible(false);
      setSelectedCategory('Tümü');
      setSelectedDirection('Tümü');
      setSearch('');
    } finally {
      setIsSharedLoading(false);
    }
  };

  const exitSharedView = () => {
    setViewingShare(null);
    setSharedRecords([]);
  };

  const displayedRecords = viewingShare ? sharedRecords : records;

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');

    return displayedRecords.filter((record) => {
      const matchesEvent = viewingShare || !selectedEventId || record.eventId === selectedEventId;
      const matchesCategory =
        selectedCategory === 'Tümü' || record.type === selectedCategory;
      const matchesDirection =
        selectedDirection === 'Tümü' || record.direction === selectedDirection;
      const matchesSearch =
        !normalizedSearch ||
        record.guest.toLocaleLowerCase('tr-TR').includes(normalizedSearch);

      return matchesEvent && matchesCategory && matchesDirection && matchesSearch;
    });
  }, [displayedRecords, search, selectedCategory, selectedDirection, selectedEventId, viewingShare]);

  const resetForm = () => {
    setGuest('');
    setType('Çeyrek');
    setQuantity('1');
    setHasQuantity(false);
    setDirection('Gelen');
    setNote('');
    setGiftDate(todayIsoDate());
    setFormEventId(selectedEventId);
  };

  const addCategory = async () => {
    const category = newCategory.trim();
    if (!category || categories.includes(category)) {
      return;
    }

    if (Platform.OS !== 'web') {
      await saveLocalCategory(category);
    }
    setCustomCategories((currentCategories) => [...currentCategories, category]);
    setType(category);
    setNewCategory('');
    setIsCategoryFormVisible(false);
  };

  const openAddEventModal = (context: 'main' | 'form') => {
    setIsEventPickerVisible(false);
    setIsFormEventPickerVisible(false);
    setAddEventContext(context);
    setNewEventName('');
    setTimeout(() => setIsAddEventModalVisible(true), 250);
  };

  const addEvent = async () => {
    const name = newEventName.trim();
    if (!name) {
      return;
    }

    setIsSavingEvent(true);
    try {
      const newEvent: LocalEvent = { id: createRecordId(), name };

      if (Platform.OS !== 'web') {
        await saveLocalEvent(newEvent);
      }
      if (supabase && session) {
        await supabase.from('events').insert({ id: newEvent.id, name: newEvent.name });
      }

      setEvents((current) => [...current, newEvent]);
      if (addEventContext === 'form') {
        setFormEventId(newEvent.id);
      } else {
        setSelectedEventId(newEvent.id);
      }
      setNewEventName('');
      setIsAddEventModalVisible(false);
    } catch {
      Alert.alert('Hata', 'Etkinlik eklenemedi.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const addRecord = async () => {
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!guest.trim() || !parsedQuantity || parsedQuantity < 1) {
      return;
    }

    const newRecord: LocalGiftRecord = {
      id: createRecordId(),
      guest: guest.trim(),
      type,
      quantity: parsedQuantity,
      value: 0,
      note: note.trim(),
      hasQuantity,
      direction,
      giftDate: normalizeIsoDate(giftDate),
      eventId: formEventId || selectedEventId,
    };

    setIsSaving(true);
    setDbError('');

    let savedRecord = newRecord;

    if (supabase && session) {
      const { data, error } = await supabase
        .from('gift_records')
        .insert(toSupabaseRow(newRecord))
        .select('id, guest, type, quantity, value, note, has_quantity, direction, gift_date, event_id')
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
        hasQuantity: Boolean(data.has_quantity),
        direction: data.direction as GiftDirection,
        giftDate: data.gift_date,
        eventId: data.event_id ?? '',
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
    if (supabase && session) {
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

  const openEditFormFor = (record: GiftRecord) => {
    setGuest(record.guest);
    setType(record.type);
    setQuantity(String(record.quantity));
    setHasQuantity(record.hasQuantity);
    setDirection(record.direction);
    setNote(record.note);
    setGiftDate(record.giftDate || todayIsoDate());
    setFormEventId(record.eventId || selectedEventId);
    setEditingId(record.id);
    setIsFormVisible(true);
  };

  const confirmDeleteRecord = (record: GiftRecord) => {
    Alert.alert(
      'Kaydı Sil',
      `${record.guest} kaydını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => void removeRecord(record.id) },
      ],
    );
  };

  const compareValueForRecord = async (record: GiftRecord) => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Değer Karşılaştırma',
        'Bu özellik web üzerinde çalışmıyor, telefon uygulamasından deneyin.',
      );
      return;
    }

    setIsComparingValue(true);
    try {
      const giftDateObj = parseIsoDate(record.giftDate || todayIsoDate());
      const [rateThen, rateNow] = await Promise.all([
        getUsdRateNear(giftDateObj),
        getUsdRateForToday(),
      ]);

      if (!rateThen || !rateNow) {
        Alert.alert('Değer Karşılaştırma', 'Kur bilgisi alınamadı, internet bağlantınızı kontrol edin.');
        return;
      }

      const usdThen = record.quantity / rateThen;
      const tlNowEquivalent = usdThen * rateNow;

      setValueComparison({
        guest: record.guest,
        amount: record.quantity,
        dateLabel: formatIsoDateTr(record.giftDate || todayIsoDate()),
        usdThen,
        rateThen,
        rateNow,
        tlNowEquivalent,
      });
    } catch {
      Alert.alert('Değer Karşılaştırma', 'Kur bilgisi alınamadı.');
    } finally {
      setIsComparingValue(false);
    }
  };

  const handleRecordPress = (record: GiftRecord) => {
    if (viewingShare) {
      return;
    }
    if (record.type !== 'TL') {
      Alert.alert('Değer Karşılaştırma', 'Bu özellik şu an sadece TL kayıtları için kullanılabilir.');
      return;
    }
    void compareValueForRecord(record);
  };

  const exportRecords = async () => {
    const eventNameById = new Map(events.map((event) => [event.id, event.name]));
    const payload = {
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      events,
      records: records.map((record) => ({
        ...record,
        eventName: eventNameById.get(record.eventId) ?? '',
      })),
    };
    const json = JSON.stringify(payload, null, 2);
    const fileName = `takitakip-export-${new Date().toISOString().slice(0, 10)}.json`;

    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const file = new File(Paths.cache, fileName);
      file.create();
      file.write(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Takı kayıtlarını dışa aktar',
        });
      } else {
        Alert.alert('Dışa aktarma', `Dosya kaydedildi: ${file.uri}`);
      }
    } catch {
      Alert.alert('Hata', 'Dışa aktarma sırasında bir sorun oluştu.');
    }
  };

  const importRecords = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || !result.assets?.length) {
        return;
      }

      const picked = result.assets[0];
      const jsonText =
        Platform.OS === 'web'
          ? await (picked as unknown as { file: globalThis.File }).file.text()
          : await new File(picked.uri).text();

      const parsed = JSON.parse(jsonText);
      const importedRecords: Record<string, unknown>[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.records)
          ? parsed.records
          : [];

      if (!importedRecords.length) {
        Alert.alert('İçe aktarma', 'Dosyada geçerli kayıt bulunamadı.');
        return;
      }

      setIsSaving(true);

      const importedEvents: LocalEvent[] = Array.isArray(parsed?.events) ? parsed.events : [];
      const knownEventIds = new Set(events.map((event) => event.id));
      const newEvents = importedEvents.filter(
        (event) =>
          typeof event?.id === 'string' &&
          typeof event?.name === 'string' &&
          event.name &&
          !knownEventIds.has(event.id),
      );

      for (const event of newEvents) {
        if (Platform.OS !== 'web') {
          await saveLocalEvent(event);
        }
        if (supabase && session) {
          await supabase.from('events').insert({ id: event.id, name: event.name });
        }
      }
      if (newEvents.length) {
        setEvents((current) => [...current, ...newEvents]);
      }

      const normalizedRecords: LocalGiftRecord[] = importedRecords.map((record) => ({
        id: typeof record?.id === 'string' && record.id ? record.id : createRecordId(),
        guest: String(record?.guest ?? ''),
        type: String(record?.type ?? 'Diğer'),
        quantity: Number(record?.quantity) || 1,
        value: Number(record?.value) || 0,
        note: String(record?.note ?? ''),
        hasQuantity: Boolean(record?.hasQuantity),
        direction: record?.direction === 'Giden' ? 'Giden' : 'Gelen',
        giftDate:
          typeof record?.giftDate === 'string' && record.giftDate
            ? record.giftDate
            : todayIsoDate(),
        eventId:
          typeof record?.eventId === 'string' && record.eventId
            ? record.eventId
            : selectedEventId,
      }));

      for (const record of normalizedRecords) {
        if (supabase && session) {
          await supabase.from('gift_records').upsert(toSupabaseRow(record));
        }
        if (Platform.OS !== 'web') {
          await saveLocalRecord(record);
        }
      }

      const newCategoryNames = normalizedRecords
        .map((record) => record.type)
        .filter((type) => !categories.includes(type));

      for (const category of Array.from(new Set(newCategoryNames))) {
        if (Platform.OS !== 'web') {
          await saveLocalCategory(category);
        }
      }
      if (newCategoryNames.length) {
        setCustomCategories((current) => [...current, ...Array.from(new Set(newCategoryNames))]);
      }

      setRecords((current) => {
        const byId = new Map(current.map((record) => [record.id, record]));
        normalizedRecords.forEach((record) => byId.set(record.id, record));
        return Array.from(byId.values());
      });

      setIsSaving(false);
      Alert.alert('İçe aktarma', `${normalizedRecords.length} kayıt içe aktarıldı.`);
    } catch {
      setIsSaving(false);
      Alert.alert('Hata', 'Dosya okunamadı veya format geçersiz.');
    }
  };

  const editRecord = async () => {
    const recordToEdit = records.find((record) => record.id === editingId);
    if (!recordToEdit) {
      return;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!guest.trim() || !parsedQuantity || parsedQuantity < 1) {
      return;
    }

    const updatedRecord: LocalGiftRecord = {
      ...recordToEdit,
      guest: guest.trim(),
      type,
      quantity: parsedQuantity,
      note: note.trim(),
      hasQuantity,
      direction,
      giftDate: normalizeIsoDate(giftDate),
      eventId: formEventId || recordToEdit.eventId || selectedEventId,
    };

    setIsSaving(true);
    setDbError('');

    if (supabase && session) {
      const { data, error } = await supabase
        .from('gift_records')
        .update({
          guest: updatedRecord.guest,
          type: updatedRecord.type,
          quantity: updatedRecord.quantity,
          note: updatedRecord.note,
          has_quantity: updatedRecord.hasQuantity,
          direction: updatedRecord.direction,
          gift_date: updatedRecord.giftDate,
          event_id: updatedRecord.eventId || null,
        })
        .eq('id', updatedRecord.id)
        .select('id, guest, type, quantity, value, note, has_quantity, direction, gift_date, event_id')
        .single();

      if (error) {
        setDbError('Kayıt güncellenemedi.');
        setIsSaving(false);
        return;
      }

      updatedRecord.guest = data.guest;
      updatedRecord.type = data.type;
      updatedRecord.quantity = Number(data.quantity);
      updatedRecord.note = data.note;
      updatedRecord.hasQuantity = Boolean(data.has_quantity);
      updatedRecord.direction = data.direction as GiftDirection;
      updatedRecord.giftDate = data.gift_date;
      updatedRecord.eventId = data.event_id ?? '';
    }

    if (Platform.OS !== 'web') {
      await saveLocalRecord(updatedRecord);
    }

    setRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.id === updatedRecord.id ? updatedRecord : record,
      ),
    );
    setIsSaving(false);
    resetForm();
    setEditingId(null);
    setIsFormVisible(false);
  };

  return (
    <View
      style={[
        styles.safeArea,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar style="dark" />
      <FlatList
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 110 + insets.bottom },
        ]}
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
              </View>
              <Pressable
                style={styles.headerMark}
                onPress={() => setIsMenuVisible(true)}
              >
                <Text style={styles.headerMarkText}>TT</Text>
              </Pressable>
            </View>

            {!viewingShare ? (
              <Pressable
                style={styles.eventField}
                onPress={() => setIsEventPickerVisible(true)}
              >
                <Text style={styles.eventFieldLabel}>ETKİNLİK</Text>
                <View style={styles.eventFieldValueRow}>
                  <Text style={styles.eventFieldValue}>
                    {events.find((event) => event.id === selectedEventId)?.name ?? 'Etkinlik seç'}
                  </Text>
                  <Text style={styles.eventFieldChevron}>⌄</Text>
                </View>
              </Pressable>
            ) : null}

            {viewingShare ? (
              <View style={styles.sharedBanner}>
                <View style={styles.sharedBannerInfo}>
                  <Text style={styles.sharedBannerTitle}>
                    {viewingShare.ownerLabel}
                  </Text>
                  <Text style={styles.sharedBannerSubtitle}>
                    Paylaşılan kayıtlar · salt okunur
                  </Text>
                </View>
                <Pressable onPress={exitSharedView}>
                  <Text style={styles.sharedBannerExit}>Geri Dön</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Davetli ara..."
                placeholderTextColor="#9B958A"
                style={[
                  styles.searchInput,
                  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                ]}
              />
            </View>

            <View style={styles.directionRow}>
              {directionFilters.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setSelectedDirection(item)}
                  style={[
                    styles.directionChip,
                    selectedDirection === item && styles.directionChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.directionText,
                      selectedDirection === item && styles.directionTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
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
          <Swipeable
            enabled={!viewingShare}
            friction={1}
            rightThreshold={24}
            overshootRight={false}
            renderRightActions={() => (
              <View style={styles.swipeActions}>
                <Pressable
                  style={[styles.swipeActionButton, styles.swipeEditButton]}
                  onPress={() => openEditFormFor(item)}
                >
                  <Text style={styles.swipeActionText}>Düzenle</Text>
                </Pressable>
                <Pressable
                  style={[styles.swipeActionButton, styles.swipeDeleteButton]}
                  onPress={() => confirmDeleteRecord(item)}
                >
                  <Text style={styles.swipeActionText}>Sil</Text>
                </Pressable>
              </View>
            )}
          >
            <Pressable
              style={styles.recordCard}
              onPress={() => handleRecordPress(item)}
            >
              <View style={styles.recordIcon}>
                <Text style={styles.recordIconText}>{getTypeAbbreviation(item.type)}</Text>
              </View>
              <View style={styles.recordDetails}>
                <Text style={styles.recordGuest}>{item.guest}</Text>
                {item.note ? <Text style={styles.recordMeta}>{item.note}</Text> : null}
              </View>
              <View style={styles.recordAmount}>
                <Text
                  style={[
                    styles.recordValue,
                    item.direction === 'Giden' && styles.recordValueOutgoing,
                  ]}
                >
                  {item.direction === 'Giden' ? '↑ ' : '↓ '}
                  {formatRecordType(item)}
                </Text>
              </View>
            </Pressable>
          </Swipeable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✦</Text>
            <Text style={styles.emptyTitle}>
              {isLoading
                ? 'Kayıtlar yükleniyor...'
                : displayedRecords.length
                  ? 'Aradığın kayıt yok'
                  : viewingShare
                    ? 'Bu kişinin henüz kaydı yok'
                    : 'Henüz takı kaydı yok'}
            </Text>
            <Text style={styles.emptyText}>
              {dbError || (displayedRecords.length
                ? 'Farklı bir isim veya kategori dene.'
                : viewingShare
                  ? ''
                  : 'İlk kaydı ekleyerek düğün listenizi oluşturmaya başlayın.')}
            </Text>
          </View>
        }
      />

      {!viewingShare ? (
        <Pressable
          style={[styles.addButton, { bottom: 22 + insets.bottom }]}
          onPress={() => {
            resetForm();
            setEditingId(null);
            setIsFormVisible(true);
          }}
        >
          <Text style={styles.addButtonPlus}>+</Text>
          <Text style={styles.addButtonText}>Takı Ekle</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <Pressable style={styles.actionBackdrop} onPress={() => setIsMenuVisible(false)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Menü</Text>
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                setIsMenuVisible(false);
                void exportRecords();
              }}
            >
              <Text style={styles.actionButtonText}>Dışa Aktar (JSON)</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                setIsMenuVisible(false);
                void importRecords();
              }}
            >
              <Text style={styles.actionButtonText}>İçe Aktar (JSON)</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                setIsMenuVisible(false);
                setIsCategoryFormVisible(true);
              }}
            >
              <Text style={styles.actionButtonText}>Kategori Ekle</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={handleBackupToCloud}
            >
              <Text style={styles.actionButtonText}>
                {isBackingUp ? 'Yedekleniyor...' : 'Yedekle'}
              </Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={openShareModal}>
              <Text style={styles.actionButtonText}>Paylaş</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={openIncomingSharesModal}>
              <Text style={styles.actionButtonText}>Benimle Paylaşılanlar</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                setIsMenuVisible(false);
                setMagicLinkMessage('');
                setIsAccountModalVisible(true);
              }}
            >
              <Text style={styles.actionButtonText}>
                {session?.user.email ? session.user.email : 'Hesap · Giriş Yap'}
              </Text>
            </Pressable>
            <Pressable style={styles.actionCancel} onPress={() => setIsMenuVisible(false)}>
              <Text style={styles.actionCancelText}>Kapat</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isLoginPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLoginPromptVisible(false)}
      >
        <View style={styles.actionBackdrop}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Giriş yapmak ister misin?</Text>
            <Text style={styles.actionSubtitle}>
              Giriş yaparsan kayıtlarını başka cihazlardan da görebilirsin. Giriş yapmadan da
              devam edebilirsin, kayıtların bu durumda sadece bu telefonda tutulur.
            </Text>
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                setIsLoginPromptVisible(false);
                setMagicLinkMessage('');
                setIsAccountModalVisible(true);
              }}
            >
              <Text style={styles.actionButtonText}>Giriş Yap</Text>
            </Pressable>
            <Pressable
              style={styles.actionCancel}
              onPress={() => setIsLoginPromptVisible(false)}
            >
              <Text style={styles.actionCancelText}>Giriş Yapmadan Devam Et</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isAccountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAccountModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.actionBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsAccountModalVisible(false)}
          />
          <View style={styles.categoryFormScroll}>
            <ScrollView
              contentContainerStyle={styles.categoryForm}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.actionTitle}>Hesap</Text>

            {!isSupabaseConfigured ? (
              <Text style={styles.actionSubtitle}>
                Bulut veritabanı henüz yapılandırılmadı, bu yüzden oturum açma kullanılamıyor.
              </Text>
            ) : session ? (
              <>
                <Text style={styles.actionSubtitle}>{session.user.email}</Text>
                <Pressable
                  style={styles.categorySave}
                  onPress={() => void handleSignOut()}
                >
                  <Text style={styles.categorySaveText}>Çıkış Yap</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteAccountButton}
                  onPress={handleDeleteAccount}
                  disabled={isDeletingAccount}
                >
                  <Text style={styles.deleteAccountButtonText}>
                    {isDeletingAccount ? 'Siliniyor...' : 'Hesabımı Sil'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.actionSubtitle}>
                  Verilerini başka bir cihazdan da görmek için giriş yap.
                </Text>

                <View style={styles.loginMethodRow}>
                  <Pressable
                    style={[
                      styles.loginMethodOption,
                      loginMethod === 'magic' && styles.loginMethodOptionActive,
                    ]}
                    onPress={() => {
                      setLoginMethod('magic');
                      setMagicLinkMessage('');
                    }}
                  >
                    <Text
                      style={[
                        styles.loginMethodText,
                        loginMethod === 'magic' && styles.loginMethodTextActive,
                      ]}
                    >
                      Sihirli Bağlantı
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.loginMethodOption,
                      loginMethod === 'password' && styles.loginMethodOptionActive,
                    ]}
                    onPress={() => {
                      setLoginMethod('password');
                      setMagicLinkMessage('');
                    }}
                  >
                    <Text
                      style={[
                        styles.loginMethodText,
                        loginMethod === 'password' && styles.loginMethodTextActive,
                      ]}
                    >
                      Şifre
                    </Text>
                  </Pressable>
                </View>

                <TextInput
                  value={loginName}
                  onChangeText={setLoginName}
                  placeholder="İsim"
                  placeholderTextColor="#9B958A"
                  style={styles.input}
                />

                <TextInput
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  placeholder="ornek@eposta.com"
                  placeholderTextColor="#9B958A"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, styles.passwordInput]}
                />

                {loginMethod === 'password' ? (
                  <TextInput
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    placeholder="Şifre (en az 6 karakter)"
                    placeholderTextColor="#9B958A"
                    secureTextEntry
                    style={[styles.input, styles.passwordInput]}
                  />
                ) : null}

                {magicLinkMessage ? (
                  <Text style={styles.accountMessage}>{magicLinkMessage}</Text>
                ) : null}

                <View style={styles.categoryFormActions}>
                  <Pressable
                    style={styles.categoryCancel}
                    onPress={() => setIsAccountModalVisible(false)}
                  >
                    <Text style={styles.actionCancelText}>Kapat</Text>
                  </Pressable>
                  {loginMethod === 'magic' ? (
                    <Pressable
                      style={styles.categorySave}
                      onPress={() => void handleSendMagicLink()}
                    >
                      <Text style={styles.categorySaveText}>
                        {isSendingMagicLink ? 'Gönderiliyor...' : 'Giriş Linki Gönder'}
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        style={styles.categoryCancel}
                        onPress={() => void handlePasswordSignUp()}
                      >
                        <Text style={styles.actionCancelText}>Hesap Oluştur</Text>
                      </Pressable>
                      <Pressable
                        style={styles.categorySave}
                        onPress={() => void handlePasswordSignIn()}
                      >
                        <Text style={styles.categorySaveText}>
                          {isSendingMagicLink ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>veya</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  style={styles.googleButton}
                  onPress={() => void handleGoogleSignIn()}
                >
                  <Text style={styles.googleButtonText}>
                    {isGoogleSigningIn ? 'Giriş yapılıyor...' : 'Google ile Giriş Yap'}
                  </Text>
                </Pressable>
              </>
            )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isShareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsShareModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.actionBackdrop}
        >
          <View style={styles.categoryForm}>
            <Text style={styles.actionTitle}>Paylaş</Text>
            <Text style={styles.actionSubtitle}>
              Kayıtlarını salt okunur şekilde başka bir hesapla paylaş.
            </Text>
            <TextInput
              value={shareEmail}
              onChangeText={setShareEmail}
              placeholder="ornek@eposta.com"
              placeholderTextColor="#9B958A"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            {shareMessage ? (
              <Text style={styles.accountMessage}>{shareMessage}</Text>
            ) : null}
            <View style={styles.categoryFormActions}>
              <Pressable
                style={styles.categoryCancel}
                onPress={() => setIsShareModalVisible(false)}
              >
                <Text style={styles.actionCancelText}>Kapat</Text>
              </Pressable>
              <Pressable style={styles.categorySave} onPress={() => void handleSendShare()}>
                <Text style={styles.categorySaveText}>
                  {isSendingShare ? 'Gönderiliyor...' : 'Davet Gönder'}
                </Text>
              </Pressable>
            </View>

            {outgoingShares.length ? (
              <View style={styles.shareList}>
                <Text style={styles.shareListTitle}>Paylaştıklarım</Text>
                {outgoingShares.map((share) => (
                  <View key={share.id} style={styles.shareRow}>
                    <View style={styles.shareRowInfo}>
                      <Text style={styles.shareRowEmail}>{share.recipient_email}</Text>
                      <Text style={styles.shareRowStatus}>{shareStatusLabel(share.status)}</Text>
                    </View>
                    <Pressable onPress={() => void handleRevokeShare(share.id)}>
                      <Text style={styles.shareRowRevoke}>İptal Et</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isIncomingSharesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsIncomingSharesModalVisible(false)}
      >
        <Pressable
          style={styles.actionBackdrop}
          onPress={() => setIsIncomingSharesModalVisible(false)}
        >
          <View style={styles.categoryForm}>
            <Text style={styles.actionTitle}>Benimle Paylaşılanlar</Text>

            {isLoadingShares ? (
              <Text style={styles.actionSubtitle}>Yükleniyor...</Text>
            ) : incomingShares.length ? (
              <View style={styles.shareList}>
                {incomingShares.map((share) => (
                  <View key={share.id} style={styles.shareRow}>
                    {share.status === 'accepted' ? (
                      <Pressable
                        style={styles.shareRowInfo}
                        onPress={() =>
                          void handleViewSharedRecords(
                            share.owner_id,
                            share.owner_name || share.owner_email,
                          )
                        }
                      >
                        <Text style={styles.shareRowEmail}>
                          {share.owner_name || share.owner_email}
                        </Text>
                        {share.owner_name ? (
                          <Text style={styles.shareRowStatus}>{share.owner_email}</Text>
                        ) : null}
                        <Text style={styles.shareRowStatus}>
                          {isSharedLoading ? 'Yükleniyor...' : 'Görüntülemek için dokun'}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={styles.shareRowInfo}>
                        <Text style={styles.shareRowEmail}>
                          {share.owner_name || share.owner_email}
                        </Text>
                        <Text style={styles.shareRowStatus}>{shareStatusLabel(share.status)}</Text>
                      </View>
                    )}
                    {share.status === 'pending' ? (
                      <View style={styles.shareRowActions}>
                        <Pressable onPress={() => void handleRespondToShare(share.id, true)}>
                          <Text style={styles.shareRowAccept}>Kabul Et</Text>
                        </Pressable>
                        <Pressable onPress={() => void handleRespondToShare(share.id, false)}>
                          <Text style={styles.shareRowRevoke}>Reddet</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.actionSubtitle}>Henüz sizinle paylaşılan bir şey yok.</Text>
            )}

            <Pressable
              style={styles.actionCancel}
              onPress={() => setIsIncomingSharesModalVisible(false)}
            >
              <Text style={styles.actionCancelText}>Kapat</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isCategoryFormVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCategoryFormVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.actionBackdrop}
        >
          <View style={styles.categoryForm}>
            <Text style={styles.actionTitle}>Yeni kategori</Text>
            <Text style={styles.actionSubtitle}>
              Takı listeniz için bir kategori adı yazın.
            </Text>
            <TextInput
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="Örn. Saat"
              placeholderTextColor="#9B958A"
              style={styles.input}
              autoFocus
            />
            <View style={styles.categoryFormActions}>
              <Pressable
                style={styles.categoryCancel}
                onPress={() => setIsCategoryFormVisible(false)}
              >
                <Text style={styles.actionCancelText}>İptal</Text>
              </Pressable>
              <Pressable style={styles.categorySave} onPress={() => void addCategory()}>
                <Text style={styles.categorySaveText}>Ekle</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(valueComparison)}
        transparent
        animationType="fade"
        onRequestClose={() => setValueComparison(null)}
      >
        <Pressable
          style={styles.actionBackdrop}
          onPress={() => setValueComparison(null)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Değer Karşılaştırma</Text>
            {valueComparison ? (
              <>
                <Text style={styles.actionSubtitle}>
                  {valueComparison.guest} · {valueComparison.dateLabel}
                </Text>
                <View style={styles.comparisonBox}>
                  <Text style={styles.comparisonLine}>
                    {valueComparison.dateLabel} tarihinde {valueComparison.amount} TL yaklaşık
                    olarak <Text style={styles.comparisonHighlight}>${valueComparison.usdThen.toFixed(2)}</Text> değerindeydi.
                  </Text>
                  <Text style={styles.comparisonLine}>
                    ${valueComparison.usdThen.toFixed(2)} doların bugünkü değeri{' '}
                    <Text style={styles.comparisonHighlight}>
                      ~{valueComparison.tlNowEquivalent.toFixed(0)} TL
                    </Text>
                    'ye denk geliyor.
                  </Text>
                  <Text style={styles.comparisonMeta}>
                    1$ = {valueComparison.rateThen.toFixed(2)} TL ({valueComparison.dateLabel}) →
                    {' '}1$ = {valueComparison.rateNow.toFixed(2)} TL (bugün)
                  </Text>
                </View>
              </>
            ) : null}
            <Pressable
              style={styles.actionCancel}
              onPress={() => setValueComparison(null)}
            >
              <Text style={styles.actionCancelText}>Kapat</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFormVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={[styles.formSheet, styles.formSheetBounded]}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 220 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formEyebrow}>
                  {editingId ? 'KAYDI DÜZENLE' : 'YENİ KAYIT'}
                </Text>
                <Text style={styles.formTitle}>Takı bilgileri</Text>
              </View>
              <Pressable
                onPress={() => {
                  setEditingId(null);
                  setIsFormVisible(false);
                }}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Etkinlik</Text>
            <Pressable
              style={styles.comboboxField}
              onPress={() => setIsFormEventPickerVisible(true)}
            >
              <Text style={styles.comboboxValue}>
                {events.find((event) => event.id === formEventId)?.name ?? 'Etkinlik seç'}
              </Text>
              <Text style={styles.comboboxChevron}>⌄</Text>
            </Pressable>

            <View style={styles.formDirectionRow}>
              {(['Gelen', 'Giden'] as GiftDirection[]).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setDirection(item)}
                  style={[
                    styles.formDirectionOption,
                    direction === item && styles.formDirectionOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.formDirectionText,
                      direction === item && styles.formDirectionTextActive,
                    ]}
                  >
                    {item === 'Gelen' ? '↓ Gelen' : '↑ Giden'}
                  </Text>
                </Pressable>
              ))}
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
            <Pressable
              style={styles.comboboxField}
              onPress={() => setIsTypePickerVisible(true)}
            >
              <Text style={styles.comboboxValue}>{type}</Text>
              <Text style={styles.comboboxChevron}>⌄</Text>
            </Pressable>

            {!currencyTypes.includes(type) ? (
              <Pressable
                style={styles.quantityToggle}
                onPress={() => setHasQuantity((currentValue) => !currentValue)}
              >
                <Checkbox
                  value={hasQuantity}
                  onValueChange={setHasQuantity}
                  color={hasQuantity ? '#B56A45' : undefined}
                />
                <Text style={styles.quantityToggleText}>Adetli kayıt</Text>
              </Pressable>
            ) : null}

            {(currencyTypes.includes(type) || hasQuantity) ? (
              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>
                    {currencyTypes.includes(type) ? 'Tutar' : 'Adet'}
                  </Text>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Not (opsiyonel)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Örn. kutu ile birlikte"
              placeholderTextColor="#9B958A"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Tarih</Text>
            <View style={styles.dateRow}>
              {(() => {
                const [year, month, day] = giftDate.split('-');
                return (
                  <>
                    <TextInput
                      value={day}
                      onChangeText={(text) =>
                        setGiftDate(`${year}-${month}-${text.replace(/[^0-9]/g, '').slice(0, 2)}`)
                      }
                      placeholder="GG"
                      placeholderTextColor="#9B958A"
                      keyboardType="number-pad"
                      maxLength={2}
                      style={[styles.input, styles.dateInput]}
                    />
                    <TextInput
                      value={month}
                      onChangeText={(text) =>
                        setGiftDate(`${year}-${text.replace(/[^0-9]/g, '').slice(0, 2)}-${day}`)
                      }
                      placeholder="AA"
                      placeholderTextColor="#9B958A"
                      keyboardType="number-pad"
                      maxLength={2}
                      style={[styles.input, styles.dateInput]}
                    />
                    <TextInput
                      value={year}
                      onChangeText={(text) =>
                        setGiftDate(`${text.replace(/[^0-9]/g, '').slice(0, 4)}-${month}-${day}`)
                      }
                      placeholder="YYYY"
                      placeholderTextColor="#9B958A"
                      keyboardType="number-pad"
                      maxLength={4}
                      style={[styles.input, styles.dateInputYear]}
                    />
                  </>
                );
              })()}
            </View>

            <Pressable
              style={styles.saveButton}
              onPress={editingId ? editRecord : addRecord}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Kaydediliyor...' : 'Kaydı Ekle'}
              </Text>
            </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isTypePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTypePickerVisible(false)}
      >
        <Pressable
          style={styles.actionBackdrop}
          onPress={() => setIsTypePickerVisible(false)}
        >
          <View style={styles.comboboxSheet}>
            <Text style={styles.actionTitle}>Takı türü seç</Text>
            <FlatList
              data={categories.slice(1)}
              keyExtractor={(item) => item}
              style={styles.comboboxList}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.comboboxOption,
                    type === item && styles.comboboxOptionActive,
                  ]}
                  onPress={() => {
                    setType(item);
                    setIsTypePickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.comboboxOptionText,
                      type === item && styles.comboboxOptionTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isEventPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEventPickerVisible(false)}
      >
        <Pressable
          style={styles.actionBackdrop}
          onPress={() => setIsEventPickerVisible(false)}
        >
          <View style={styles.comboboxSheet}>
            <Text style={styles.actionTitle}>Etkinlik seç</Text>
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              style={styles.comboboxList}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.comboboxOption,
                    selectedEventId === item.id && styles.comboboxOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedEventId(item.id);
                    setIsEventPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.comboboxOptionText,
                      selectedEventId === item.id && styles.comboboxOptionTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.addEventButton}
              onPress={() => openAddEventModal('main')}
            >
              <Text style={styles.addEventButtonText}>+ Yeni Etkinlik</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isFormEventPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFormEventPickerVisible(false)}
      >
        <Pressable
          style={styles.actionBackdrop}
          onPress={() => setIsFormEventPickerVisible(false)}
        >
          <View style={styles.comboboxSheet}>
            <Text style={styles.actionTitle}>Etkinlik seç</Text>
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              style={styles.comboboxList}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.comboboxOption,
                    formEventId === item.id && styles.comboboxOptionActive,
                  ]}
                  onPress={() => {
                    setFormEventId(item.id);
                    setIsFormEventPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.comboboxOptionText,
                      formEventId === item.id && styles.comboboxOptionTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.addEventButton}
              onPress={() => openAddEventModal('form')}
            >
              <Text style={styles.addEventButtonText}>+ Yeni Etkinlik</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isAddEventModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddEventModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.actionBackdrop}
        >
          <View style={styles.categoryForm}>
            <Text style={styles.actionTitle}>Yeni etkinlik</Text>
            <Text style={styles.actionSubtitle}>
              Örn. Kızımın Düğünü, Oğlumun Sünneti, Komşunun Nişanı
            </Text>
            <TextInput
              value={newEventName}
              onChangeText={setNewEventName}
              placeholder="Etkinlik adı"
              placeholderTextColor="#9B958A"
              style={styles.input}
              autoFocus
            />
            <View style={styles.categoryFormActions}>
              <Pressable
                style={styles.categoryCancel}
                onPress={() => setIsAddEventModalVisible(false)}
              >
                <Text style={styles.actionCancelText}>İptal</Text>
              </Pressable>
              <Pressable style={styles.categorySave} onPress={() => void addEvent()}>
                <Text style={styles.categorySaveText}>
                  {isSavingEvent ? 'Ekleniyor...' : 'Ekle'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  headerMark: {
    alignItems: 'center', backgroundColor: '#E6B85C', borderRadius: 18, height: 58,
    justifyContent: 'center', transform: [{ rotate: '8deg' }], width: 58,
  },
  headerMarkText: { color: '#4C3821', fontSize: 18, fontWeight: '800', transform: [{ rotate: '-8deg' }] },
  sharedBanner: {
    alignItems: 'center', backgroundColor: '#263F3A', borderRadius: 13, flexDirection: 'row',
    justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  sharedBannerInfo: { flex: 1, paddingRight: 10 },
  sharedBannerTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  sharedBannerSubtitle: { color: '#B7C4C0', fontSize: 11, marginTop: 2 },
  sharedBannerExit: { color: '#E6B85C', fontSize: 13, fontWeight: '700' },
  eventField: {
    backgroundColor: '#FFFFFF', borderColor: '#ECE7DE', borderRadius: 13, borderWidth: 1,
    marginBottom: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  eventFieldLabel: { color: '#B56A45', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  eventFieldValueRow: {
    alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 3,
  },
  eventFieldValue: { color: '#25231F', fontSize: 16, fontWeight: '800' },
  eventFieldChevron: { color: '#918B81', fontSize: 16 },
  searchBox: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#ECE7DE', borderRadius: 13,
    borderWidth: 1, flexDirection: 'row', height: 52, paddingHorizontal: 14,
  },
  searchIcon: { color: '#B56A45', fontSize: 25, marginRight: 8, marginTop: -4 },
  searchInput: { color: '#25231F', flex: 1, fontSize: 15 },
  directionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  directionChip: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DED8CC', borderRadius: 11,
    borderWidth: 1, flex: 1, paddingVertical: 10,
  },
  directionChipActive: { backgroundColor: '#263F3A', borderColor: '#263F3A' },
  directionText: { color: '#777168', fontSize: 13, fontWeight: '700' },
  directionTextActive: { color: '#FFFFFF' },
  categoryList: { gap: 8, paddingVertical: 17 },
  categoryChip: { borderColor: '#DED8CC', borderRadius: 20, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 },
  categoryChipActive: { backgroundColor: '#B56A45', borderColor: '#B56A45' },
  categoryText: { color: '#777168', fontSize: 13, fontWeight: '600' },
  categoryTextActive: { color: '#FFFFFF' },
  sectionHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { color: '#25231F', fontSize: 19, fontWeight: '800' },
  sectionCount: { color: '#918B81', fontSize: 12 },
  recordCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 11, flexDirection: 'row', marginBottom: 8, minHeight: 50, padding: 6 },
  swipeActions: { flexDirection: 'row', marginBottom: 8 },
  swipeActionButton: {
    alignItems: 'center', justifyContent: 'center', marginLeft: 6, minHeight: 50,
    paddingHorizontal: 18,
  },
  swipeEditButton: { backgroundColor: '#263F3A', borderRadius: 11 },
  swipeDeleteButton: { backgroundColor: '#C0392B', borderRadius: 11 },
  swipeActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  recordIcon: { alignItems: 'center', backgroundColor: '#F8E6D9', borderRadius: 8, height: 32, justifyContent: 'center', marginRight: 8, width: 32 },
  recordIconText: { color: '#B56A45', fontSize: 15 },
  recordDetails: { flex: 1 },
  recordGuest: { color: '#25231F', fontSize: 14, fontWeight: '700' },
  recordMeta: { color: '#918B81', fontSize: 10, marginTop: 2 },
  recordAmount: { alignItems: 'flex-end' },
  recordValue: { color: '#263F3A', fontSize: 13, fontWeight: '800' },
  recordValueOutgoing: { color: '#B56A45' },
  emptyState: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 38 },
  emptyIcon: { color: '#D3B27A', fontSize: 35 },
  emptyTitle: { color: '#4C4841', fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptyText: { color: '#918B81', fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  addButton: {
    alignItems: 'center', backgroundColor: '#B56A45', borderRadius: 16, bottom: 22, elevation: 4,
    flexDirection: 'row', justifyContent: 'center', left: 20, minHeight: 56, position: 'absolute', right: 20,
    shadowColor: '#7A4227', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  addButtonPlus: { color: '#FFFFFF', fontSize: 25, fontWeight: '300', includeFontPadding: false, lineHeight: 25, marginRight: 8, textAlignVertical: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', includeFontPadding: false, lineHeight: 19, textAlignVertical: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(28, 28, 25, 0.42)', flex: 1, justifyContent: 'flex-end' },
  actionBackdrop: { backgroundColor: 'rgba(28, 28, 25, 0.42)', flex: 1, justifyContent: 'center', padding: 24 },
  actionSheet: { backgroundColor: '#F7F4EE', borderRadius: 20, padding: 20 },
  comparisonBox: { backgroundColor: '#FFFFFF', borderRadius: 14, marginTop: 14, padding: 16 },
  comparisonLine: { color: '#25231F', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  comparisonHighlight: { color: '#B56A45', fontWeight: '800' },
  comparisonMeta: { color: '#918B81', fontSize: 12, lineHeight: 17, marginTop: 2 },
  actionTitle: { color: '#25231F', fontSize: 19, fontWeight: '800' },
  actionSubtitle: { color: '#918B81', fontSize: 13, marginTop: 4, marginBottom: 12 },
  actionButton: { backgroundColor: '#FFFFFF', borderRadius: 11, marginTop: 8, padding: 15 },
  actionButtonDisabled: { opacity: 0.45 },
  actionButtonText: { color: '#263F3A', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  actionButtonTextDisabled: { color: '#918B81' },
  actionCancel: { padding: 15 },
  actionCancelText: { color: '#918B81', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  categoryForm: { backgroundColor: '#F7F4EE', borderRadius: 20, padding: 20 },
  categoryFormScroll: {
    backgroundColor: '#F7F4EE', borderRadius: 20, maxHeight: '80%', overflow: 'hidden', width: '100%',
  },
  categoryFormActions: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 14,
  },
  categoryCancel: { paddingHorizontal: 14, paddingVertical: 13 },
  categorySave: { backgroundColor: '#B56A45', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13 },
  categorySaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  deleteAccountButton: { alignItems: 'center', marginTop: 14, padding: 8 },
  deleteAccountButtonText: { color: '#C0392B', fontSize: 13, fontWeight: '700' },
  accountMessage: { color: '#3B8061', fontSize: 12, fontWeight: '600', marginTop: 10 },
  shareList: { marginTop: 18, maxHeight: 260 },
  shareListTitle: { color: '#4C4841', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  shareRow: {
    alignItems: 'center', borderTopColor: '#ECE7DE', borderTopWidth: 1, flexDirection: 'row',
    justifyContent: 'space-between', paddingVertical: 12,
  },
  shareRowInfo: { flex: 1, paddingRight: 10 },
  shareRowEmail: { color: '#25231F', fontSize: 14, fontWeight: '700' },
  shareRowStatus: { color: '#918B81', fontSize: 12, marginTop: 2 },
  shareRowActions: { flexDirection: 'row', gap: 14 },
  shareRowAccept: { color: '#3B8061', fontSize: 13, fontWeight: '700' },
  shareRowRevoke: { color: '#B56A45', fontSize: 13, fontWeight: '700' },
  loginMethodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  loginMethodOption: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 10,
    borderWidth: 1, flex: 1, paddingVertical: 10,
  },
  loginMethodOptionActive: { backgroundColor: '#263F3A', borderColor: '#263F3A' },
  loginMethodText: { color: '#777168', fontSize: 13, fontWeight: '700' },
  loginMethodTextActive: { color: '#FFFFFF' },
  passwordInput: { marginTop: 10 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 18 },
  dividerLine: { backgroundColor: '#E5DED2', flex: 1, height: 1 },
  dividerText: { color: '#918B81', fontSize: 12, fontWeight: '600' },
  googleButton: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 12,
    borderWidth: 1, height: 48, justifyContent: 'center', marginTop: 14,
  },
  googleButtonText: { color: '#25231F', fontSize: 14, fontWeight: '700' },
  formSheet: { backgroundColor: '#F7F4EE', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22 },
  formSheetBounded: { maxHeight: '90%', paddingBottom: 0 },
  formHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  formDirectionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  formDirectionOption: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 11,
    borderWidth: 1, flex: 1, paddingVertical: 12,
  },
  formDirectionOptionActive: { backgroundColor: '#263F3A', borderColor: '#263F3A' },
  formDirectionText: { color: '#777168', fontSize: 14, fontWeight: '700' },
  formDirectionTextActive: { color: '#FFFFFF' },
  formEyebrow: { color: '#B56A45', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  formTitle: { color: '#25231F', fontSize: 25, fontWeight: '800', marginTop: 3 },
  closeText: { color: '#777168', fontSize: 30, fontWeight: '300', lineHeight: 28 },
  inputLabel: { color: '#4C4841', fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 9 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 11, borderWidth: 1, color: '#25231F', fontSize: 15, height: 48, paddingHorizontal: 13 },
  comboboxField: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E5DED2', borderRadius: 11,
    borderWidth: 1, flexDirection: 'row', height: 48, justifyContent: 'space-between',
    paddingHorizontal: 13,
  },
  comboboxValue: { color: '#25231F', fontSize: 15, fontWeight: '600' },
  comboboxChevron: { color: '#918B81', fontSize: 16 },
  comboboxSheet: {
    backgroundColor: '#F7F4EE', borderRadius: 20, maxHeight: '70%', padding: 20, width: '100%',
  },
  comboboxList: { marginTop: 4 },
  addEventButton: { alignItems: 'center', borderTopColor: '#ECE7DE', borderTopWidth: 1, marginTop: 10, paddingTop: 14 },
  addEventButtonText: { color: '#B56A45', fontSize: 14, fontWeight: '800' },
  comboboxOption: { borderRadius: 11, padding: 14 },
  comboboxOptionActive: { backgroundColor: '#FFFFFF' },
  comboboxOptionText: { color: '#4C4841', fontSize: 15, fontWeight: '600' },
  comboboxOptionTextActive: { color: '#263F3A', fontWeight: '800' },
  inputRow: { flexDirection: 'row', gap: 10 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1, textAlign: 'center' },
  dateInputYear: { flex: 1.4, textAlign: 'center' },
  inputHalf: { flex: 1 },
  quantityToggle: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 14 },
  quantityToggleText: { color: '#4C4841', fontSize: 13, fontWeight: '700' },
  saveButton: { alignItems: 'center', backgroundColor: '#B56A45', borderRadius: 12, height: 52, justifyContent: 'center', marginTop: 21 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
