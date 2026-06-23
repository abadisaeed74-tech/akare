import React, { useEffect, useMemo, useState } from 'react';
import { InputNumber, message, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Server,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getAuditLogs,
  getCurrentUser,
  getPlatformOfficeDetail,
  getPlatformOffices,
  getPlatformStats,
  platformAdminDeleteOffice,
  platformAdminSubscriptionAction,
  type AuditLogItem,
  type PlatformOfficeDetail,
  type PlatformOfficeSummary,
  type PlatformStats,
} from '../services/api';

const PLATFORM_OWNER_EMAIL = 'abadi.saeed@bynh.sa';

type AdminSection =
  | 'dashboard'
  | 'offices'
  | 'subscriptions'
  | 'revenue'
  | 'analytics'
  | 'ai'
  | 'monitoring'
  | 'admins'
  | 'logs'
  | 'settings';

type DetailTab =
  | 'overview'
  | 'properties'
  | 'employees'
  | 'subscription'
  | 'ai'
  | 'billing'
  | 'logs';

const navItems: Array<{ key: AdminSection; label: string; icon: React.ElementType }> = [
  { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { key: 'offices', label: 'المكاتب', icon: Building2 },
  { key: 'subscriptions', label: 'الاشتراكات', icon: Wallet },
  { key: 'revenue', label: 'الإيرادات', icon: TrendingUp },
  { key: 'analytics', label: 'التحليلات', icon: BarChart3 },
  { key: 'ai', label: 'استخدام الذكاء الاصطناعي', icon: Sparkles },
  { key: 'monitoring', label: 'مراقبة النظام', icon: Server },
  { key: 'admins', label: 'حسابات الأدمن', icon: UserCog },
  { key: 'logs', label: 'سجل النشاط', icon: Clock3 },
  { key: 'settings', label: 'الإعدادات', icon: SettingsIcon },
];

const formatNumber = (v: number) => v.toLocaleString('ar-SA');
const formatDateTime = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Riyadh',
      }).format(new Date(v))
    : 'غير متوفر';
const statusLabel = (status?: string | null) => {
  if (status === 'active') return 'نشط';
  if (status === 'trialing') return 'تجريبي';
  if (status === 'cancelled') return 'ملغي';
  if (status === 'expired') return 'منتهي';
  return 'غير محدد';
};
const actionLabel = (action?: string | null) => {
  const key = String(action || '').trim().toUpperCase();
  const map: Record<string, string> = {
    LOGIN_SUCCESS: 'تسجيل دخول ناجح',
    LOGIN_FAILED: 'فشل تسجيل الدخول',
    LOGOUT: 'تسجيل الخروج',
    CREATE_PROPERTY: 'إضافة عقار',
    UPDATE_PROPERTY: 'تعديل عقار',
    DELETE_PROPERTY: 'حذف عقار',
    CREATE_CLIENT: 'إضافة عميل',
    UPDATE_CLIENT: 'تعديل عميل',
    DELETE_CLIENT: 'حذف عميل',
    CREATE_APPOINTMENT: 'إنشاء موعد',
    UPDATE_APPOINTMENT: 'تعديل موعد',
    DELETE_APPOINTMENT: 'حذف موعد',
    UPLOAD_FILE: 'رفع ملف',
    CREATE_EMPLOYEE: 'إضافة موظف',
    UPDATE_EMPLOYEE: 'تعديل موظف',
    DISABLE_EMPLOYEE: 'تعطيل موظف',
    DELETE_EMPLOYEE: 'حذف موظف',
    SUBSCRIPTION_ACTIVATED: 'تفعيل اشتراك',
    SUBSCRIPTION_RENEWED: 'تجديد اشتراك',
    SUBSCRIPTION_EXPIRED: 'انتهاء اشتراك',
    DELETE_OFFICE: 'حذف مكتب',
  };
  return map[key] || action || 'غير معروف';
};
const PLAN_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'starter', label: 'مبتدئ' },
  { key: 'business', label: 'احترافية' },
  { key: 'enterprise', label: 'مؤسسات' },
];

const safeDateMs = (v?: string | null) => {
  if (!v) return 0;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : 0;
};

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900/40';
const panelClass =
  'rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900';

const EmptyState: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
    <p className="text-base font-semibold">{title}</p>
    <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
  </div>
);

const MetricCard: React.FC<{
  title: string;
  value: string;
  icon: React.ElementType;
  note?: string;
}> = ({ title, value, icon: Icon, note }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
    <div className="mb-2 flex items-start justify-between">
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
        <h3 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</h3>
      </div>
      <span className="rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
        <Icon size={16} className="text-slate-700 dark:text-slate-200" />
      </span>
    </div>
    {note ? <p className="text-xs text-slate-500">{note}</p> : null}
  </div>
);

const PlatformAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [offices, setOffices] = useState<PlatformOfficeSummary[]>([]);
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'properties' | 'employees'>('latest');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(8);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selectedOffice, setSelectedOffice] = useState<PlatformOfficeSummary | null>(null);
  const [officeDetail, setOfficeDetail] = useState<PlatformOfficeDetail | null>(null);
  const [subscriptionDays, setSubscriptionDays] = useState<number>(30);
  const [freePlanKey, setFreePlanKey] = useState<string>('business');
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditCompanyFilter, setAuditCompanyFilter] = useState<string>('all');
  const [auditUserFilter, setAuditUserFilter] = useState<string>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditDateFrom, setAuditDateFrom] = useState<string>('');
  const [auditDateTo, setAuditDateTo] = useState<string>('');
  const [auditPage, setAuditPage] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('akare-admin-theme') === 'dark';
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('akare-admin-theme', darkMode ? 'dark' : 'light');
    const root = document.documentElement;
    const body = document.body;
    if (darkMode) {
      root.classList.add('dark');
      body.classList.add('akare-dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('akare-dark');
    }
    return () => {
      root.classList.remove('dark');
      body.classList.remove('akare-dark');
    };
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setMobileSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadDashboardData = async () => {
    const [statsData, officesData] = await Promise.all([getPlatformStats(), getPlatformOffices()]);
    setStats(statsData);
    setOffices(officesData);
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const payload = await getAuditLogs({
        company_owner_id: auditCompanyFilter === 'all' ? undefined : auditCompanyFilter,
        user_id: auditUserFilter === 'all' ? undefined : auditUserFilter,
        action: auditActionFilter === 'all' ? undefined : auditActionFilter,
        search: searchText || undefined,
        date_from: auditDateFrom || undefined,
        date_to: auditDateTo || undefined,
        page: auditPage,
        page_size: 50,
      });
      setAuditLogs(payload.items || []);
      setAuditTotal(payload.total || 0);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تحميل سجل التدقيق.');
    } finally {
      setAuditLoading(false);
    }
  };

  const loadOfficeDetail = async (ownerUserId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await getPlatformOfficeDetail(ownerUserId);
      setOfficeDetail(detail);
    } catch {
      setOfficeDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        const me = await getCurrentUser();
        if ((me.email || '').toLowerCase() !== PLATFORM_OWNER_EMAIL) {
          setError('هذه الصفحة خاصة بمالك المنصة فقط.');
          return;
        }
        await loadDashboardData();
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'فشل في تحميل لوحة إدارة المنصة.');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const planCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const office of offices) {
      const key = office.plan_key || 'غير محدد';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [offices]);

  const statusCounts = useMemo(() => {
    const active = offices.filter((o) => o.subscription_status === 'active').length;
    const trial = offices.filter((o) => o.subscription_status === 'trialing').length;
    const inactive = offices.filter((o) => o.subscription_status === 'expired' || o.subscription_status === 'cancelled').length;
    return [
      { name: 'نشط', value: active },
      { name: 'تجريبي', value: trial },
      { name: 'غير نشط', value: inactive },
    ];
  }, [offices]);

  const topOfficesData = useMemo(() => {
    return [...offices]
      .sort((a, b) => b.total_properties - a.total_properties)
      .slice(0, 8)
      .map((o) => ({
        name: o.company_name || 'بدون اسم',
        العقارات: o.total_properties,
        الموظفون: o.total_employees,
      }));
  }, [offices]);

  const filteredOffices = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const filtered = offices.filter((office) => {
      if (planFilter !== 'all' && office.plan_key !== planFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && office.subscription_status !== 'active') return false;
        if (statusFilter === 'trial' && office.subscription_status !== 'trialing') return false;
        if (statusFilter === 'inactive' && !['expired', 'cancelled'].includes(office.subscription_status || '')) return false;
      }
      if (!q) return true;
      return [office.company_name || '', office.owner_email || '', office.owner_user_id || '', office.plan_key || '', office.billing_status || '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    filtered.sort((a, b) => {
      if (sortBy === 'properties') return b.total_properties - a.total_properties;
      if (sortBy === 'employees') return b.total_employees - a.total_employees;
      return safeDateMs(b.updated_at || b.created_at) - safeDateMs(a.updated_at || a.created_at);
    });

    return filtered;
  }, [offices, planFilter, searchText, sortBy, statusFilter]);

  const pagedOffices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOffices.slice(start, start + pageSize);
  }, [currentPage, filteredOffices, pageSize]);

  const auditActions = useMemo(() => {
    const set = new Set<string>();
    for (const row of auditLogs) {
      if (row.action) set.add(row.action);
    }
    return Array.from(set.values()).sort();
  }, [auditLogs]);

  const auditUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of auditLogs) {
      if (row.user_id) {
        map.set(row.user_id, row.user_email || row.user_name || row.user_id);
      }
    }
    return Array.from(map.entries());
  }, [auditLogs]);

  const openOfficeDetail = async (office: PlatformOfficeSummary) => {
    setSelectedOffice(office);
    setOfficeDetail(null);
    setDetailOpen(true);
    setDetailTab('overview');
    setSubscriptionDays(30);
    setFreePlanKey(office.plan_key || 'business');
    await loadOfficeDetail(office.owner_user_id);
  };

  const runOfficeAction = async (
    action: 'extend' | 'grant_free' | 'cancel',
    confirmMessage: string,
    successMessage: string,
  ) => {
    if (!selectedOffice) return;
    if (!window.confirm(confirmMessage)) return;
    setActionLoading(true);
    try {
      await platformAdminSubscriptionAction(selectedOffice.owner_user_id, {
        action,
        days: action === 'cancel' ? undefined : subscriptionDays,
        plan_key: action === 'grant_free' ? freePlanKey : undefined,
      });
      await Promise.all([loadDashboardData(), loadOfficeDetail(selectedOffice.owner_user_id)]);
      message.success(successMessage);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تنفيذ العملية.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOfficeRequest = (office: PlatformOfficeSummary) => {
    const officeName = office.company_name || 'هذا المكتب';
    const confirmed = window.confirm(`هل أنت متأكد من حذف ${officeName} نهائيًا؟ سيتم حذف كل بيانات المكتب.`);
    if (!confirmed) return;
    setActionLoading(true);
    void (async () => {
      try {
        await platformAdminDeleteOffice(office.owner_user_id);
        if (selectedOffice?.owner_user_id === office.owner_user_id) {
          setDetailOpen(false);
          setSelectedOffice(null);
          setOfficeDetail(null);
        }
        await loadDashboardData();
        message.success('تم حذف المكتب بنجاح.');
      } catch (e: any) {
        message.error(e?.response?.data?.detail || 'تعذر حذف المكتب.');
      } finally {
        setActionLoading(false);
      }
    })();
  };

  useEffect(() => {
    if (section === 'logs') {
      void loadAuditLogs();
    }
  }, [section, auditCompanyFilter, auditUserFilter, auditActionFilter, auditDateFrom, auditDateTo, auditPage, searchText]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-rose-300 bg-rose-50 p-6 text-right text-rose-700">
        <p className="text-base font-semibold">{error || 'تعذر فتح لوحة إدارة المنصة.'}</p>
        <button
          type="button"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => navigate('/app')}
        >
          العودة للوحة التحكم
        </button>
      </div>
    );
  }

  const notifications = [
    { title: 'إجمالي المكاتب', description: `${formatNumber(stats.total_offices)} مكتب مسجل.` },
    { title: 'المكاتب غير المشتركة', description: `${formatNumber(stats.unsubscribed_offices)} مكتب.` },
    { title: 'إجمالي العقارات', description: `${formatNumber(stats.total_properties)} عقار.` },
  ];

  const rootBg = darkMode
    ? 'dark bg-[radial-gradient(circle_at_top_right,_#111827,_#020617_62%)] text-slate-100'
    : 'bg-[radial-gradient(circle_at_top_right,_#f8fbff,_#eef3ff_58%,_#f8fafc)] text-slate-900';

  return (
    <div dir="rtl" className={`${rootBg} min-h-screen`}>
      <div className="mx-auto flex max-w-[1800px] gap-4 p-4">
        {isMobile && mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={() => setMobileSidebarOpen(false)} />
        )}

        <aside
          className={`${
            isMobile
              ? `fixed right-0 top-0 z-50 h-screen w-72 transform transition-transform ${mobileSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`
              : 'sticky top-4 h-[calc(100vh-2rem)]'
          } rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_16px_50px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-900 ${
            !isMobile && sidebarCollapsed ? 'w-20' : !isMobile ? 'w-72' : ''
          }`}
        >
          <div className="mb-4 flex items-center justify-between px-2">
            {!sidebarCollapsed && (
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">منصة عقار</p>
                <h2 className="text-base font-bold">لوحة مالك المنصة</h2>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (isMobile) setMobileSidebarOpen(false);
                else setSidebarCollapsed((p) => !p);
              }}
              className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {isMobile ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setSection(item.key);
                    if (isMobile) setMobileSidebarOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-sm transition ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.1)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(true)}
                    className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Menu size={16} />
                  </button>
                )}
                <div>
                  <h1 className="text-2xl font-black tracking-tight">لوحة إدارة مالك المنصة</h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {new Date(now).toLocaleString('ar-SA')} • آخر تحديث مباشر للبيانات
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDarkMode((p) => !p)}
                  className="rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => loadDashboardData()}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  تحديث
                </button>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  رجوع
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <label className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="بحث بالمكتب أو البريد أو الحالة"
                  className={`${inputClass} pr-9`}
                />
              </label>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 size={14} /> البيانات المعروضة مباشرة من الخادم
                </span>
              </div>

              <details className="relative rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                <summary className="flex cursor-pointer list-none items-center gap-2">
                  <Bell size={14} />
                  تنبيهات إحصائية ({notifications.length})
                </summary>
                <div className="absolute left-0 top-[110%] z-10 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {notifications.map((item, idx) => (
                    <div key={idx} className="mb-2 rounded-lg border border-slate-100 p-2 last:mb-0 dark:border-slate-700">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </header>

          {(section === 'dashboard' || section === 'subscriptions' || section === 'analytics') && (
            <>
              <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="إجمالي المكاتب" value={formatNumber(stats.total_offices)} icon={Building2} />
                <MetricCard title="المكاتب النشطة" value={formatNumber(stats.subscribed_offices)} icon={CheckCircle2} />
                <MetricCard title="المكاتب التجريبية" value={formatNumber(stats.trialing_offices)} icon={Sparkles} />
                <MetricCard title="المكاتب غير النشطة" value={formatNumber(stats.unsubscribed_offices)} icon={XCircle} />
                <MetricCard title="إجمالي المستخدمين" value={formatNumber(stats.total_users)} icon={Users} />
                <MetricCard title="حسابات الملاك" value={formatNumber(stats.total_owners)} icon={UserCog} />
                <MetricCard title="حسابات الموظفين" value={formatNumber(stats.total_employees)} icon={UserCog} />
                <MetricCard title="إجمالي العقارات" value={formatNumber(stats.total_properties)} icon={Building2} />
              </section>

              <section className="mb-4 grid gap-4 xl:grid-cols-2">
                <div className={panelClass}>
                  <h3 className="mb-3 text-sm font-bold">توزيع الخطط </h3>
                  {planCounts.length === 0 ? (
                    <EmptyState title="لا توجد بيانات خطط" subtitle="لم يتم تسجيل أي مكتب بعد." />
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={planCounts} dataKey="value" nameKey="name" outerRadius={95} label>
                            {planCounts.map((_, idx) => (
                              <Cell key={idx} fill={['#4f46e5', '#0ea5e9', '#16a34a', '#f97316', '#e11d48'][idx % 5]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className={panelClass}>
                  <h3 className="mb-3 text-sm font-bold">أعلى المكاتب بعدد العقارات </h3>
                  {topOfficesData.length === 0 ? (
                    <EmptyState title="لا توجد مكاتب" subtitle="لم تتوفر بيانات للمقارنة." />
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topOfficesData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="name" hide />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="العقارات" fill="#2563eb" radius={[8, 8, 0, 0]} />
                          <Bar dataKey="الموظفون" fill="#16a34a" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>

              <section className={panelClass}>
                <h3 className="mb-3 text-sm font-bold">توزيع حالة الاشتراك </h3>
                <div className="grid gap-3 md:grid-cols-3">
                  {statusCounts.map((item) => (
                    <div key={item.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-xs text-slate-500">{item.name}</p>
                      <p className="mt-1 text-xl font-bold">{formatNumber(item.value)}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {(section === 'dashboard' || section === 'offices') && (
            <section className={`${panelClass} mt-4`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">إدارة المكاتب </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={planFilter}
                    onChange={(e) => {
                      setPlanFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="all">كل الخطط</option>
                    {planCounts.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as 'all' | 'active' | 'trial' | 'inactive');
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="active">نشط</option>
                    <option value="trial">تجريبي</option>
                    <option value="inactive">غير نشط</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'latest' | 'properties' | 'employees')}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="latest">أحدث نشاط</option>
                    <option value="properties">الأكثر عقارات</option>
                    <option value="employees">الأكثر موظفين</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-[980px] w-full text-right text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                    <tr className="text-slate-600 dark:text-slate-300">
                      <th className="px-3 py-2 font-medium">المكتب</th>
                      <th className="px-3 py-2 font-medium">إيميل المالك</th>
                      <th className="px-3 py-2 font-medium">الخطة</th>
                      <th className="px-3 py-2 font-medium">الاشتراك</th>
                      <th className="px-3 py-2 font-medium">العقارات</th>
                      <th className="px-3 py-2 font-medium">الموظفون</th>
                      <th className="px-3 py-2 font-medium">آخر نشاط</th>
                      <th className="px-3 py-2 font-medium">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOffices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10">
                          <EmptyState title="لا توجد مكاتب مطابقة" subtitle="جرّب تغيير الفلاتر أو عبارة البحث." />
                        </td>
                      </tr>
                    ) : (
                      pagedOffices.map((office) => (
                        <tr key={office.owner_user_id} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-3">{office.company_name || 'بدون اسم'}</td>
                          <td className="px-3 py-3">{office.owner_email || 'غير متوفر'}</td>
                          <td className="px-3 py-3">{office.plan_key}</td>
                          <td className="px-3 py-3">{statusLabel(office.subscription_status)}</td>
                          <td className="px-3 py-3">{formatNumber(office.total_properties)}</td>
                          <td className="px-3 py-3">{formatNumber(office.total_employees)}</td>
                          <td className="px-3 py-3">{formatDateTime(office.updated_at || office.created_at)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openOfficeDetail(office)}
                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                              >
                                عرض التفاصيل
                              </button>
                              <button
                                type="button"
                                title="حذف المكتب/الحساب"
                                onClick={() => handleDeleteOfficeRequest(office)}
                                className="rounded-lg border border-rose-300 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <p className="text-slate-500">
                  عرض {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredOffices.length)} من {filteredOffices.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40 dark:border-slate-700"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">{currentPage}</span>
                  <button
                    type="button"
                    disabled={currentPage >= Math.ceil(filteredOffices.length / pageSize)}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(Math.max(1, Math.ceil(filteredOffices.length / pageSize)), p + 1))
                    }
                    className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40 dark:border-slate-700"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {section === 'revenue' && (
            <section className={`${panelClass} mt-4`}>
              <EmptyState title="بيانات الإيرادات غير متاحة" subtitle="لا يوجد endpoint حقيقي للإيرادات في النظام الحالي." />
            </section>
          )}

          {section === 'ai' && (
            <section className={`${panelClass} mt-4`}>
              <EmptyState title="بيانات استخدام الذكاء الاصطناعي غير متاحة" subtitle="لا يوجد endpoint حقيقي لإحصاءات AI في النظام الحالي." />
            </section>
          )}

          {section === 'monitoring' && (
            <section className={`${panelClass} mt-4`}>
              <EmptyState
                title="مراقبة النظام غير مرتبطة ببيانات مباشرة"
                subtitle="لإظهار حالة الخوادم وAPI والأخطاء نحتاج endpoints مراقبة فعلية."
              />
            </section>
          )}

          {section === 'admins' && (
            <section className={`${panelClass} mt-4`}>
              <EmptyState
                title="بيانات حسابات الأدمن غير متاحة من الخادم"
                subtitle="تم إيقاف عرض البيانات المحلية لتجنب أي معلومات غير حقيقية."
              />
            </section>
          )}

          {section === 'logs' && (
            <section className={`${panelClass} mt-4`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={auditCompanyFilter}
                  onChange={(e) => {
                    setAuditCompanyFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">كل المكاتب</option>
                  {offices.map((office) => (
                    <option key={office.owner_user_id} value={office.owner_user_id}>
                      {office.company_name || office.owner_user_id}
                    </option>
                  ))}
                </select>
                <select
                  value={auditUserFilter}
                  onChange={(e) => {
                    setAuditUserFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">كل المستخدمين</option>
                  {auditUsers.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <select
                  value={auditActionFilter}
                  onChange={(e) => {
                    setAuditActionFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">كل العمليات</option>
                  {auditActions.map((a) => (
                    <option key={a} value={a}>{actionLabel(a)}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => {
                    setAuditDateFrom(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => {
                    setAuditDateTo(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              {auditLoading ? (
                <div className="flex items-center justify-center py-10"><Spin /></div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-[1200px] w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800">
                      <tr>
                        <th className="px-2 py-2">الوقت</th>
                        <th className="px-2 py-2">العملية</th>
                        <th className="px-2 py-2">المستخدم</th>
                        <th className="px-2 py-2">المكتب</th>
                        <th className="px-2 py-2">العنصر</th>
                        <th className="px-2 py-2">IP</th>
                        <th className="px-2 py-2">تفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="px-2 py-2">{formatDateTime(row.created_at)}</td>
                          <td className="px-2 py-2">{actionLabel(row.action)}</td>
                          <td className="px-2 py-2">{row.user_email || row.user_name || row.user_id || '-'}</td>
                          <td className="px-2 py-2">{row.company_owner_id || '-'}</td>
                          <td className="px-2 py-2">{row.entity_type || '-'} / {row.entity_id || '-'}</td>
                          <td className="px-2 py-2">{row.ip_address || '-'}</td>
                          <td className="px-2 py-2">{Object.keys(row.details || {}).length ? JSON.stringify(row.details) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 text-xs text-slate-500">إجمالي السجلات: {formatNumber(auditTotal)}</div>
            </section>
          )}

          {section === 'settings' && (
            <section className={`${panelClass} mt-4`}>
              <EmptyState
                title="إعدادات المنصة غير مرتبطة بواجهة API"
                subtitle="لا يتم عرض/حفظ أي إعدادات وهمية حاليًا حتى تتوفر endpoints حقيقية."
              />
            </section>
          )}
        </main>
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm">
          <div className="absolute left-0 top-0 h-full w-full overflow-y-auto md:left-auto md:w-[78vw] lg:w-[68vw]">
            <div className="min-h-full bg-white p-4 dark:bg-slate-950">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-black">{selectedOffice?.company_name || 'تفاصيل المكتب'}</h2>
                  <p className="text-xs text-slate-500">{selectedOffice?.owner_email || 'بدون إيميل'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
                >
                  إغلاق
                </button>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  ['overview', 'نظرة عامة'],
                  ['properties', 'العقارات'],
                  ['employees', 'الموظفون'],
                  ['subscription', 'الاشتراك'],
                  ['ai', 'استخدام الذكاء'],
                  ['billing', 'الفوترة'],
                  ['logs', 'سجل العمليات'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDetailTab(key as DetailTab)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      detailTab === key
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {loadingDetail ? (
                <div className="flex items-center justify-center py-16">
                  <Spin />
                </div>
              ) : !officeDetail ? (
                <p className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  تعذر تحميل بيانات المكتب.
                </p>
              ) : (
                <div className="space-y-4">
                  {(detailTab === 'overview' || detailTab === 'subscription') && (
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                      <h3 className="mb-3 text-sm font-bold">أدوات إدارة الاشتراك </h3>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">عدد الأيام:</span>
                        <InputNumber
                          min={1}
                          max={3650}
                          value={subscriptionDays}
                          onChange={(v) => setSubscriptionDays(Number(v || 1))}
                        />
                        <span className="text-xs text-slate-500">الخطة المجانية:</span>
                        <select
                          value={freePlanKey}
                          onChange={(e) => setFreePlanKey(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          {PLAN_OPTIONS.map((plan) => (
                            <option key={plan.key} value={plan.key}>
                              {plan.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => runOfficeAction('extend', 'تأكيد تمديد الاشتراك؟', 'تم تمديد الاشتراك بنجاح.')}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        >
                          تمديد الاشتراك
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => runOfficeAction('grant_free', 'تأكيد منح اشتراك مجاني؟', 'تم منح اشتراك مجاني.')}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        >
                          منح اشتراك مجاني
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => runOfficeAction('cancel', 'تأكيد إلغاء الاشتراك؟', 'تم إلغاء الاشتراك.')}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        >
                          إلغاء الاشتراك
                        </button>
                      </div>
                      {actionLoading ? (
                        <div className="inline-flex items-center gap-2 text-xs text-slate-500">جاري تنفيذ الإجراء...</div>
                      ) : null}
                    </div>
                  )}

                  {detailTab === 'overview' && (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {[
                        ['الخطة', officeDetail.plan_key],
                        ['حالة الاشتراك', `${statusLabel(officeDetail.subscription_status)} / ${officeDetail.billing_status || 'غير محدد'}`],
                        ['عدد العقارات', formatNumber(officeDetail.total_properties)],
                        ['عدد الموظفين', formatNumber(officeDetail.total_employees)],
                        ['البريد الرسمي', officeDetail.official_email || 'غير متوفر'],
                        ['الهاتف', officeDetail.contact_phone || 'غير متوفر'],
                        ['النطاق الفرعي', officeDetail.subdomain || 'غير متوفر'],
                        ['نهاية الاشتراك', officeDetail.subscription_end_date_gregorian || formatDateTime(officeDetail.subscription_ends_at)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                          <p className="mb-1 text-xs text-slate-500">{k}</p>
                          <p className="font-semibold">{v}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'properties' && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="min-w-[680px] w-full text-right text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-3 py-2">المدينة</th>
                            <th className="px-3 py-2">الحي</th>
                            <th className="px-3 py-2">النوع</th>
                            <th className="px-3 py-2">المساحة</th>
                            <th className="px-3 py-2">السعر</th>
                          </tr>
                        </thead>
                        <tbody>
                          {officeDetail.properties.map((p, idx) => (
                            <tr key={p.id || idx} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="px-3 py-2">{p.city}</td>
                              <td className="px-3 py-2">{p.neighborhood}</td>
                              <td className="px-3 py-2">{p.property_type}</td>
                              <td className="px-3 py-2">{formatNumber(p.area || 0)}</td>
                              <td className="px-3 py-2">{formatNumber(p.price || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {detailTab === 'employees' && (
                    <div className="space-y-2">
                      {officeDetail.employees.map((e) => (
                        <div key={e.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                          <p className="font-semibold">{e.email}</p>
                          <p className="text-xs text-slate-500">الدور: {e.role} • الحالة: {e.status}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {(detailTab === 'ai' || detailTab === 'billing' || detailTab === 'logs') && (
                    <EmptyState
                      title="هذه البيانات غير متوفرة من الخادم"
                      subtitle="تم إخفاء أي بيانات تقديرية/وهمية في هذا التبويب."
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformAdminPage;
