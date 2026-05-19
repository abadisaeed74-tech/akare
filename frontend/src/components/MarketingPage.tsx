import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Drawer, Empty, Input, Progress, Row, Select, Skeleton, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleDollarSign, Gauge, Timer, UserRound, UsersRound } from 'lucide-react';
import {
  type MarketingAnalytics,
  type MarketingLandingPageDetails,
  type MarketingLandingPageStat,
  type MarketingLead,
  type MarketingOverview,
  convertMarketingLead,
  getSettingsOverview,
  getMarketingAnalytics,
  getMarketingLandingPageDetails,
  getMarketingLandingPages,
  getMarketingLeads,
  getMarketingOverview,
  updateMarketingLead,
  updateMarketingLeadStatus,
} from '../services/api';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const { Text } = Typography;

interface MarketingPageProps {
  onOpenLanding?: (propertyId: string) => void;
}

const sourceLabel: Record<string, string> = {
  tiktok: 'تيك توك',
  snapchat: 'سناب شات',
  instagram: 'انستقرام',
  youtube: 'يوتيوب',
  google: 'جوجل',
  direct: 'مباشر',
  other: 'مصدر غير معروف',
  unknown: 'مصدر غير معروف',
};

const ctaLabel: Record<string, string> = {
  whatsapp: 'واتساب',
  call: 'اتصال',
  visit_request: 'طلب معاينة',
  location_request: 'طلب الموقع',
  similar_request: 'عروض مشابهة',
  primary: 'CTA رئيسي',
  visit: 'طلب معاينة',
  location: 'طلب الموقع',
  similar: 'عروض مشابهة',
  general: 'عام',
  booking: 'حجز',
};

const activityLabel: Record<string, string> = {
  landing_visit: 'زيارة صفحة الهبوط',
  cta_whatsapp_click: 'ضغط واتساب',
  cta_call_click: 'ضغط اتصال',
  cta_primary_click: 'ضغط CTA رئيسي',
  video_view: 'مشاهدة فيديو',
  video_complete: 'إكمال الفيديو',
  form_view: 'فتح الفورم',
  form_submit: 'إرسال الفورم',
  session_end: 'إنهاء الجلسة',
};

const normalizeSourceKey = (value?: string): string => {
  const source = (value || '').toLowerCase();
  if (source.includes('tiktok')) return 'tiktok';
  if (source.includes('snap')) return 'snapchat';
  if (source.includes('insta')) return 'instagram';
  if (source.includes('youtu')) return 'youtube';
  if (source.includes('google')) return 'google';
  if (source.includes('direct') || source.includes('(none)') || source.includes('(direct)')) return 'direct';
  if (!source) return 'direct';
  return 'unknown';
};

const chartPalette = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#14b8a6', '#64748b'];
const statCardStyle: React.CSSProperties = { borderRadius: 12 };
const statCardBodyStyle: React.CSSProperties = { padding: 12 };

const mockOverviewData: MarketingOverview = {
  leads_today: 7,
  leads_month: 86,
  conversion_rate: 12.8,
  clicks_count: 341,
  visits_count: 1280,
  unique_visitors_count: 864,
  average_session_duration_seconds: 122,
  top_source: 'tiktok',
  source_breakdown: {
    tiktok: 38,
    snapchat: 22,
    instagram: 18,
    direct: 8,
  },
  top_properties: [
    { property_id: 'PROP-101', leads: 19 },
    { property_id: 'PROP-205', leads: 14 },
    { property_id: 'PROP-078', leads: 11 },
  ],
};

const mockLeadsData: MarketingLead[] = [
  {
    id: 'mock-1',
    owner_id: 'mock-owner',
    property_id: 'PROP-101',
    name: 'سارة العتيبي',
    phone: '0501234567',
    notes: 'مهتمة بحجز معاينة هذا الأسبوع',
    request_type: 'visit',
    ad_source: 'tiktok',
    source_page: 'landing_page',
    status: 'new',
    visit_count: 3,
    clicked_whatsapp: true,
    viewed_video: true,
    watched_video: true,
    completed_video: true,
    submitted_form: true,
    session_duration_seconds: 184,
    session_started_at: new Date(Date.now() - 220000).toISOString(),
    session_last_activity_at: new Date(Date.now() - 50000).toISOString(),
    browser_name: 'chrome',
    device_type: 'mobile',
    referrer: 'https://www.tiktok.com/',
    landing_url: 'https://example.com/ad/PROP-101',
    converted_to_client: false,
    converted_client_type: null,
    converted_client_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mock-2',
    owner_id: 'mock-owner',
    property_id: 'PROP-205',
    name: 'محمد القحطاني',
    phone: '0559876543',
    notes: 'طلب إرسال موقع العقار',
    request_type: 'location',
    ad_source: 'snapchat',
    source_page: 'landing_page',
    status: 'contacted',
    visit_count: 2,
    clicked_whatsapp: false,
    viewed_video: true,
    watched_video: true,
    completed_video: false,
    submitted_form: true,
    session_duration_seconds: 96,
    session_started_at: new Date(Date.now() - 160000).toISOString(),
    session_last_activity_at: new Date(Date.now() - 42000).toISOString(),
    browser_name: 'safari',
    device_type: 'mobile',
    referrer: 'https://www.snapchat.com/',
    landing_url: 'https://example.com/ad/PROP-205',
    converted_to_client: false,
    converted_client_type: null,
    converted_client_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockLandingPagesData: MarketingLandingPageStat[] = [
  { property_id: 'PROP-101', leads_count: 19, visits_count: 220, unique_visitors_count: 171, conversion_rate: 8.64, top_source: 'tiktok' },
  { property_id: 'PROP-205', leads_count: 14, visits_count: 180, unique_visitors_count: 132, conversion_rate: 7.77, top_source: 'snapchat' },
  { property_id: 'PROP-078', leads_count: 11, visits_count: 150, unique_visitors_count: 118, conversion_rate: 7.33, top_source: 'instagram' },
];

const mockLandingDetailsData: MarketingLandingPageDetails = {
  property_id: 'PROP-101',
  visits_count: 220,
  unique_visitors_count: 171,
  average_session_duration_seconds: 134,
  leads_count: 19,
  conversion_rate: 8.64,
  traffic_sources: [
    { source: 'tiktok', visits: 96, clicks: 48, leads: 12, conversion_rate: 12.5 },
    { source: 'snapchat', visits: 54, clicks: 21, leads: 4, conversion_rate: 7.41 },
    { source: 'instagram', visits: 38, clicks: 12, leads: 2, conversion_rate: 5.26 },
    { source: 'google', visits: 18, clicks: 8, leads: 1, conversion_rate: 5.56 },
    { source: 'direct', visits: 14, clicks: 4, leads: 0, conversion_rate: 0 },
  ],
  cta_breakdown: {
    whatsapp_clicks: 48,
    call_clicks: 15,
    video_views: 64,
    form_views: 20,
    form_submits: 8,
  },
  funnel: [
    { label: 'زيارات', value: 120 },
    { label: 'ضغط واتساب', value: 48 },
    { label: 'فتح الفورم', value: 20 },
    { label: 'Leads', value: 8 },
  ],
  session_activity: [
    { source: 'tiktok', activity: 'cta_whatsapp_click', session_duration_seconds: 189, happened_at: new Date().toISOString(), device_type: 'mobile' },
    { source: 'snapchat', activity: 'form_view', session_duration_seconds: 121, happened_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(), device_type: 'mobile' },
    { source: 'google', activity: 'landing_visit', session_duration_seconds: 77, happened_at: new Date(Date.now() - 1000 * 60 * 13).toISOString(), device_type: 'desktop' },
  ],
};

const mockAnalyticsData: MarketingAnalytics = {
  daily_leads: [
    { period: '2026-05-08', count: 4 },
    { period: '2026-05-09', count: 6 },
    { period: '2026-05-10', count: 3 },
    { period: '2026-05-11', count: 8 },
    { period: '2026-05-12', count: 7 },
    { period: '2026-05-13', count: 5 },
  ],
  weekly_leads: [
    { period: '2026-W17', count: 28 },
    { period: '2026-W18', count: 35 },
    { period: '2026-W19', count: 41 },
  ],
  monthly_leads: [
    { period: '2026-03', count: 74 },
    { period: '2026-04', count: 81 },
    { period: '2026-05', count: 86 },
  ],
  source_breakdown: {
    tiktok: 38,
    snapchat: 22,
    instagram: 18,
    direct: 8,
  },
  cta_breakdown: {
    visit: 29,
    location: 22,
    similar: 18,
    general: 17,
  },
};

const MarketingPage: React.FC<MarketingPageProps> = ({ onOpenLanding }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [landingPages, setLandingPages] = useState<MarketingLandingPageStat[]>([]);
  const [analytics, setAnalytics] = useState<MarketingAnalytics | null>(null);
  const [starterPlanRestricted, setStarterPlanRestricted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<MarketingLead | null>(null);
  const [leadDetailsOpen, setLeadDetailsOpen] = useState(false);
  const [leadNotesDraft, setLeadNotesDraft] = useState('');
  const [landingDetailsOpen, setLandingDetailsOpen] = useState(false);
  const [landingDetailsLoading, setLandingDetailsLoading] = useState(false);
  const [landingDetails, setLandingDetails] = useState<MarketingLandingPageDetails | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let isStarterPlan = false;
      try {
        const settingsOverview = await getSettingsOverview();
        const planKey = String(settingsOverview?.company?.plan_key || '').toLowerCase();
        isStarterPlan = planKey === 'starter';
      } catch {
        // Keep marketing page functional even if settings call fails.
        isStarterPlan = false;
      }
      setStarterPlanRestricted(isStarterPlan);

      if (isStarterPlan) {
        setOverview(null);
        setLeads([]);
        setLandingPages([]);
        setAnalytics(null);
        return;
      }

      const [overviewData, leadsData, pagesData, analyticsData] = await Promise.all([
        getMarketingOverview(),
        getMarketingLeads(),
        getMarketingLandingPages(),
        getMarketingAnalytics(),
      ]);
      setOverview(overviewData);
      setLeads(leadsData);
      setLandingPages(pagesData);
      setAnalytics(analyticsData);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'تعذر تحميل بيانات التسويق.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const hasRealOverviewData =
    !!overview &&
    (
      overview.leads_today > 0 ||
      overview.leads_month > 0 ||
      overview.clicks_count > 0 ||
      overview.visits_count > 0 ||
      Object.keys(overview.source_breakdown || {}).length > 0 ||
      (overview.top_properties || []).length > 0
    );
  const hasRealLeadsData = leads.length > 0;
  const hasRealLandingPagesData = landingPages.length > 0;
  const hasRealAnalyticsData =
    !!analytics &&
    (
      analytics.daily_leads.length > 0 ||
      analytics.weekly_leads.length > 0 ||
      analytics.monthly_leads.length > 0 ||
      Object.keys(analytics.source_breakdown || {}).length > 0 ||
      Object.keys(analytics.cta_breakdown || {}).length > 0
    );

  const displayOverview = !starterPlanRestricted && hasRealOverviewData ? (overview as MarketingOverview) : mockOverviewData;
  const displayLeads = !starterPlanRestricted && hasRealLeadsData ? leads : mockLeadsData;
  const displayLandingPages = !starterPlanRestricted && hasRealLandingPagesData ? landingPages : mockLandingPagesData;
  const displayAnalytics = !starterPlanRestricted && hasRealAnalyticsData ? (analytics as MarketingAnalytics) : mockAnalyticsData;
  const showingDemoData = starterPlanRestricted || (!hasRealOverviewData && !hasRealLeadsData && !hasRealLandingPagesData && !hasRealAnalyticsData);

  const sourceChartData = useMemo(() => {
    const map = displayOverview.source_breakdown || {};
    return Object.entries(map).map(([key, value]) => ({
      name: sourceLabel[normalizeSourceKey(key)] || sourceLabel.unknown,
      value,
    }));
  }, [displayOverview.source_breakdown]);

  const formatDateTime = (value?: string | null): string => {
    if (!value) return 'غير متوفر';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'غير متوفر';
    return date.toLocaleString('ar-SA');
  };

  const formatDuration = (seconds?: number): string => {
    const safe = Math.max(0, Number(seconds || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    if (mins > 0) return `${mins} د ${secs} ث`;
    return `${secs} ث`;
  };

  const funnelData = useMemo(() => {
    const visits = displayOverview.visits_count || 0;
    const clicks = displayOverview.clicks_count || 0;
    const leadsCount = displayOverview.leads_month || 0;
    return [
      { value: visits, name: 'زيارات' },
      { value: clicks, name: 'نقرات' },
      { value: leadsCount, name: 'عملاء محتملون' },
    ];
  }, [displayOverview.clicks_count, displayOverview.leads_month, displayOverview.visits_count]);

  const avgDailyLeads = useMemo(() => Math.max(1, Math.round((displayOverview.leads_month || 0) / 30)), [displayOverview.leads_month]);
  const statsCards = useMemo(() => {
    const conversionTarget = 10;
    const sessionTarget = 120;
    return [
      {
        key: 'leads_today',
        label: 'عملاء اليوم',
        value: displayOverview.leads_today,
        icon: <CalendarDays className="h-4 w-4 text-blue-600" />,
        trendUp: displayOverview.leads_today >= avgDailyLeads,
        trendText: `مقارنة بمتوسط ${avgDailyLeads}`,
      },
      {
        key: 'leads_month',
        label: 'عملاء الشهر',
        value: displayOverview.leads_month,
        icon: <UsersRound className="h-4 w-4 text-violet-600" />,
        trendUp: true,
        trendText: 'تراكم شهري',
      },
      {
        key: 'visits',
        label: 'الزيارات',
        value: displayOverview.visits_count,
        icon: <Gauge className="h-4 w-4 text-emerald-600" />,
        trendUp: true,
        trendText: 'زيارات صفحات الهبوط',
      },
      {
        key: 'unique',
        label: 'الزوار الفريدون',
        value: displayOverview.unique_visitors_count || 0,
        icon: <UserRound className="h-4 w-4 text-cyan-600" />,
        trendUp: (displayOverview.unique_visitors_count || 0) >= (displayOverview.visits_count || 0) * 0.5,
        trendText: 'جودة الوصول',
      },
      {
        key: 'conversion',
        label: 'نسبة التحويل',
        value: `${displayOverview.conversion_rate.toFixed(2)}%`,
        icon: <CircleDollarSign className="h-4 w-4 text-orange-600" />,
        trendUp: displayOverview.conversion_rate >= conversionTarget,
        trendText: `الهدف ${conversionTarget}%`,
      },
      {
        key: 'session',
        label: 'متوسط مدة الجلسة',
        value: formatDuration(displayOverview.average_session_duration_seconds || 0),
        icon: <Timer className="h-4 w-4 text-indigo-600" />,
        trendUp: (displayOverview.average_session_duration_seconds || 0) >= sessionTarget,
        trendText: `الهدف ${formatDuration(sessionTarget)}`,
      },
    ];
  }, [
    avgDailyLeads,
    displayOverview.average_session_duration_seconds,
    displayOverview.conversion_rate,
    displayOverview.leads_month,
    displayOverview.leads_today,
    displayOverview.unique_visitors_count,
    displayOverview.visits_count,
  ]);

  const analyticsSummaryCards = useMemo(() => {
    const dailyTotal = (displayAnalytics.daily_leads || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
    const weeklyTotal = (displayAnalytics.weekly_leads || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
    const topSourceEntry = Object.entries(displayAnalytics.source_breakdown || {}).sort((a, b) => b[1] - a[1])[0];
    const topCtaEntry = Object.entries(displayAnalytics.cta_breakdown || {}).sort((a, b) => b[1] - a[1])[0];
    return [
      {
        key: 'daily_total',
        label: 'إجمالي العملاء اليومي',
        value: dailyTotal.toLocaleString('ar-SA'),
        hint: `${displayAnalytics.daily_leads.length} أيام`,
      },
      {
        key: 'weekly_total',
        label: 'إجمالي العملاء الأسبوعي',
        value: weeklyTotal.toLocaleString('ar-SA'),
        hint: `${displayAnalytics.weekly_leads.length} أسابيع`,
      },
      {
        key: 'top_source',
        label: 'أقوى مصدر',
        value: sourceLabel[normalizeSourceKey(topSourceEntry?.[0])] || sourceLabel.unknown,
        hint: `${Number(topSourceEntry?.[1] || 0).toLocaleString('ar-SA')} عميل`,
      },
      {
        key: 'top_cta',
        label: 'أفضل CTA',
        value: ctaLabel[topCtaEntry?.[0] || 'primary'] || (topCtaEntry?.[0] || 'CTA'),
        hint: `${Number(topCtaEntry?.[1] || 0).toLocaleString('ar-SA')} تفاعل`,
      },
    ];
  }, [displayAnalytics.cta_breakdown, displayAnalytics.daily_leads, displayAnalytics.source_breakdown, displayAnalytics.weekly_leads]);

  const handleConvertLead = async (leadId: string, targetType: 'request' | 'profile') => {
    if (starterPlanRestricted) {
      message.info('هذه الميزة متاحة بعد الترقية إلى خطة احترافية.');
      return;
    }
    try {
      await convertMarketingLead(leadId, targetType);
      message.success('تم تحويل الـLead بنجاح.');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تحويل الـLead.');
    }
  };

  const handleStatusChange = async (leadId: string, status: 'new' | 'contacted' | 'qualified' | 'closed') => {
    if (starterPlanRestricted) {
      message.info('هذه الميزة متاحة بعد الترقية إلى خطة احترافية.');
      return;
    }
    try {
      await updateMarketingLeadStatus(leadId, status);
      setLeads((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)));
      message.success('تم تحديث حالة الـLead.');
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تحديث الحالة.');
    }
  };

  const openLeadDetails = (lead: MarketingLead) => {
    setActiveLead(lead);
    setLeadNotesDraft(lead.notes || '');
    setLeadDetailsOpen(true);
  };

  const handleSaveLeadNotes = async () => {
    if (starterPlanRestricted) {
      message.info('هذه الميزة متاحة بعد الترقية إلى خطة احترافية.');
      return;
    }
    if (!activeLead) return;
    try {
      const updated = await updateMarketingLead(activeLead.id, { notes: leadNotesDraft });
      setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? updated : lead)));
      setActiveLead(updated);
      message.success('تم حفظ الملاحظة.');
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر حفظ الملاحظة.');
    }
  };

  const openLandingDetails = async (propertyId: string) => {
    setLandingDetailsOpen(true);
    setLandingDetailsLoading(true);
    if (starterPlanRestricted) {
      setLandingDetails({
        ...mockLandingDetailsData,
        property_id: propertyId,
      });
      setLandingDetailsLoading(false);
      return;
    }
    try {
      const details = await getMarketingLandingPageDetails(propertyId);
      setLandingDetails(details);
    } catch (e: any) {
      setLandingDetails({
        ...mockLandingDetailsData,
        property_id: propertyId,
      });
      message.warning(e?.response?.data?.detail || 'تعذر تحميل التفاصيل الحقيقية، تم عرض نموذج تجريبي.');
    } finally {
      setLandingDetailsLoading(false);
    }
  };

  const landingSourceChartData = useMemo(() => {
    if (!landingDetails) return [];
    return (landingDetails.traffic_sources || []).map((item) => ({
      name: sourceLabel[normalizeSourceKey(item.source)] || sourceLabel.unknown,
      visits: item.visits,
      clicks: item.clicks,
      leads: item.leads,
      conversion_rate: item.conversion_rate,
    }));
  }, [landingDetails]);

  const leadsColumns = [
    { title: 'الاسم', dataIndex: 'name', key: 'name' },
    { title: 'العقار', dataIndex: 'property_id', key: 'property_id' },
    {
      title: 'المصدر',
      dataIndex: 'ad_source',
      key: 'ad_source',
      render: (value: string) => <Tag>{sourceLabel[normalizeSourceKey(value)] || sourceLabel.unknown}</Tag>,
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      render: (value: MarketingLead['status'], row: MarketingLead) => (
        <Select
          value={value}
          disabled={starterPlanRestricted}
          style={{ minWidth: 120 }}
          options={[
            { value: 'new', label: 'جديد' },
            { value: 'contacted', label: 'تم التواصل' },
            { value: 'qualified', label: 'مؤهل' },
            { value: 'closed', label: 'مغلق' },
          ]}
          onChange={(next) => handleStatusChange(row.id, next)}
        />
      ),
    },
    {
      title: 'آخر نشاط',
      key: 'last_activity',
      render: (_: unknown, row: MarketingLead) => formatDateTime(row.session_last_activity_at || row.updated_at),
    },
    {
      title: 'وقت الدخول',
      key: 'entry_time',
      render: (_: unknown, row: MarketingLead) => formatDateTime(row.session_started_at || row.created_at),
    },
    {
      title: 'تفاصيل',
      key: 'details',
      render: (_: unknown, row: MarketingLead) => (
        <Button size="small" onClick={() => openLeadDetails(row)}>
          عرض التفاصيل
        </Button>
      ),
    },
  ];

  const landingColumns = [
    { title: 'العقار', dataIndex: 'property_id', key: 'property_id' },
    { title: 'الزيارات', dataIndex: 'visits_count', key: 'visits_count' },
    { title: 'الزوار الفريدون', dataIndex: 'unique_visitors_count', key: 'unique_visitors_count' },
    { title: 'العملاء المحتملون', dataIndex: 'leads_count', key: 'leads_count' },
    {
      title: 'التحويل',
      dataIndex: 'conversion_rate',
      key: 'conversion_rate',
      render: (value: number) => <Tag color={value >= 10 ? 'green' : 'blue'}>{value.toFixed(1)}%</Tag>,
    },
    {
      title: 'أفضل مصدر',
      dataIndex: 'top_source',
      key: 'top_source',
      render: (value: string) => sourceLabel[normalizeSourceKey(value)] || sourceLabel.unknown,
    },
    {
      title: 'إجراءات',
      key: 'actions',
      render: (_: unknown, row: MarketingLandingPageStat) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size="small"
            onClick={async () => {
              const url = `${window.location.origin}/ad/${row.property_id}`;
              await navigator.clipboard.writeText(url);
              message.success('تم نسخ رابط صفحة الهبوط.');
            }}
          >
            نسخ الرابط
          </Button>
          <Button size="small" onClick={() => (onOpenLanding ? onOpenLanding(row.property_id) : window.open(`/ad/${row.property_id}`, '_blank'))}>
            فتح
          </Button>
          <Button size="small" onClick={() => void openLandingDetails(row.property_id)}>
            Analytics
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Skeleton active paragraph={{ rows: 4 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {showingDemoData && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="يتم عرض بيانات تجريبية مؤقتًا لعرض الشكل. ستختفي تلقائيًا عند توفر بيانات حقيقية."
          description={starterPlanRestricted ? 'يجب الترقية لعرض التحليلات الحقيقية.' : undefined}
          action={
            starterPlanRestricted ? (
              <Button size="small" type="primary" onClick={() => navigate('/settings')}>
                الترقية الآن
              </Button>
            ) : undefined
          }
        />
      )}
      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: 'نظرة عامة',
            children: (
              <div style={{ display: 'grid', gap: 10 }}>
                <Row gutter={[10, 10]}>
                  {statsCards.map((card) => (
                    <Col key={card.key} xs={24} md={12} xl={6}>
                      <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle}>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{card.label}</Text>
                            {card.icon}
                          </div>
                          <Text strong style={{ fontSize: 20, lineHeight: 1.1 }}>
                            {typeof card.value === 'number' ? card.value.toLocaleString('ar-SA') : card.value}
                          </Text>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {card.trendUp ? (
                              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />
                            )}
                            <Text type="secondary" style={{ fontSize: 11 }}>{card.trendText}</Text>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Row gutter={[10, 10]}>
                  <Col xs={24} xl={8}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="مصادر الإعلانات">
                      {sourceChartData.length ? (
                        <div style={{ width: '100%', height: 210 }}>
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie data={sourceChartData} dataKey="value" nameKey="name" outerRadius={70} label>
                                {sourceChartData.map((entry, index) => (
                                  <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <Empty description="لا توجد بيانات بعد." />
                      )}
                    </Card>
                  </Col>
                  <Col xs={24} xl={8}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="قمع التحويل">
                      <div style={{ width: '100%', height: 210 }}>
                        <ResponsiveContainer>
                          <FunnelChart>
                            <Tooltip />
                            <Funnel dataKey="value" data={funnelData} isAnimationActive />
                          </FunnelChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {funnelData.map((item) => (
                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{item.name}</Text>
                            <Text strong style={{ fontSize: 12 }}>{Number(item.value || 0).toLocaleString('ar-SA')}</Text>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} xl={8}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="أعلى العقارات أداءً">
                      {displayOverview.top_properties?.length ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {displayOverview.top_properties.map((item) => (
                            <div key={item.property_id} style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
                              <Text style={{ fontSize: 12 }}>{item.property_id}</Text>
                              <Tag color="blue">{Number(item.leads || 0).toLocaleString('ar-SA')}</Tag>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty description="لا توجد بيانات بعد." />
                      )}
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'leads',
            label: 'العملاء المحتملون من الإعلانات',
            children: (
              <Card>
                <Table
                  rowKey="id"
                  columns={leadsColumns}
                  dataSource={displayLeads}
                  locale={{ emptyText: 'لا توجد عملاء محتملون بعد.' }}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 1100 }}
                />
              </Card>
            ),
          },
          {
            key: 'landing-pages',
            label: 'صفحات الهبوط',
            children: (
              <Card>
                <Table
                  rowKey="property_id"
                  columns={landingColumns}
                  dataSource={displayLandingPages}
                  locale={{ emptyText: 'لا توجد بيانات صفحات هبوط بعد.' }}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 900 }}
                />
              </Card>
            ),
          },
          {
            key: 'analytics',
            label: 'التحليلات',
            children: (
              <div style={{ display: 'grid', gap: 10 }}>
                <Row gutter={[10, 10]}>
                  {analyticsSummaryCards.map((item) => (
                    <Col key={item.key} xs={24} md={12} xl={6}>
                      <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                          <Text strong style={{ fontSize: 18 }}>{item.value}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{item.hint}</Text>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Row gutter={[10, 10]}>
                  <Col xs={24} xl={12}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="العملاء اليومي">
                      <div style={{ width: '100%', height: 210 }}>
                        <ResponsiveContainer>
                          <LineChart data={displayAnalytics.daily_leads || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="العملاء الأسبوعي">
                      <div style={{ width: '100%', height: 210 }}>
                        <ResponsiveContainer>
                          <BarChart data={displayAnalytics.weekly_leads || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#22c55e" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="أفضل المصادر">
                      <div style={{ width: '100%', height: 210 }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={Object.entries(displayAnalytics.source_breakdown || {}).map(([key, value]) => ({
                              name: sourceLabel[normalizeSourceKey(key)] || sourceLabel.unknown,
                              count: value,
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#a855f7" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card size="small" style={statCardStyle} bodyStyle={statCardBodyStyle} title="أفضل CTA">
                      <div style={{ width: '100%', height: 210 }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={Object.entries(displayAnalytics.cta_breakdown || {}).map(([key, value]) => ({
                              name: ctaLabel[key] || key,
                              count: value,
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#f97316" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />

      <Drawer
        title={landingDetails ? `تحليلات صفحة الهبوط - ${landingDetails.property_id}` : 'تحليلات صفحة الهبوط'}
        placement="left"
        width={860}
        open={landingDetailsOpen}
        onClose={() => {
          setLandingDetailsOpen(false);
          setLandingDetails(null);
        }}
      >
        {landingDetailsLoading ? (
          <Skeleton active paragraph={{ rows: 12 }} />
        ) : landingDetails ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Row gutter={[10, 10]}>
              <Col xs={24} sm={12} xl={8}><Card size="small" title="إجمالي الزيارات">{landingDetails.visits_count.toLocaleString('ar-SA')}</Card></Col>
              <Col xs={24} sm={12} xl={8}><Card size="small" title="الزوار الفريدون">{landingDetails.unique_visitors_count.toLocaleString('ar-SA')}</Card></Col>
              <Col xs={24} sm={12} xl={8}><Card size="small" title="متوسط مدة الجلسة">{formatDuration(landingDetails.average_session_duration_seconds)}</Card></Col>
              <Col xs={24} sm={12} xl={8}><Card size="small" title="العملاء المحتملون">{landingDetails.leads_count.toLocaleString('ar-SA')}</Card></Col>
              <Col xs={24} sm={12} xl={8}>
                <Card size="small" title="نسبة التحويل">
                  <div style={{ display: 'grid', gap: 6 }}>
                    <Text>{landingDetails.conversion_rate.toFixed(2)}%</Text>
                    <Progress size="small" percent={Math.min(100, landingDetails.conversion_rate)} />
                  </div>
                </Card>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} xl={14}>
                <Card size="small" title="Traffic Sources">
                  <Table
                    rowKey={(row) => row.source}
                    dataSource={(landingDetails.traffic_sources || []).map((row) => ({
                      ...row,
                      source: normalizeSourceKey(row.source),
                    }))}
                    pagination={false}
                    size="small"
                    columns={[
                      {
                        title: 'المصدر',
                        dataIndex: 'source',
                        key: 'source',
                        render: (value: string) => sourceLabel[value] || sourceLabel.unknown,
                      },
                      { title: 'زيارات', dataIndex: 'visits', key: 'visits' },
                      { title: 'ضغطات', dataIndex: 'clicks', key: 'clicks' },
                      { title: 'Leads', dataIndex: 'leads', key: 'leads' },
                      {
                        title: 'تحويل',
                        dataIndex: 'conversion_rate',
                        key: 'conversion_rate',
                        render: (value: number) => `${Number(value || 0).toFixed(2)}%`,
                      },
                    ]}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <Card size="small" title="Conversion Funnel">
                  <div style={{ width: '100%', height: 250 }}>
                    <ResponsiveContainer>
                      <FunnelChart>
                        <Tooltip />
                        <Funnel data={landingDetails.funnel || []} dataKey="value" nameKey="label" isAnimationActive />
                      </FunnelChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {(landingDetails.funnel || []).map((row) => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text>{row.label}</Text>
                        <Text strong>{Number(row.value || 0).toLocaleString('ar-SA')}</Text>
                      </div>
                    ))}
                  </div>
                </Card>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} xl={12}>
                <Card size="small" title="CTA Analytics">
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={[
                          { name: 'واتساب', count: landingDetails.cta_breakdown?.whatsapp_clicks || 0 },
                          { name: 'اتصال', count: landingDetails.cta_breakdown?.call_clicks || 0 },
                          { name: 'مشاهدة الفيديو', count: landingDetails.cta_breakdown?.video_views || 0 },
                          { name: 'فتح الفورم', count: landingDetails.cta_breakdown?.form_views || 0 },
                          { name: 'إرسال الفورم', count: landingDetails.cta_breakdown?.form_submits || 0 },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </Col>
              <Col xs={24} xl={12}>
                <Card size="small" title="توزيع الزيارات حسب المصدر">
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={landingSourceChartData.map((item) => ({ name: item.name, value: item.visits }))}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={84}
                          label
                        >
                          {landingSourceChartData.map((entry, index) => (
                            <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </Col>
            </Row>

            <Card size="small" title="Session Activity">
              <Table
                rowKey={(row, idx) => `${row.happened_at}-${idx}`}
                size="small"
                pagination={{ pageSize: 8 }}
                dataSource={landingDetails.session_activity || []}
                columns={[
                  {
                    title: 'المصدر',
                    dataIndex: 'source',
                    key: 'source',
                    render: (value: string) => sourceLabel[normalizeSourceKey(value)] || sourceLabel.unknown,
                  },
                  {
                    title: 'النشاط',
                    dataIndex: 'activity',
                    key: 'activity',
                    render: (value: string) => activityLabel[value] || value,
                  },
                  {
                    title: 'مدة الجلسة',
                    dataIndex: 'session_duration_seconds',
                    key: 'session_duration_seconds',
                    render: (value: number) => formatDuration(value),
                  },
                  {
                    title: 'الوقت',
                    dataIndex: 'happened_at',
                    key: 'happened_at',
                    render: (value: string) => formatDateTime(value),
                  },
                  { title: 'نوع الجهاز', dataIndex: 'device_type', key: 'device_type' },
                ]}
              />
            </Card>
          </div>
        ) : (
          <Empty description="لا توجد تفاصيل متاحة." />
        )}
      </Drawer>

      <Drawer
        title="تفاصيل العميل المحتمل"
        placement="left"
        width={460}
        open={leadDetailsOpen}
        onClose={() => setLeadDetailsOpen(false)}
      >
        {activeLead ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <Card size="small" title="معلومات العميل">
              <div style={{ display: 'grid', gap: 6 }}>
                <Text><Text strong>الاسم:</Text> {activeLead.name || 'غير متوفر'}</Text>
                <Text><Text strong>الجوال:</Text> {activeLead.phone || 'غير متوفر'}</Text>
                <Text><Text strong>العقار:</Text> {activeLead.property_id}</Text>
                <Text><Text strong>المصدر:</Text> {sourceLabel[normalizeSourceKey(activeLead.ad_source)] || sourceLabel.unknown}</Text>
              </div>
            </Card>

            <Card size="small" title="سلوك المستخدم">
              <Space wrap>
                <Tag color={activeLead.clicked_whatsapp ? 'green' : 'default'}>ضغط واتساب</Tag>
                <Tag color={activeLead.viewed_video ? 'blue' : 'default'}>شاهد فيديو</Tag>
                <Tag color={activeLead.completed_video ? 'purple' : 'default'}>أكمل الفيديو</Tag>
                <Tag color={activeLead.submitted_form ? 'gold' : 'default'}>أرسل الفورم</Tag>
                <Tag>عدد الزيارات: {activeLead.visit_count}</Tag>
              </Space>
            </Card>

            <Card size="small" title="تحليلات الجلسة">
              <div style={{ display: 'grid', gap: 6 }}>
                <Text><Text strong>مدة الجلسة:</Text> {formatDuration(activeLead.session_duration_seconds)}</Text>
                <Text><Text strong>وقت الدخول:</Text> {formatDateTime(activeLead.session_started_at || activeLead.created_at)}</Text>
                <Text><Text strong>آخر نشاط:</Text> {formatDateTime(activeLead.session_last_activity_at || activeLead.updated_at)}</Text>
                <Text><Text strong>الجهاز:</Text> {activeLead.device_type || 'غير متوفر'}</Text>
                <Text><Text strong>المتصفح:</Text> {activeLead.browser_name || 'غير متوفر'}</Text>
              </div>
            </Card>

            <Card size="small" title="الإجراءات">
              <div style={{ display: 'grid', gap: 10 }}>
                <Space wrap>
                  {activeLead.converted_to_client ? (
                    <Tag color="green">تم التحويل</Tag>
                  ) : (
                    <>
                      <Button size="small" disabled={starterPlanRestricted} onClick={() => handleConvertLead(activeLead.id, 'request')}>
                        تحويل إلى طلب عميل
                      </Button>
                      <Button size="small" disabled={starterPlanRestricted} onClick={() => handleConvertLead(activeLead.id, 'profile')}>
                        تحويل إلى ملف عميل
                      </Button>
                    </>
                  )}
                </Space>

                <Select
                  value={activeLead.status}
                  disabled={starterPlanRestricted}
                  options={[
                    { value: 'new', label: 'جديد' },
                    { value: 'contacted', label: 'تم التواصل' },
                    { value: 'qualified', label: 'مؤهل' },
                    { value: 'closed', label: 'مغلق' },
                  ]}
                  onChange={async (next) => {
                    await handleStatusChange(activeLead.id, next);
                    setActiveLead((prev) => (prev ? { ...prev, status: next } : prev));
                  }}
                />

                <Input.TextArea
                  value={leadNotesDraft}
                  disabled={starterPlanRestricted}
                  onChange={(e) => setLeadNotesDraft(e.target.value)}
                  rows={3}
                  placeholder="أضف ملاحظة..."
                />
                <Button disabled={starterPlanRestricted} onClick={handleSaveLeadNotes}>حفظ الملاحظة</Button>

                <Space wrap>
                  <Button href={`https://wa.me/${(activeLead.phone || '').replace(/[^\d]/g, '')}`} target="_blank">
                    واتساب
                  </Button>
                  <Button href={`tel:${activeLead.phone || ''}`}>اتصال</Button>
                </Space>
              </div>
            </Card>
          </div>
        ) : (
          <Empty description="لا توجد بيانات لعرضها." />
        )}
      </Drawer>
    </motion.div>
  );
};

export default MarketingPage;
