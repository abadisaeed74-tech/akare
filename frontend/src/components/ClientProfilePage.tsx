import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  message,
  ConfigProvider,
  Layout,
} from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  ApartmentOutlined,
  SolutionOutlined,
  ScheduleOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  EditOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  deleteClientRequest,
  getClientRequests,
  updateClientRequest,
  setAuthToken,
  getClientRequestMatches,
  resolveMediaUrl,
  createClientRequest,
  getClientNotes,
  createClientNote,
  deleteClientNote,
  createClientOffer,
  deleteClientOffer,
  updateClientOffer,
  getClientOffersByClient,
  getProperties,
  getClientOfferNotes,
  createClientOfferNote,
  deleteClientOfferNote,
  getClientOffer,
  getClientProfileByClient,
  getClientProfile,
  deleteClientProfile,
  type ClientRequest,
  type ClientOffer,
  type Property,
  type ClientNote,
  type ClientProfile,
} from '../services/api';

// Helper to map backend offer status to frontend status
const mapOfferStatus = (backendStatus: string): string => {
  if (backendStatus === 'new' || backendStatus === 'active') return 'جديد';
  if (backendStatus === 'working') return ' جاري ';
  // archived, closed, or any other
  return 'اغلاق';
};

// Helper to get offer status color
const getOfferStatusColor = (status: string): string => {
  if (status === 'جديد') return 'blue';
  if (status === ' جاري ') return 'orange';
  return 'green';
};
import PlatformLogo from './PlatformLogo';

// Extend dayjs with plugins
dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const SAUDI_TZ = 'Asia/Riyadh';

const normalizeOfferIdentity = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

const digitsOnly = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

const phonesLooseEqual = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da && !db) return true;
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true;
  return false;
};

/** Same client row: exact profile_id match, or same name + phone (fixes legacy wrong/duplicate profile_id). */
const offerMatchesClientProfile = (offer: ClientOffer, p: ClientProfile): boolean => {
  if (offer.profile_id === p.id) return true;
  const nameMatch =
    normalizeOfferIdentity(offer.client_name) === normalizeOfferIdentity(p.client_name);
  if (!nameMatch) return false;
  return phonesLooseEqual(offer.phone_number, p.phone_number);
};

const offerMatchesIdentityStrings = (
  offer: ClientOffer,
  clientName: string,
  phone: string | null,
): boolean =>
  normalizeOfferIdentity(offer.client_name) === normalizeOfferIdentity(clientName) &&
  phonesLooseEqual(offer.phone_number, phone);

const phoneFromUrlForLookup = (raw: string): string | null => {
  const t = raw.trim();
  if (!t || t === 'غير متوفر') return null;
  return t;
};

// Helper to format deadline showing remaining time
const formatDeadlineDisplay = (isoString: string | null): string | null => {
  if (!isoString) return null;

  const deadline = dayjs.utc(isoString).tz(SAUDI_TZ);
  const now = dayjs().tz(SAUDI_TZ);

  if (deadline.isBefore(now)) {
    const timeStr = deadline.format('h:mm A'); // Already in SAUDI_TZ
    return `انتهى الوقت (${timeStr})`;
  }

  const timeStr = deadline.format('h:mm A'); // Already in SAUDI_TZ
  const diff = deadline.diff(now);
  const dur = dayjs.duration(diff); // Duration is timezone-agnostic
  const days = Math.floor(dur.asDays());
  const hours = Math.floor(dur.asHours()) % 24;
  const minutes = Math.floor(dur.asMinutes()) % 60;

  if (days > 0) {
    return `${timeStr} (بعد ${days} يوم${hours > 0 ? ` و ${hours} ساعة` : ''})`;
  }
  if (hours > 0) {
    return `${timeStr} (بعد ${hours} ساعة${minutes > 0 ? ` و ${minutes} دقيقة` : ''})`;
  }
  if (minutes > 0) {
    return `${timeStr} (بعد ${minutes} دقيقة)`;
  }
  return `${timeStr} (اقترب الموعد)`;
};

// Helper to get deadline tag color
const getDeadlineTagColor = (isoString: string | null): string => {
  if (!isoString) return 'orange';
  const deadline = dayjs.utc(isoString).tz(SAUDI_TZ);
  if (deadline.isBefore(dayjs())) {
    return 'red';
  }
  return 'orange';
};

// Helper to format budget
const formatBudget = (min?: number | null, max?: number | null): string => {
  if (!min && !max) return 'غير محدد';
  if (min && max) return `${min.toLocaleString('ar-SA')} - ${max.toLocaleString('ar-SA')} ر.س`;
  if (min) return `من ${min.toLocaleString('ar-SA')} ر.س`;
  return `حتى ${max!.toLocaleString('ar-SA')} ر.س`;
};

// Helper to format area
const formatArea = (min?: number | null, max?: number | null): string => {
  if (!min && !max) return 'غير محدد';
  if (min && max) return `${min.toLocaleString('ar-SA')} - ${max.toLocaleString('ar-SA')} م²`;
  if (min) return `من ${min.toLocaleString('ar-SA')} م²`;
  return `حتى ${max!.toLocaleString('ar-SA')} م²`;
};

const { Header, Content, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;

const reminderTypeLabel: Record<'follow_up' | 'viewing', string> = {
  follow_up: 'متابعة',
  viewing: 'معاينة',
};

// Helper to get reminder type label safely
const getReminderTypeLabel = (type?: string | null): string | undefined => {
  if (type === 'follow_up' || type === 'viewing') {
    return reminderTypeLabel[type];
  }
  return undefined;
};

const ClientProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const profileIdParam = searchParams.get('profile_id')?.trim() || '';
  const { clientKey } = useParams();
  const decoded = decodeURIComponent(clientKey || '');
  const [name = 'غير محدد', phone = 'غير متوفر'] = decoded.split('|');
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ClientRequest | null>(null);
  const [form] = Form.useForm();
  const [siderCollapsed, setSiderCollapsed] = useState<boolean>(false);
// Inline matching state - per request
  const [matchMap, setMatchMap] = useState<Record<string, Property[]>>({});
  const [loadingMatchMap, setLoadingMatchMap] = useState<Record<string, boolean>>({});
const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  
  // Notes state - per request
  const [notesMap, setNotesMap] = useState<Record<string, ClientNote[]>>({});
  const [loadingNotesMap, setLoadingNotesMap] = useState<Record<string, boolean>>({});
const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesRequestId, setNotesRequestId] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
const [savingNote, setSavingNote] = useState(false);
  
// Offers state - per client
  const [offersMap, setOffersMap] = useState<Record<string, any[]>>({});
const [offersModalOpen, setOffersModalOpen] = useState(false);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  
// Offer notes state
  const [offerNotesMap, setOfferNotesMap] = useState<Record<string, ClientNote[]>>({});
  const [loadingOfferNotesMap, setLoadingOfferNotesMap] = useState<Record<string, boolean>>({});
  const [offerNotesModalOpen, setOfferNotesModalOpen] = useState(false);
  const [offerNotesOfferId, setOfferNotesOfferId] = useState<string | null>(null);
  const [newOfferNoteContent, setNewOfferNoteContent] = useState('');
  const [savingOfferNote, setSavingOfferNote] = useState(false);
  
  // Offer reminder modal state
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderOffer, setReminderOffer] = useState<any>(null);
  const [reminderForm] = Form.useForm();
  
  // Create request (AI) state
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  const palette = {
    pageBg: 'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)',
    glassBg: 'rgba(255, 255, 255, 0.95)',
    glassBorder: '1px solid #e4e7df',
    text: '#294231',
    textMuted: '#6d7d72',
    cardBg: '#ffffff',
    accent: '#3f7d3c',
    surface: 'rgba(255, 255, 255, 0.98)',
  };

  const appTheme = {
    token: {
      colorPrimary: palette.accent,
      colorBgLayout: 'transparent',
      colorBgContainer: palette.cardBg,
      colorText: palette.text,
      colorTextSecondary: palette.textMuted,
      borderRadius: 14,
      fontFamily:
        "'Readex Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    },
    components: {
      Card: {
        colorBgContainer: palette.cardBg,
      },
    },
  };

const load = useCallback(async () => {
    setLoading(true);
    try {
      // First load all properties (needed for offers)
      const properties = await getProperties({});
      setAllProperties(properties);
      
      // Load persistent client profile: prefer stable id from URL (?profile_id=) then name/phone
      const profileIdFromQuery = profileIdParam || null;
      let resolvedProfile: ClientProfile | null = null;
      try {
        if (profileIdFromQuery) {
          try {
            resolvedProfile = await getClientProfile(profileIdFromQuery);
          } catch {
            resolvedProfile = null;
          }
        }
        if (!resolvedProfile) {
          const phoneLookup = phoneFromUrlForLookup(phone);
          resolvedProfile = await getClientProfileByClient(name.trim(), phoneLookup);
        }
      } catch (e) {
        console.error('Error loading client profile:', e);
        resolvedProfile = null;
      }
      setClientProfile(resolvedProfile);

      // Load client requests
      const all = await getClientRequests();
      const filtered = all
        .filter((r) => (r.client_name || 'غير محدد').trim() === name.trim() && (r.phone_number || '').trim() === phone.trim())
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      setRequests(filtered);

// Load client offers with properties
      try {
        const phoneParam = phoneFromUrlForLookup(phone);
        const effectiveProfileId = resolvedProfile?.id ?? profileIdFromQuery ?? null;
        const rawOffers = await getClientOffersByClient(
          name.trim(),
          phoneParam,
          effectiveProfileId,
        );
        const offersData = resolvedProfile
          ? rawOffers.filter((o) => offerMatchesClientProfile(o, resolvedProfile))
          : profileIdFromQuery
            ? rawOffers.filter(
                (o) =>
                  o.profile_id === profileIdFromQuery ||
                  offerMatchesIdentityStrings(o, name.trim(), phoneParam),
              )
            : rawOffers;
        // Build property map for all properties
        const propertyMap = new Map<string, Property>();
        for (const p of properties) {
          if (p.id) propertyMap.set(p.id, p);
        }
        // Map offers to include property details
        const offersWithProperties = await Promise.all(
          offersData.map(async (o) => {
            // Fetch full offer details to get reminder info
            try {
              const fullOffer = await getClientOffer(o.id!);
              return {
                ...fullOffer, // The full offer object now has all details
                property: propertyMap.get(o.property_id),
              };
            } catch {
              return { ...o, property: propertyMap.get(o.property_id) };
            }
          }),
        );
        setOffersMap({ [clientKey || '']: offersWithProperties });
      } catch (e) {
        console.error('Error loading offers:', e);
        // Ignore offers loading errors
      }
    } catch {
      message.error('تعذر تحميل ملف العميل.');
    } finally {
      setLoading(false);
    }
  }, [clientKey, name, phone, profileIdParam]);

useEffect(() => {
    load();
  }, [load]);

const openEdit = (item: ClientRequest) => {
    setEditing(item);
    form.setFieldsValue({
      client_name: item.client_name,
      phone_number: item.phone_number,
      property_type: item.property_type,
      city: item.city,
      neighborhoods: item.neighborhoods ? item.neighborhoods.join(', ') : undefined,
      budget_min: item.budget_min,
      budget_max: item.budget_max,
      area_min: item.area_min,
      area_max: item.area_max,
      additional_requirements: item.additional_requirements,
      action_plan: item.action_plan,
      status: item.status,
      reminder_type: item.reminder_type || undefined,
deadline_at: item.deadline_at ? dayjs.utc(item.deadline_at).tz(SAUDI_TZ) : null,
      reminder_before_minutes: item.reminder_before_minutes ?? 120,
      follow_up_details: item.follow_up_details || undefined,
    });
  };

const saveEdit = async () => {
    if (!editing) return;
    try {
      const values = await form.validateFields();
      
// Parse neighborhoods from comma-separated string to array
      // Handle empty string case: when user clears the field, send empty array
      let neighborhoods: string[] = [];
      if (values.neighborhoods) {
        neighborhoods = values.neighborhoods
          .split(',')
          .map((n: string) => n.trim())
          .filter((n: string) => n.length > 0);
      }
      // If field is empty/cleared, explicitly send empty array to clear in DB

      // Handle empty strings - default to "غير محدد" if missing
      const clientName = values.client_name?.trim() || 'غير محدد';
      const propertyType = values.property_type?.trim() || 'غير محدد';
      const city = values.city?.trim() || 'غير محدد';

      await updateClientRequest(editing.id, {
        client_name: clientName,
        phone_number: values.phone_number?.trim() || null,
        property_type: propertyType,
        city: city,
        neighborhoods: neighborhoods,
        budget_min: values.budget_min ?? null,
        budget_max: values.budget_max ?? null,
        area_min: values.area_min ?? null,
        area_max: values.area_max ?? null,
        additional_requirements: values.additional_requirements,
        action_plan: values.action_plan,
        status: values.status,
reminder_type: values.reminder_type ?? null,
        deadline_at: values.deadline_at ? values.deadline_at.toISOString() : null,
        reminder_before_minutes: values.reminder_before_minutes ?? 120,
        follow_up_details: values.follow_up_details || null,
      });
      message.success('تم تحديث الطلب.');
      setEditing(null);
      await load();
    } catch (e: any) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || 'تعذر تحديث الطلب.');
      } else {
        // Keep modal open if there are validation errors
        return;
      }
    }
  };

const summary = useMemo(() => {
    const activeRequests = requests.filter((r) => r.status !== 'closed').length;
    const offers = offersMap[clientKey || ''] || [];
    const activeOffers = offers.filter((o) => o.status !== 'closed').length;
    return { 
      totalRequests: requests.length, 
      activeRequests,
      totalOffers: offers.length,
      activeOffers,
    };
  }, [requests, offersMap, clientKey]);

const sourceTab = (location.state as { clientSourceTab?: 'requests' | 'offers' } | null)?.clientSourceTab;
const primaryAction = sourceTab === 'offers' || (!sourceTab && clientProfile?.client_types?.includes('offer') && !clientProfile?.client_types?.includes('request'))
  ? 'offer'
  : 'request';

const handleLogout = () => {
    setAuthToken(null);
    message.success('تم تسجيل الخروج.');
    navigate('/auth', { replace: true });
  };

  // Handle delete entire client profile
  const handleDeleteClient = async () => {
    if (!clientProfile?.id) {
      message.error('لا يوجد ملف عميل لحذفه.');
      return;
    }
    try {
      // Delete all offers for this client first
      const phoneParam = phoneFromUrlForLookup(phone);
      const rawOffers = await getClientOffersByClient(
        name.trim(),
        phoneParam,
        clientProfile.id,
      );
      const offersData = rawOffers.filter((o) => offerMatchesClientProfile(o, clientProfile));
      if (offersData.length > 0) {
        await Promise.all(offersData.map((offer) => deleteClientOffer(offer.id)));
      }
      // Delete the persistent client profile
      await deleteClientProfile(clientProfile.id);
      message.success('تم حذف ملف العميل.');
      navigate('/app?section=clients', { replace: true });
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر حذف ملف العميل.');
    }
  };

// Handle create new request with AI - associate with current client
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
// Link the request to the client profile using profile_id
      await createClientRequest({
        raw_text: values.raw_text,
        profile_id: clientProfile?.id,
        client_name: name,
        phone_number: phone || undefined,
      });
      message.success('تم تحليل الطلب وإضافته بنجاح.');
      createForm.resetFields();
      setCreateModalOpen(false);
      await load();
    } catch (e: any) {
      if (e?.errorFields) return;
      console.error('Create request error:', e);
      const errorMsg = e?.response?.data?.detail;
      if (errorMsg) {
        message.error(errorMsg);
      } else if (e?.message?.includes('Network Error')) {
        message.error('توجد مشكلة في الاتصال بالخادم. تأكد من تشغيل الخادم.');
      } else {
        message.error('تعذر تحليل الطلب. قد يكون السبب عدم توفر رصيد الذكاء الاصطناعي أو مشكلة في الاتصال.');
      }
    } finally {
      setCreating(false);
    }
  };

// Inline matching - run match for a specific request (toggle inline on card)
  const runMatch = async (item: ClientRequest) => {
    // If results already shown, hide them (toggle off)
    if (matchMap[item.id] && matchMap[item.id].length > 0) {
      setMatchMap((prev) => {
        const newMap = { ...prev };
        delete newMap[item.id];
        return newMap;
      });
      return;
    }
    
    // Otherwise, run the match and show results (toggle on)
    setLoadingMatchMap((prev) => ({ ...prev, [item.id]: true }));
    try {
      const items = await getClientRequestMatches(item.id);
      setMatchMap((prev) => ({ ...prev, [item.id]: items }));
      if (!items.length) {
        message.info('لا توجد مطابقات حالياً. تأكد من إضافة عقارات في قسم العروض.');
      }
    } catch (e: any) {
      console.error('Matching error:', e);
      const errorMsg = e?.response?.data?.detail;
      if (errorMsg) {
        message.error(errorMsg);
      } else if (e?.message?.includes('Network Error')) {
        message.error('توجد مشكلة في الاتصال بالخادم. تأكد من تشغيل الخادم الخلفي.');
      } else {
        message.error('تعذر تنفيذ المطابقة. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoadingMatchMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

// Save row (update status inline)
  const saveRow = async (item: ClientRequest, updates: Partial<ClientRequest>) => {
    setSavingMap((prev) => ({ ...prev, [item.id]: true }));
    try {
      await updateClientRequest(item.id, updates);
      message.success('تم التحديث.');
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل التحديث.');
    } finally {
      setSavingMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // Notes functions
  const openNotesModal = async (item: ClientRequest) => {
    setNotesRequestId(item.id);
    setNotesModalOpen(true);
    setLoadingNotesMap((prev) => ({ ...prev, [item.id]: true }));
    try {
      const notes = await getClientNotes(item.id);
      setNotesMap((prev) => ({ ...prev, [item.id]: notes }));
    } catch (e: any) {
      console.error('Error loading notes:', e);
    } finally {
      setLoadingNotesMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

const handleAddNote = async () => {
    const requestId = notesRequestId;
    const content = newNoteContent.trim();
    
    if (!requestId) {
      message.error('رقم الطلب غير محدد.');
      return;
    }
    if (!content) {
      message.warning('يرجى إدخال نص الملاحظة.');
      return;
    }
    
    setSavingNote(true);
    
    try {
      const newNote = await createClientNote(requestId, {
        content: content,
        color: '#cfd6cf',
      });
      
      message.success('تم إضافة الملاحظة.');
      setNewNoteContent('');
      
      // Update local state with new note
      setNotesMap((prev) => ({
        ...prev,
        [requestId]: [newNote, ...(prev[requestId] || [])],
      }));
    } catch (e: any) {
      const errorMessage = e?.response?.data?.detail || e?.message || 'فشل إضافة الملاحظة.';
      message.error(errorMessage);
    } finally {
      setSavingNote(false);
    }
  };

const handleDeleteNote = async (noteId: string) => {
    if (!notesRequestId) return;
    try {
      await deleteClientNote(notesRequestId, noteId);
      message.success('تم حذف الملاحظة.');
      // Reload notes
      const notes = await getClientNotes(notesRequestId);
      setNotesMap((prev) => ({ ...prev, [notesRequestId]: notes }));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل حذف الملاحظة.');
    }
  };

  // Offer notes functions
  const openOfferNotesModal = async (offerId: string) => {
    setOfferNotesOfferId(offerId);
    setOfferNotesModalOpen(true);
    setLoadingOfferNotesMap((prev) => ({ ...prev, [offerId]: true }));
    try {
      const notes = await getClientOfferNotes(offerId);
      setOfferNotesMap((prev) => ({ ...prev, [offerId]: notes }));
    } catch (e: any) {
      console.error('Error loading offer notes:', e);
    } finally {
      setLoadingOfferNotesMap((prev) => ({ ...prev, [offerId]: false }));
    }
  };

  const handleAddOfferNote = async () => {
    const offerId = offerNotesOfferId;
    const content = newOfferNoteContent.trim();
    
    if (!offerId) {
      message.error('رقم العرض غير محدد.');
      return;
    }
    if (!content) {
      message.warning('يرجى إدخال نص الملاحظة.');
      return;
    }
    
    setSavingOfferNote(true);
    
    try {
      const newNote = await createClientOfferNote(offerId, {
        content: content,
        color: '#cfd6cf',
      });
      
      message.success('تم إضافة الملاحظة.');
      setNewOfferNoteContent('');
      setOfferNotesMap((prev) => ({
        ...prev,
        [offerId]: [newNote, ...(prev[offerId] || [])],
      }));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل إضافة الملاحظة.');
    } finally {
      setSavingOfferNote(false);
    }
  };

const handleDeleteOfferNote = async (noteId: string) => {
    if (!offerNotesOfferId) return;
    try {
      await deleteClientOfferNote(offerNotesOfferId, noteId);
      message.success('تم حذف الملاحظة.');
      const notes = await getClientOfferNotes(offerNotesOfferId);
      setOfferNotesMap((prev) => ({ ...prev, [offerNotesOfferId]: notes }));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل حذف الملاحظة.');
    }
  };

// Update offer status
  const handleOfferStatusChange = async (offerId: string, newStatus: string) => {
    const backendStatus = newStatus === 'جديد' ? 'new' : newStatus === ' جاري ' ? 'working' : 'closed';
    try {
      await updateClientOffer(offerId, { status: backendStatus });
      message.success('تم تحديث الحالة.');
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل التحديث.');
    }
  };

// Open reminder modal for offer
  const openOfferReminderModal = (offer: any) => {
    setReminderOffer(offer);
    reminderForm.setFieldsValue({
      reminder_type: offer.reminder_type || undefined,
deadline_at: offer.deadline_at ? dayjs.utc(offer.deadline_at).tz(SAUDI_TZ) : null,
      reminder_before_minutes: offer.reminder_before_minutes ?? 120,
      follow_up_details: offer.follow_up_details || undefined,
    });
    setReminderModalOpen(true);
  };

// Save reminder for offer
  const saveOfferReminder = async () => {
    if (!reminderOffer) return;
    try {
      const values = await reminderForm.validateFields();
      await updateClientOffer(reminderOffer.id, {
        reminder_type: values.reminder_type ?? null,
        deadline_at: values.deadline_at ? values.deadline_at.toISOString() : null,
        reminder_before_minutes: values.reminder_before_minutes ?? 120,
        follow_up_details: values.follow_up_details || null,
      });
      message.success('تم حفظ المتابعة.');
      setReminderModalOpen(false);
      setReminderOffer(null);
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل حفظ المتابعة.');
    }
  };

  return (
    <ConfigProvider theme={appTheme}>
      <Layout
        className="dashboard-light"
        style={{ minHeight: '100vh', direction: 'rtl', background: palette.pageBg, padding: 14 }}
      >
        <Sider
          width={286}
          collapsible
          collapsed={siderCollapsed}
          onCollapse={(collapsed) => setSiderCollapsed(collapsed)}
          collapsedWidth={0}
          breakpoint="lg"
          trigger={null}
          style={{
            background: palette.surface,
            borderLeft: palette.glassBorder,
            borderRadius: 20,
            position: 'sticky',
            top: 14,
            alignSelf: 'flex-start',
            height: 'calc(100vh - 28px)',
            overflowY: 'auto',
            zIndex: 20,
          }}
        >
          <div style={{ padding: '18px 16px 12px', borderBottom: palette.glassBorder }}>
            <div style={{ marginBottom: 6 }}>
              <PlatformLogo width={92} />
            </div>
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>ملف العميل</Text>
          </div>
<div style={{ padding: '12px 10px 6px', display: 'grid', gap: 8 }}>
            <Button
              type="text"
              icon={<HomeOutlined />}
              style={{
                justifyContent: 'flex-start',
                color: palette.text,
                borderRadius: 10,
                background: '#edf5e9',
              }}
              onClick={() => {
                navigate('/app');
              }}
            >
              نظرة عامة
            </Button>
            <Button
              type="text"
              icon={<ApartmentOutlined />}
              style={{
                justifyContent: 'flex-start',
                color: palette.text,
                borderRadius: 10,
              }}
              onClick={() => {
                // Navigate to properties list section in dashboard
                navigate('/app?section=properties');
              }}
            >
              قائمة العقارات
            </Button>
            <Button
              type="text"
              icon={<SolutionOutlined />}
              style={{
                justifyContent: 'flex-start',
                color: palette.text,
                borderRadius: 10,
              }}
              onClick={() => {
                // Navigate to clients/requests section in dashboard
                navigate('/app?section=clients&tab=requests');
              }}
            >
              الطلبات والعملاء
            </Button>
            <Button
              type="text"
              icon={<ScheduleOutlined />}
              style={{
                justifyContent: 'flex-start',
                color: palette.text,
                borderRadius: 10,
              }}
              onClick={() => {
                navigate('/app?section=appointments');
              }}
            >
              المواعيد والمتابعة
            </Button>
          </div>
          <div style={{ marginTop: 'auto', padding: '8px 10px 14px', display: 'grid', gap: 8 }}>
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => navigate('/settings')}
              style={{ justifyContent: 'flex-start', color: palette.text, borderRadius: 10 }}
            >
              الإعدادات
            </Button>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ justifyContent: 'flex-start', color: '#dc2626', borderRadius: 10 }}
            >
              تسجيل الخروج
            </Button>
          </div>
        </Sider>
<Layout style={{ background: 'transparent' }}>
          <Header
            style={{
              background: palette.surface,
              padding: '0 18px',
              height: 82,
              lineHeight: '82px',
              border: palette.glassBorder,
              borderRadius: 18,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 82,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="text"
                  onClick={() => setSiderCollapsed((prev) => !prev)}
                  icon={
                    siderCollapsed ? (
                      <MenuUnfoldOutlined style={{ color: palette.text }} />
                    ) : (
                      <MenuFoldOutlined style={{ color: palette.text }} />
                    )
                  }
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    border: palette.glassBorder,
                    background: '#fff',
                  }}
                  aria-label="إظهار أو إخفاء القائمة الجانبية"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <Title
                    level={3}
                    style={{
                      color: palette.text,
                      margin: 0,
                      whiteSpace: 'nowrap',
                      fontSize: 30,
                      lineHeight: 1.15,
                    }}
                  >
                    ملف العميل
                  </Title>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                    إدارة طلبات ومتابعة العميل
                  </Text>
                </div>
              </div>
              <Button icon={<ArrowRightOutlined />} onClick={() => navigate(-1)}>
                
              </Button>
            </div>
          </Header>
          <Content style={{ margin: '0 4px 4px' }}>
<Card size="small" style={{ marginBottom: 12, borderRadius: 14, maxWidth: 500 }}>
              <Space wrap>
                <Avatar icon={<UserOutlined />} />
                <Text strong>{name}</Text>
                <Tag>{phone || 'غير متوفر'}</Tag>
{summary.totalRequests > 0 && (
                  <>
                    <Tag color="green">إجمالي الطلبات: {summary.totalRequests}</Tag>
                    <Tag color="orange">طلبات نشطة: {summary.activeRequests}</Tag>
                  </>
                )}
                {summary.totalOffers > 0 && (
                  <>
                    <Tag color="blue">إجمالي العروض: {summary.totalOffers}</Tag>
                    <Tag color="cyan">عروض نشطة: {summary.activeOffers}</Tag>
                  </>
                )}
<Button
                  type="primary"
                  
                  size="small"
                  onClick={() => {
                    if (primaryAction === 'offer') {
                      setOffersModalOpen(true);
                    } else {
                      setCreateModalOpen(true);
                    }
                  }}
                  style={{ background: '#1677ff' }}
                >
                  {primaryAction === 'offer' ? 'إضافة عرض' : 'إضافة طلب'}
                </Button>
                {clientProfile?.id && (
                  <Popconfirm
                    title="حذف ملف العميل؟"
                    description="سيتم حذف العميل وجميع عروضه وطلباته."
                    okText="حذف"
                    cancelText="إلغاء"
                    okButtonProps={{ danger: true }}
                    onConfirm={handleDeleteClient}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                       
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </Card>

<div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', alignItems: 'stretch' }}>
              {requests.map((item) => (
<Card
                  key={item.id}
                  size="small"
                  loading={loading}
                  style={{ borderRadius: 12, border: '1px solid #e5e7eb', height: '100%' }}
                  styles={{
                    body: { display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 12px' },
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* تاريخ الإنشاء في أعلى الكرت بخط صغير */}
                  <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
                    تاريخ الإنشاء: {item.created_at ? dayjs(item.created_at).format('YYYY/MM/DD') : 'غير محدد'}
                  </Text>
                  <Space wrap style={{ marginBottom: 8 }}>
                    <Select
                      value={item.status}
                      style={{ width: 140 }}
                      onChange={(val) => saveRow(item, { status: val as ClientRequest['status'] })}
                      options={[
                        { value: 'new', label: 'جديد' },
                        { value: 'searching', label: 'جاري البحث' },
                        { value: 'closed', label: 'تم الإغلاق' },
                      ]}
                      loading={!!savingMap[item.id]}
                    />
<Text strong style={{ textAlign: 'right' }}>{item.property_type} - {item.city}</Text>
                    {item.deadline_at && (
                      <Tag color={getDeadlineTagColor(item.deadline_at)}>
                        {formatDeadlineDisplay(item.deadline_at)}
                      </Tag>
                    )}
                    {item.reminder_type ? <Tag>{reminderTypeLabel[item.reminder_type]}</Tag> : null}
                  </Space>

{(item.budget_min || item.budget_max) && (
                    <Paragraph style={{ marginBottom: 4, fontSize: 12, textAlign: 'right' }}>
                      <Text type="secondary">الميزانية: </Text>
                      <Text>{formatBudget(item.budget_min, item.budget_max)}</Text>
                    </Paragraph>
                  )}
                  {(item.area_min || item.area_max) && (
                    <Paragraph style={{ marginBottom: 4, fontSize: 12, textAlign: 'right' }}>
                      <Text type="secondary">المساحة: </Text>
                      <Text>{formatArea(item.area_min, item.area_max)}</Text>
                    </Paragraph>
                  )}

                  {item.neighborhoods && item.neighborhoods.length > 0 && (
                    <Paragraph style={{ marginBottom: 4, fontSize: 12, textAlign: 'right' }}>
                      <Text type="secondary">الأحياء: </Text>
                      <Text>{item.neighborhoods.join(', ')}</Text>
                    </Paragraph>
                  )}

                  <Paragraph style={{ marginBottom: 8, textAlign: 'right' }}>
                    <Text strong>خطة العمل: </Text>
                    {item.action_plan || 'غير محدد'}
                  </Paragraph>

{item.additional_requirements && (
                    <Paragraph style={{ marginBottom: 8, fontSize: 12, textAlign: 'right' }}>
                      <Text type="secondary">متطلبات إضافية: </Text>
                      {item.additional_requirements}
                    </Paragraph>
                  )}
                  </div>

                  {/* Buttons container - fixed at bottom */}
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                    <Space wrap style={{ marginBottom: 8 }}>
                      <Button 
                        size="small" 
                        type="primary"
                        
                        onClick={() => runMatch(item)}
                        loading={!!loadingMatchMap[item.id]}
                      >
                        المطابقة
                      </Button>
                      <Button 
                        size="small" 
                        
                        onClick={() => openNotesModal(item)}
                      >
                        ملاحظات
                      </Button>
                      <Button size="small" onClick={() => openEdit(item)}>تعديل</Button>
                      <Popconfirm
                        title="حذف الطلب؟"
                        okText="حذف"
                        cancelText="إلغاء"
                        onConfirm={async () => {
                          try {
                            await deleteClientRequest(item.id);
                            message.success('تم حذف الطلب.');
                            await load();
                          } catch {
                            message.error('تعذر حذف الطلب.');
                          }
                        }}
                      >
                        <Button size="small" danger>حذف</Button>
                      </Popconfirm>
                    </Space>

                  {/* Inline matching results */}
                  {matchMap[item.id] && matchMap[item.id].length > 0 && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      {(matchMap[item.id] || []).slice(0, 5).map((p, idx) => {
                        // Get match level from property (defaults to 4 if not set)
                        const matchLevel = p.match_level ?? p._match_level ?? 4;
                        const matchLevelLabels: Record<number, { label: string; color: string }> = {
                          1: { label: 'تطابق تام', color: 'green' },
                          2: { label: 'تطابق قوي', color: 'blue' },
                          3: { label: 'تطابق متوسط', color: 'orange' },
                          4: { label: 'تطابق ضعيف', color: 'default' },
                        };
                        const levelInfo = matchLevelLabels[matchLevel] || { label: 'تطابق ضعيف', color: 'default' };
                        
                        // Copy share link only
                        const handleShareMatch = async (e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (!p.id) {
                            message.warning('العقد ليس له رابط مشاركة.');
                            return;
                          }
                          const url = `${window.location.origin}/share/${p.id}`;
                          try {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              await navigator.clipboard.writeText(url);
                              message.success('تم نسخ الرابط بنجاح');
                            } else {
                              const textArea = document.createElement('textarea');
                              textArea.value = url;
                              document.body.appendChild(textArea);
                              textArea.select();
                              document.execCommand('copy');
                              document.body.removeChild(textArea);
                              message.success('تم نسخ الرابط بنجاح');
                            }
                          } catch {
                            message.error('تعذر نسخ الرابط');
                          }
                        };
                        
                        return (
                          <Card 
                            key={`${p.id || 'match'}-${idx}`} 
                            size="small" 
                            style={{ borderRadius: 10 }}
                            styles={{ body: { padding: 8 } }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
<div style={{ width: 64, height: 48, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                                {p.images && p.images.length > 0 ? (
                                  <img
                                    src={resolveMediaUrl(p.images[0])}
                                    alt="match"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  />
                                ) : null}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'grid', gap: 3 }}>
                                  <Text strong ellipsis style={{ fontSize: 12 }}>{p.property_type} - {p.neighborhood}</Text>
                                  <Text type="secondary" ellipsis style={{ fontSize: 11 }}>{p.city} | {p.price?.toLocaleString('ar-SA')} ر.س</Text>
                                  {levelInfo && <Tag color={levelInfo.color} style={{ margin: 0, fontSize: 10, width: 'fit-content' }}>{levelInfo.label}</Tag>}
                                </div>
                              </div>
                              <Button 
                                size="small" 
                                type="primary"
                                icon={<ShareAltOutlined />}
                                onClick={handleShareMatch}
                                style={{ height: 26, width: 32, padding: 0, flexShrink: 0, background: '#3f7d3c' }}
                                disabled={!p.id}
                                title="مشاركة"
                              />
                            </div>
                          </Card>
                        );
})}
                    </div>
                  )}
                  </div>
                </Card>
              ))}
            </div>

{/* Client Offers Section - Grid Layout like PropertyList */}
            {offersMap[clientKey || ''] && offersMap[clientKey || ''].length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  العروض المقدمة ({offersMap[clientKey || ''].length})
                </Text>
                <List
                  grid={{ gutter: 12, xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 4 }}
                  dataSource={offersMap[clientKey || '']}
                  renderItem={(offer: any) => (
                    <List.Item>
<Card
                        title={`${offer.property?.property_type || 'عقار'} في ${offer.property?.neighborhood || 'غير محدد'}`}
                        variant="borderless"
                        style={{
                          boxShadow: '0 10px 24px rgba(41, 66, 49, 0.11)',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 380,
                          borderRadius: 16,
                          border: '1px solid #e2e7dd',
                          background: '#fff',
                        }}
                        styles={{
                          body: {
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                            padding: 14,
                            overflow: 'hidden',
                          },
                        }}
                      >
<div style={{ marginBottom: 10, position: 'relative', borderRadius: 10, overflow: 'hidden', height: 130, flexShrink: 0 }}>
                          {offer.property?.images && offer.property.images.length > 0 ? (
                            <img
                              src={resolveMediaUrl(offer.property.images[0])}
                              alt="property"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: '#d7ddd4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Text type="secondary">لا توجد صورة</Text>
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {offer.property?.city}
                          </Text>
                          <div style={{ marginTop: 4 }}>
                            <Text strong style={{ fontSize: 18, color: '#16a34a' }}>
                              {offer.property?.price?.toLocaleString('ar-SA')} ر.س
                            </Text>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              المساحة: {offer.property?.area?.toLocaleString('ar-SA')} م²
                            </Text>
                          </div>
<div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {offer.deadline_at && (
                              <Tag color={getDeadlineTagColor(offer.deadline_at)}>
                                {formatDeadlineDisplay(offer.deadline_at)}
                              </Tag>
                            )}
{offer.reminder_type ? <Tag>{getReminderTypeLabel(offer.reminder_type)}</Tag> : null}
                          </div>
<Tag color={getOfferStatusColor(mapOfferStatus(offer.status))} style={{ fontSize: 11, marginTop: 'auto', width: 'fit-content' }}>
                            <Select value={mapOfferStatus(offer.status)} style={{ width: 85 }} size="small" variant="borderless" onChange={(val) => handleOfferStatusChange(offer.id, val as string)} options={[{ value: 'جديد', label: 'جديد' }, { value: ' جاري ', label: 'جاري' }, { value: 'اغلاق', label: 'مغلق' }]} />
                          </Tag>
                        </div>
<div style={{ paddingTop: 8, borderTop: `1px solid ${palette.glassBorder}`, marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
                          <Space size={[8, 8]} wrap>
                            <Button
                              size="middle"
                              icon={<ClockCircleOutlined />}
                              onClick={() => openOfferReminderModal(offer)}
                              style={{ color: '#8c8c8c', minWidth: 40 }}
                              title="إضافة متابعة"
                            />
                            <Button
                              size="middle"
                              icon={<EditOutlined />}
                              onClick={() => openOfferNotesModal(offer.id)}
                              style={{ color: '#faad14', minWidth: 40 }}
                              title="ملاحظات"
                            />
                            <Button
                              size="middle"
                              icon={<ShareAltOutlined />}
                              onClick={async () => {
                                if (offer.property?.id) {
                                  const url = `${window.location.origin}/share/${offer.property.id}`;
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    message.success('تم نسخ الرابط');
                                  } catch {
                                    message.error('تعذر نسخ الرابط');
                                  }
                                }
                              }}
                              style={{ color: '#3f7d3c', minWidth: 40 }}
                              disabled={!offer.property?.id}
                              title="مشاركة"
                            />
                            <Popconfirm
                              title="حذف هذا العرض؟"
                              okText="حذف"
                              cancelText="إلغاء"
                              onConfirm={async () => {
                                try {
                                  await deleteClientOffer(offer.id);
                                  message.success('تم حذف العرض.');
                                  await load();
                                } catch {
                                  message.error('تعذر حذف العرض.');
                                }
                              }}
                            >
                              <Button size="middle" icon={<DeleteOutlined />} danger style={{ minWidth: 40 }} />
                            </Popconfirm>
                          </Space>
                        </div>
                      </Card>
                    </List.Item>
                  )}
                />
              </div>
            )}

<Modal
              open={!!editing}
              title="تعديل بيانات طلب العميل"
              onCancel={() => setEditing(null)}
              onOk={saveEdit}
              okText="حفظ"
              cancelText="إلغاء"
              style={{ direction: 'rtl' }}
            >
<Form form={form} layout="vertical" dir="rtl">
<Form.Item name="client_name" label="اسم العميل"><Input style={{ textAlign: 'right', direction: 'rtl' }} /></Form.Item>
                <Form.Item name="phone_number" label="رقم الجوال"><Input style={{ textAlign: 'right', direction: 'rtl' }} /></Form.Item>
                <Form.Item name="property_type" label="نوع العقار"><Input style={{ textAlign: 'right', direction: 'rtl' }} /></Form.Item>
                <Form.Item name="city" label="المدينة"><Input style={{ textAlign: 'right', direction: 'rtl' }} /></Form.Item>
<Form.Item name="neighborhoods" label="الأحياء (افصل بفاصلة)">
                  <Input placeholder="حي الملقا, حي العليا" style={{ textAlign: 'right', direction: 'rtl' }} />
                </Form.Item>
<Form.Item name="budget_min" label="الميزانية من"><InputNumber style={{ width: '100%', textAlign: 'right', direction: 'rtl' }} /></Form.Item>
                <Form.Item name="budget_max" label="الميزانية إلى"><InputNumber style={{ width: '100%', textAlign: 'right', direction: 'rtl' }} /></Form.Item>
                <Form.Item name="area_min" label="المساحة من"><InputNumber style={{ width: '100%', textAlign: 'right', direction: 'rtl' }} /></Form.Item>
                <Form.Item name="area_max" label="المساحة إلى"><InputNumber style={{ width: '100%', textAlign: 'right', direction: 'rtl' }} /></Form.Item>
<Form.Item name="additional_requirements" label="متطلبات إضافية">
                  <Input.TextArea rows={3} style={{ textAlign: 'right', direction: 'rtl' }} />
                </Form.Item>
<Form.Item name="action_plan" label="خطة العمل">
                  <Input.TextArea rows={3} style={{ textAlign: 'right', direction: 'rtl' }} />
                </Form.Item>
<Form.Item name="follow_up_details" label="تفاصيل المتابعة - ما الذي سأقوم به مع العميل">
                  <Input.TextArea rows={2} placeholder="اكتب ما ستقوم به مع العميل..." style={{ textAlign: 'right', direction: 'rtl' }} />
                </Form.Item>
                <Form.Item name="status" label="الحالة">
                  <Select
                    options={[
                      { value: 'new', label: 'جديد' },
                      { value: 'searching', label: 'جاري البحث' },
                      { value: 'closed', label: 'تم الإغلاق' },
                    ]}
                  />
                </Form.Item>
<Form.Item name="reminder_type" label="نوع التذكير">
                  <Select
                    allowClear
                    options={[
                      { value: 'follow_up', label: 'متابعة - للتواصل مع العميل' },
                      { value: 'viewing', label: 'معاينة - عقد جلسة معاينة' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="deadline_at" label="موعد نهائي">
                  <DatePicker
                    showTime={{ format: 'h:mm A', use12Hours: true }}
                    format="YYYY-MM-DD h:mm A"
                    style={{ width: '100%' }}
                    placeholder="اختر التاريخ والوقت"
                  />
                </Form.Item>
<Form.Item name="reminder_before_minutes" label="التذكير قبل (بالدقائق)">
                  <InputNumber
                    style={{ width: '100%', textAlign: 'right', direction: 'rtl' }}
                    min={15}
                    max={10080}
                    placeholder="افتراضي: 120 دقيقة (ساعتان)"
                  />
                </Form.Item>
              </Form>
            </Modal>

{/* Modal for client notes */}
            <Modal
              open={notesModalOpen}
              title="ملاحظات الطلب"
              onCancel={() => {
                setNotesModalOpen(false);
                setNotesRequestId(null);
                setNewNoteContent('');
              }}
              footer={[
                <Button key="close" type="primary" onClick={() => {
                  setNotesModalOpen(false);
                  setNotesRequestId(null);
                  setNewNoteContent('');
                }}>
                  إغلاق
                </Button>,
              ]}
              width={500}
              style={{ direction: 'rtl' }}
            >
              {/* Add new note form */}
<div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>إضافة ملاحظة جديدة</Text>
<Input.TextArea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows={3}
                  placeholder="اكتب ملاحظتك هنا..."
                  style={{ marginBottom: 8, textAlign: 'right', direction: 'rtl' }}
                />
                <Button
                  type="primary"
                  size="small"
                  loading={savingNote}
                  onClick={handleAddNote}
                  disabled={!newNoteContent.trim()}
                  style={{ background: '#3f7d3c' }}
                >
                  إضافة
                </Button>
              </div>

              {/* Notes list */}
              <div style={{ display: 'grid', gap: 8 }}>
                {loadingNotesMap[notesRequestId || ''] ? (
                  <Text>جاري تحميل الملاحظات...</Text>
                ) : (notesMap[notesRequestId || ''] || []).length === 0 ? (
                  <Text type="secondary">لا توجد ملاحظات لهذا الطلب.</Text>
                ) : (
                  (notesMap[notesRequestId || ''] || []).map((note) => (
                    <div
                      key={note.id}
style={{
                        padding: 12,
                        background: note.color || '#f9fafb',
                        borderRadius: 8,
                        position: 'relative',
                        textAlign: 'right',
                        direction: 'rtl',
                      }}
                    >
<Text style={{ display: 'block', marginBottom: 4, textAlign: 'right' }}>{note.content}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {note.author_name || 'غير محدد'}{note.author_role ? (` (${note.author_role === 'owner' ? 'مالك' : note.author_role === 'manager' ? 'مدير' : 'موظف'})`) : ''} | {dayjs(note.created_at).format('YYYY/MM/DD HH:mm')}
                      </Text>
                      <Popconfirm
                        title="حذف هذه الملاحظة؟"
                        onConfirm={() => handleDeleteNote(note.id)}
                        okText="حذف"
                        cancelText="إلغاء"
                      >
                        <Button 
                          size="small" 
                          danger 
                          type="text"
style={{ position: 'absolute', top: 8, left: 8 }}
                        icon={<CloseOutlined />} />
                      </Popconfirm>
                    </div>
                  ))
                )}
              </div>
            </Modal>

{/* Modal for creating new request with AI */}
            <Modal
              open={createModalOpen}
              title="إضافة طلب جديد بالذكاء الاصطناعي"
              onCancel={() => {
                setCreateModalOpen(false);
                createForm.resetFields();
              }}
              footer={[
                <Button key="cancel" onClick={() => {
                  setCreateModalOpen(false);
                  createForm.resetFields();
                }}>
                  إلغاء
                </Button>,
                <Button key="submit" type="primary" loading={creating} onClick={handleCreate}>
                  إضافة وتحليل بالذكاء الاصطناعي
                </Button>,
              ]}
              style={{ direction: 'rtl' }}
            >
<Form form={createForm} layout="vertical" dir="rtl">
                <Form.Item
                  name="raw_text"
                  label="نص الطلب"
                  rules={[{ required: true, message: 'الرجاء إدخال نص الطلب' }]}
                >
<Input.TextArea
                    rows={6}
                    placeholder="مثال: ابحث عن شقة في الرياض حي الملقا الميزانية 500,000 إلى 800,000 ريال المساحة 150 إلى 200 متر"
                    style={{ textAlign: 'right', direction: 'rtl' }}
                  />
                </Form.Item>
<Text type="secondary" style={{ fontSize: 12 }}>
                  سيقوم الذكاء الاصطناعي بتحليل الطلب واستخراج جميع المعلومات تلقائياً.
                </Text>
              </Form>
            </Modal>

{/* Modal for adding offers to client */}
            <Modal
              open={offersModalOpen}
              title="إضافة عروض للعميل"
              onCancel={() => setOffersModalOpen(false)}
              footer={[
                <Button key="close" type="primary" onClick={() => setOffersModalOpen(false)}>
                  إغلاق
                </Button>,
              ]}
              width={600}
              style={{ direction: 'rtl' }}
            >
              <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {allProperties.length === 0 ? (
                  <Text type="secondary">لا توجد عقارات مضافة. أضف عقارات من قسم العروض أولاً.</Text>
                ) : (
                  allProperties.map((property) => (
                    <Card
                      key={property.id}
                      size="small"
                      style={{ borderRadius: 10, cursor: 'pointer' }}
                      onClick={async () => {
                        try {
await createClientOffer({
                            profile_id: clientProfile?.id,
                            client_name: name,
                            phone_number: phone || null,
                            property_id: property.id!,
                          });
                          message.success('تم ربط العرض بالعميل.');
                          setOffersModalOpen(false);
                        } catch (e: any) {
                          message.error(e?.response?.data?.detail || 'فشل إضافة العرض.');
                        }
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
<div
                          style={{
                            width: 120,
                            height: 90,
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: '#f1f5f9',
                            flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                          }}
                        >
                          {property.images && property.images.length > 0 ? (
                            <img
                              src={resolveMediaUrl(property.images[0])}
                              alt="property"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : null}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong>
                            {property.property_type} - {property.neighborhood}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            {property.city} | {property.price?.toLocaleString('ar-SA')} ر.س
                          </Text>
                        </div>
                        <Button size="small" type="primary" style={{ background: '#3f7d3c' }}>
                          إضافة
                        </Button>
                      </div>
                    </Card>
                  ))
)}
              </div>
            </Modal>

{/* Modal for offer reminder */}
            <Modal
              open={reminderModalOpen}
              title="إضافة متابعة للعرض"
              onCancel={() => {
                setReminderModalOpen(false);
                setReminderOffer(null);
              }}
              onOk={saveOfferReminder}
              okText="حفظ"
              cancelText="إلغاء"
              style={{ direction: 'rtl' }}
            >
<Form form={reminderForm} layout="vertical" dir="rtl">
                <Form.Item name="reminder_type" label="نوع المتابعة">
                  <Select
                    allowClear
                    options={[
                      { value: 'follow_up', label: 'متابعة - للتواصل مع العميل' },
                      { value: 'viewing', label: 'معاينة - عقد جلسة معاينة' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="deadline_at" label="موعد المتابعة">
                  <DatePicker
                    showTime={{ format: 'h:mm A', use12Hours: true }}
                    format="YYYY-MM-DD h:mm A"
                    style={{ width: '100%' }}
                    placeholder="اختر التاريخ والوقت"
                  />
                </Form.Item>
<Form.Item name="follow_up_details" label="تفاصيل المتابعة - ما الذي سأقوم به مع العميل">
                  <Input.TextArea rows={2} placeholder="اكتب ما ستقوم به مع العميل..." style={{ textAlign: 'right', direction: 'rtl' }} />
                </Form.Item>
                <Form.Item name="reminder_before_minutes" label="التذكير قبل (بالدقائق)">
                  <InputNumber
                    style={{ width: '100%', textAlign: 'right', direction: 'rtl' }}
                    min={15}
                    max={10080}
                    placeholder="افتراضي: 120 دقيقة (ساعتان)"
                  />
                </Form.Item>
              </Form>
            </Modal>

            {/* Modal for offer notes */}
            <Modal
              open={offerNotesModalOpen}
              title="ملاحظات العرض"
              onCancel={() => {
                setOfferNotesModalOpen(false);
                setOfferNotesOfferId(null);
                setNewOfferNoteContent('');
              }}
              footer={[
                <Button key="close" type="primary" onClick={() => {
                  setOfferNotesModalOpen(false);
                  setOfferNotesOfferId(null);
                  setNewOfferNoteContent('');
                }}>
                  إغلاق
                </Button>,
              ]}
              width={500}
              style={{ direction: 'rtl' }}
            >
              {/* Add new note form */}
              <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>إضافة ملاحظة جديدة</Text>
                <Input.TextArea
                  value={newOfferNoteContent}
                  onChange={(e) => setNewOfferNoteContent(e.target.value)}
                  rows={3}
                  placeholder="اكتب ملاحظتك هنا..."
                  style={{ marginBottom: 8, textAlign: 'right', direction: 'rtl' }}
                />
                <Button
                  type="primary"
                  size="small"
                  loading={savingOfferNote}
                  onClick={handleAddOfferNote}
                  disabled={!newOfferNoteContent.trim()}
                  style={{ background: '#3f7d3c' }}
                >
                  إضافة
                </Button>
              </div>

              {/* Notes list */}
              <div style={{ display: 'grid', gap: 8 }}>
                {loadingOfferNotesMap[offerNotesOfferId || ''] ? (
                  <Text>جاري تحميل الملاحظات...</Text>
                ) : (offerNotesMap[offerNotesOfferId || ''] || []).length === 0 ? (
                  <Text type="secondary">لا توجد ملاحظات لهذا العرض.</Text>
                ) : (
                  (offerNotesMap[offerNotesOfferId || ''] || []).map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: 12,
                        background: note.color || '#f9fafb',
                        borderRadius: 8,
                        position: 'relative',
                        textAlign: 'right',
                        direction: 'rtl',
                      }}
                    >
                      <Text style={{ display: 'block', marginBottom: 4, textAlign: 'right' }}>{note.content}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {note.author_name || 'غير محدد'}{note.author_role ? (` (${note.author_role === 'owner' ? 'مالك' : note.author_role === 'manager' ? 'مدير' : 'موظف'})`) : ''} | {dayjs(note.created_at).format('YYYY/MM/DD HH:mm')}
                      </Text>
                      <Popconfirm
                        title="حذف هذه الملاحظة؟"
                        onConfirm={() => handleDeleteOfferNote(note.id)}
                        okText="حذف"
                        cancelText="إلغاء"
                      >
                        <Button 
                          size="small" 
                          danger 
                          type="text"
                          style={{ position: 'absolute', top: 8, left: 8 }}
                        icon={<CloseOutlined />} />
                      </Popconfirm>
                    </div>
                  ))
                )}
              </div>
            </Modal>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default ClientProfilePage;
