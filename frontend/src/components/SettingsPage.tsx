import React, { useEffect, useState } from 'react';
import {
  Layout,
  Menu,
  Card,
  Typography,
  Descriptions,
  Progress,
  Button,
  Form,
  Input,
  Upload,
  message,
  Table,
  Tag,
  Select,
  Switch,
  Modal,
  Space,
  Avatar,
  Tabs,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  UploadOutlined,
  ArrowRightOutlined,
  UserAddOutlined,
  ExclamationCircleOutlined,
  HomeOutlined,
  CreditCardOutlined,
  SettingOutlined,
  LinkOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  CrownOutlined,
  CheckCircleOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import {
  getCurrentUser,
  getSettingsOverview,
  updateCompanySettings,
checkSubdomainAvailability,
  updateSubdomain,
  updateMyDisplayName,
  createEmployeeUser,
  updateEmployeeUser,
  createStripePortalSession,
  startFreeTrial,
uploadFile,
  resolveMediaUrl,
  type UserPublic,
  type PlanInfo,
  type PlanUsage,
  type CompanySettings,
  type TeamUser,
} from '../services/api';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

type SettingsSectionKey = 'plans' | 'account' | 'subdomain' | 'users' | 'roles' | 'billing';

const palette = {
  pageBg: 'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)',
  surface: 'rgba(255, 255, 255, 0.98)',
  card: '#ffffff',
  border: '#e4e7df',
  text: '#294231',
  muted: '#6d7d72',
  accent: '#3f7d3c',
  accentSoft: '#edf5e9',
  gold: '#b7791f',
  danger: '#b42318',
};

const sectionMeta: Record<SettingsSectionKey, { title: string; description: string; icon: React.ReactNode }> = {
  plans: {
    title: 'الخطط والاشتراكات',
    description: 'راقب حدود الاستخدام، فعّل التجربة، أو انتقل لخطة تناسب نمو مكتبك.',
    icon: <CrownOutlined />,
  },
  account: {
    title: 'إعدادات الحساب',
    description: 'بيانات المكتب، الشعار، واسم المستخدم الذي يظهر في الملاحظات.',
    icon: <SettingOutlined />,
  },
  subdomain: {
    title: 'السب دومين',
    description: 'احجز رابطًا عامًا منظما لصفحات عروض مكتبك.',
    icon: <LinkOutlined />,
  },
  users: {
    title: 'المستخدمون والموظفون',
    description: 'أضف فريقك واضبط حالة كل مستخدم وصلاحياته.',
    icon: <TeamOutlined />,
  },
  roles: {
    title: 'الأدوار والصلاحيات',
    description: 'نظرة سريعة على صلاحيات المالك والموظفين.',
    icon: <SafetyCertificateOutlined />,
  },
  billing: {
    title: 'الفوترة',
    description: 'إدارة وسيلة الدفع والإلغاء والترقية تتم عبر بوابة Stripe.',
    icon: <CreditCardOutlined />,
  },
};

const roleLabel = (role?: TeamUser['role']) => {
  if (role === 'owner') return 'مالك الحساب';
  if (role === 'manager') return 'مدير';
  return 'موظف';
};

const roleColor = (role?: TeamUser['role']) => {
  if (role === 'owner') return 'gold';
  if (role === 'manager') return 'green';
  return 'blue';
};

const PLANS: PlanInfo[] = [
  {
    key: 'starter',
    name: 'مبتدئ',
    max_users: 3,
    max_properties: 60,
    max_storage_mb: 2048,
    allow_custom_subdomain: false,
    price_monthly_sar: 99,
    description: 'مناسبة للمكاتب الصغيرة والمتوسطة',
    badge: null,
  },
  {
    key: 'business',
    name: 'احترافي',
    max_users: 8,
    max_properties: 120,
    max_storage_mb: 10240,
    allow_custom_subdomain: true,
    price_monthly_sar: 199,
    description: 'للمكاتب العقارية الجادة والفرق',
    badge: 'الأكثر استخدامًا',
  },
  {
    key: 'enterprise',
    name: 'مؤسسات',
    max_users: 999999,
    max_properties: 999999,
    max_storage_mb: 102400,
    allow_custom_subdomain: true,
    price_monthly_sar: 799,
    description: 'للشركات والفرق الكبيرة',
    badge: 'للشركات',
  },
];

const dummyPlan: PlanUsage = {
  plan: PLANS[0],
  current_users: 1,
  current_properties: 0,
  used_storage_mb: 0,
};

const dummyCompany: CompanySettings = {
  company_name: 'مكتب عقاري تجريبي',
  official_email: 'info@example.com',
  contact_phone: '+9665xxxxxxx',
  plan_key: 'starter',
};

const dummyTeam: TeamUser[] = [
  {
    id: '1',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  },
];

const SettingsPage: React.FC = () => {
  const [section, setSection] = useState<SettingsSectionKey>('plans');
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [planUsage, setPlanUsage] = useState<PlanUsage>(dummyPlan);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(dummyCompany);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>(dummyTeam);
const [savingAccount, setSavingAccount] = useState(false);
const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState<string>('');
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [subdomain, setSubdomain] = useState<string>('');
  const [subdomainStatus, setSubdomainStatus] = useState<null | { ok: boolean; message: string }>(null);
  const [subdomainModalVisible, setSubdomainModalVisible] = useState(false);
  const [isEmployeeModalVisible, setIsEmployeeModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<TeamUser | null>(null);
  const navigate = useNavigate();
  const [accountForm] = Form.useForm<CompanySettings>();
const [employeeForm] = Form.useForm<{
    email: string;
    password?: string;
    role: 'manager' | 'employee';
    display_name?: string;
    can_add_property: boolean;
    can_edit_property: boolean;
    can_delete_property: boolean;
    can_manage_files: boolean;
    status?: 'active' | 'disabled';
  }>();
  const selectedEmployeeRole = Form.useWatch('role', employeeForm);
  const isManagerRoleSelected = selectedEmployeeRole === 'manager';

  useEffect(() => {
    const init = async () => {
      try {
const user = await getCurrentUser();
        setCurrentUser(user);
        setDisplayName(user.display_name || '');

        const overview = await getSettingsOverview();
        setPlanUsage(overview.plan_usage);
        setCompanySettings(overview.company);
        setTeamUsers(overview.team);
        setSubdomain(overview.company.subdomain || '');

        accountForm.setFieldsValue({
          company_name: overview.company.company_name,
          official_email: overview.company.official_email,
          contact_phone: overview.company.contact_phone,
          logo_url: overview.company.logo_url,
        });
      } catch (e: any) {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        if (status === 401) {
          message.error('انتهت الجلسة، الرجاء تسجيل الدخول مرة أخرى.');
          navigate('/auth', { replace: true });
        } else if (status === 403) {
          message.error(detail || 'ليس لديك صلاحية الوصول إلى صفحة الإعدادات.');
          navigate('/app', { replace: true });
        } else {
          message.error('فشل في تحميل صفحة الإعدادات.');
          navigate('/app', { replace: true });
        }
      }
    };
    init();
  }, [accountForm, navigate]);

  const handleBackToApp = () => {
    navigate('/app');
  };

  const handleSaveAccount = async (values: any) => {
    try {
      setSavingAccount(true);
      const { company_name, official_email, contact_phone, logo_url } = values;
      const updated = await updateCompanySettings({
        company_name,
        official_email,
        contact_phone,
        logo_url,
      });
      setCompanySettings(updated);
message.success('تم حفظ إعدادات الحساب بنجاح.');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveDisplayName = async () => {
    try {
      setSavingDisplayName(true);
      const trimmed = displayName.trim() || null;
      const updated = await updateMyDisplayName(trimmed);
      setCurrentUser(updated);
      message.success('تم حفظ اسم المستخدم بنجاح.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'فشل في حفظ اسم المستخدم.';
      message.error(detail);
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleCheckSubdomain = async () => {
    const value = subdomain.trim().toLowerCase();
    if (!value) {
      setSubdomainStatus({ ok: false, message: 'الرجاء إدخال سب دومين.' });
      return;
    }
    setCheckingSubdomain(true);
    try {
      const result = await checkSubdomainAvailability(value);
      setSubdomainStatus(result);
      if (!result.ok) {
        message.error(result.message);
      }
    } finally {
      setCheckingSubdomain(false);
    }
  };

  const handleSaveSubdomain = () => {
    if (!subdomainStatus?.ok) {
      message.error('الرجاء التحقق من السب دومين قبل الحفظ.');
      return;
    }
    setSubdomainModalVisible(true);
  };

  const confirmSaveSubdomain = async () => {
    try {
      const updated = await updateSubdomain(subdomain.trim().toLowerCase());
      setCompanySettings(updated);
      message.success('تم حفظ السب دومين بنجاح.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'فشل في حفظ السب دومين.';
      message.error(detail);
    } finally {
      setSubdomainModalVisible(false);
    }
  };

  const userColumns: ColumnsType<TeamUser> = [
{
      title: 'البريد الإلكتروني',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'الاسم',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (name: string | null | undefined) => name || '-',
    },
    {
      title: 'الدور',
      dataIndex: 'role',
      key: 'role',
      render: (role: TeamUser['role']) => (
        <Tag color={roleColor(role)}>
          {roleLabel(role)}
        </Tag>
      ),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      render: (status: TeamUser['status']) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? 'نشط' : 'موقوف'}
        </Tag>
      ),
    },
    {
      title: 'إجراءات',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            disabled={record.role === 'owner'}
            onClick={() => {
              setEditingEmployee(record);
              const perms = record.permissions || {};
employeeForm.setFieldsValue({
                email: record.email,
                role: record.role === 'manager' ? 'manager' : 'employee',
                display_name: record.display_name || '',
                status: record.status,
                can_add_property: record.role === 'manager' ? true : perms.can_add_property ?? true,
                can_edit_property: record.role === 'manager' ? true : perms.can_edit_property ?? true,
                can_delete_property: record.role === 'manager' ? true : perms.can_delete_property ?? false,
                can_manage_files: record.role === 'manager' ? true : perms.can_manage_files ?? true,
              });
              setIsEmployeeModalVisible(true);
            }}
          >
            تعديل
          </Button>
          <Button
            size="small"
            danger
            disabled={record.role === 'owner'}
            onClick={async () => {
              const newStatus = record.status === 'active' ? 'disabled' : 'active';
              try {
                const updated = await updateEmployeeUser(record.id, { status: newStatus });
                setTeamUsers((prev) =>
                  prev.map((u) => (u.id === record.id ? { ...u, status: updated.status } : u)),
                );
                message.success(
                  newStatus === 'active'
                    ? 'تم تفعيل الموظف بنجاح.'
                    : 'تم إيقاف الموظف عن العمل بنجاح.',
                );
              } catch {
                message.error('فشل في تحديث حالة الموظف.');
              }
            }}
          >
            {record.status === 'active' ? 'إيقاف' : 'تفعيل'}
          </Button>
        </Space>
      ),
    },
  ];

  const renderPlansSection = () => {
    const effectiveSubscribedPlanKey = companySettings.plan_key || planUsage.plan.key;
    const hasSubscription = !!companySettings.is_subscribed;
    const canStartTrial = !hasSubscription && !companySettings.trial_used;
    const startedAt = companySettings.subscription_started_at
      ? new Date(companySettings.subscription_started_at)
      : null;
    const endsAt = companySettings.subscription_ends_at
      ? new Date(companySettings.subscription_ends_at)
      : null;

    let totalDays: number | null = null;
    let remainingDays: number | null = null;
    if (startedAt && endsAt) {
      const totalMs = endsAt.getTime() - startedAt.getTime();
      const remainingMs = endsAt.getTime() - new Date().getTime();
      totalDays = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)));
      remainingDays = Math.max(0, Math.round(remainingMs / (1000 * 60 * 60 * 24)));
    }

    const remainingUsers = Math.max(0, planUsage.plan.max_users - planUsage.current_users);
    const remainingProperties = Math.max(0, planUsage.plan.max_properties - planUsage.current_properties);
    const storageLimit = planUsage.plan.max_storage_mb || 0;
    const storageUsed = planUsage.used_storage_mb || 0;
    const storagePercent = storageLimit ? Math.min(100, Math.round((storageUsed / storageLimit) * 100)) : 0;
    const userPercent = Math.min(100, Math.round((planUsage.current_users / planUsage.plan.max_users) * 100));
    const propertyPercent = Math.min(100, Math.round((planUsage.current_properties / planUsage.plan.max_properties) * 100));

    const formatStorage = (mb?: number | null) => {
      if (!mb) return '0 م.ب';
      return mb >= 1024 ? `${(mb / 1024).toLocaleString('ar-SA', { maximumFractionDigits: 1 })} ج.ب` : `${mb.toLocaleString('ar-SA')} م.ب`;
    };

    const portalButton = hasSubscription ? (
      <Button
        icon={<CreditCardOutlined />}
        onClick={async () => {
          try {
            const portal = await createStripePortalSession(`${window.location.origin}/settings`);
            window.location.href = portal.url;
          } catch (e: any) {
            const detail = e?.response?.data?.detail || 'تعذّر فتح بوابة إدارة الفوترة.';
            message.error(detail);
          }
        }}
      >
        إدارة الفوترة
      </Button>
    ) : null;

const planFeatures = (plan: PlanInfo) => {
      const features: string[] = [];
      
if (plan.key === 'starter') {
        features.push('إدارة عقارات وعملاء ومتابعات');
        features.push('CRM كامل');
        features.push('المواعيد والمتابعات');
        features.push('مشاركة العقارات');
        features.push('دعم أساسي');
        features.push(`حتى ${plan.max_users} مستخدمين`);
        features.push(`حتى ${plan.max_properties} عقار`);
        features.push('تخزين 2 ج.ب');
} else if (plan.key === 'business') {
        features.push('إدارة فريق وصلاحيات متقدمة');
        features.push('Subdomain');
        features.push('AI أعلى');
        features.push('تقارير وإحصائيات أفضل');
        features.push('موقع أساسي');
        features.push(`حتى ${plan.max_users} مستخدمين`);
        features.push(`حتى ${plan.max_properties} عقار`);
        features.push('تخزين 10 ج.ب');
} else if (plan.key === 'enterprise') {
        features.push('جميع ميزات مبتدئ واحترافي');
        features.push('تشغيل متكامل للمكتب العقاري');
        features.push('مستخدمين بلا حدود');
        features.push('عقارات بلا حدود');
        features.push('أداء أعلى');
        features.push('دعم مخصص');
        features.push('حلول قابلة للتوسع');
features.push('تخزين 100 ج.ب');
      }
      
      return features;
    };

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 18,
            background: `linear-gradient(135deg, ${palette.accent} 0%, #294231 100%)`,
            boxShadow: '0 18px 40px rgba(41, 66, 49, 0.18)',
            overflow: 'hidden',
          }}
          styles={{ body: { padding: 24 } }}
        >
          <Row gutter={[18, 18]} align="middle">
            <Col xs={24} lg={14}>
              <Space direction="vertical" size={10}>
                <Tag color={hasSubscription ? 'green' : 'gold'} style={{ width: 'fit-content', borderRadius: 999 }}>
                  {hasSubscription ? 'اشتراك مفعّل' : canStartTrial ? 'جاهز للتجربة المجانية' : 'بانتظار اختيار خطة'}
                </Tag>
                <Title level={2} style={{ color: '#fff', margin: 0 }}>
                  {planUsage.plan.name}
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14 }}>
                  {hasSubscription
                    ? `حالة الفوترة: ${companySettings.billing_status || 'غير متوفرة'}${companySettings.cancel_at_period_end ? ' - سيتم الإلغاء نهاية الفترة' : ''}`
                    : companySettings.trial_used
                      ? 'تم استخدام التجربة المجانية. اختر خطة مدفوعة لمتابعة التوسع.'
                      : 'ابدأ التجربة أو اختر الخطة التي تناسب حجم مكتبك.'}
                </Text>
              </Space>
            </Col>
            <Col xs={24} lg={10}>
              <Row gutter={12}>
                <Col span={8}>
                  <Statistic value={remainingUsers} suffix="متبقٍ" title={<span style={{ color: 'rgba(255,255,255,0.72)' }}>المستخدمون</span>} valueStyle={{ color: '#fff' }} />
                </Col>
                <Col span={8}>
                  <Statistic value={remainingProperties} suffix="متبقٍ" title={<span style={{ color: 'rgba(255,255,255,0.72)' }}>العقارات</span>} valueStyle={{ color: '#fff' }} />
                </Col>
                <Col span={8}>
                  <Statistic value={remainingDays ?? 30} suffix="يوم" title={<span style={{ color: 'rgba(255,255,255,0.72)' }}>الفترة</span>} valueStyle={{ color: '#fff' }} />
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card bordered={false} style={{ borderRadius: 16, border: `1px solid ${palette.border}` }}>
              <Space><TeamOutlined style={{ color: palette.accent }} /><Text type="secondary">استخدام الموظفين</Text></Space>
              <Progress percent={userPercent} strokeColor={palette.accent} style={{ marginTop: 12 }} />
              <Text strong>{planUsage.current_users} / {planUsage.plan.max_users}</Text>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} style={{ borderRadius: 16, border: `1px solid ${palette.border}` }}>
              <Space><ApartmentOutlined style={{ color: palette.accent }} /><Text type="secondary">استخدام العقارات</Text></Space>
              <Progress percent={propertyPercent} strokeColor={palette.accent} style={{ marginTop: 12 }} />
              <Text strong>{planUsage.current_properties} / {planUsage.plan.max_properties}</Text>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} style={{ borderRadius: 16, border: `1px solid ${palette.border}` }}>
              <Text type="secondary">التخزين</Text>
              <Progress percent={storagePercent} strokeColor={palette.accent} style={{ marginTop: 12 }} />
              <Text strong>{formatStorage(storageUsed)} / {formatStorage(storageLimit)}</Text>
            </Card>
          </Col>
        </Row>

        <Card
          bordered={false}
          style={{ borderRadius: 18, border: `1px solid ${palette.border}` }}
          title={<Space><CrownOutlined /> الخطط المتاحة</Space>}
          extra={portalButton}
        >
          <Row gutter={[16, 16]}>
{PLANS.map((plan) => {
              const isCurrent = plan.key === effectiveSubscribedPlanKey;
              const canStartTrialForThisPlan = canStartTrial && plan.key === 'starter';
              return (
                <Col xs={24} lg={8} key={plan.key}>
                  <Card
                    bordered={false}
                    style={{
                      minHeight: 360,
                      borderRadius: 18,
border: `1px solid ${isCurrent ? palette.accent : plan.key === 'business' ? '#c9b16a' : plan.key === 'enterprise' ? '#8b5cf6' : palette.border}`,
                      background: plan.key === 'business' ? 'linear-gradient(180deg, #fffdf5 0%, #ffffff 52%)' : plan.key === 'enterprise' ? 'linear-gradient(180deg, #f5f3ff 0%, #ffffff 52%)' : '#fff',
                      boxShadow: isCurrent || plan.key === 'business' || plan.key === 'enterprise' ? '0 18px 34px rgba(41, 66, 49, 0.12)' : '0 8px 20px rgba(41, 66, 49, 0.06)',
                    }}
                    styles={{ body: { display: 'flex', flexDirection: 'column', gap: 18, height: '100%' } }}
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
<Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Title level={4} style={{ margin: 0, color: palette.text }}>{plan.name}</Title>
                        {isCurrent ? <Tag color="green">الحالية</Tag> : plan.key === 'business' ? <Tag color="gold">الأكثر استخدامًا</Tag> : plan.key === 'enterprise' ? <Tag color="purple">للشركات</Tag> : null}
                      </Space>
<div>
                        <Text strong style={{ fontSize: 34, color: palette.text }}>
                          {plan.price_monthly_sar?.toLocaleString('ar-SA')}
                        </Text>
                        <Text type="secondary"> ر.س / شهر</Text>
                      </div>
                      {plan.description && (
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          {plan.description}
                        </Text>
                      )}
                    </Space>

                    <Space direction="vertical" size={10} style={{ flex: 1 }}>
                      {planFeatures(plan).map((feature) => (
                        <Space key={feature} align="start">
                          <CheckCircleOutlined style={{ color: palette.accent, marginTop: 3 }} />
                          <Text>{feature}</Text>
                        </Space>
                      ))}
                    </Space>

                    <Button
                      type={isCurrent ? 'default' : 'primary'}
                      block
                      size="large"
                      disabled={isCurrent && hasSubscription}
style={{
                        borderRadius: 12,
                        background: isCurrent ? undefined : plan.key === 'enterprise' ? '#8b5cf6' : palette.accent,
                      }}
                      onClick={async () => {
                        if (canStartTrialForThisPlan) {
                          try {
                            const updatedCompany = await startFreeTrial(plan.key);
                            setCompanySettings(updatedCompany);
                            const overview = await getSettingsOverview();
                            setPlanUsage(overview.plan_usage);
                            message.success('تم تفعيل الشهر المجاني بنجاح.');
                          } catch (e: any) {
                            const detail = e?.response?.data?.detail || 'تعذّر بدء التجربة المجانية.';
                            message.error(detail);
                          }
                          return;
                        }
                        navigate(`/billing/checkout?plan=${plan.key}`);
                      }}
                    >
                      {isCurrent && hasSubscription ? 'الخطة الحالية' : canStartTrialForThisPlan ? 'ابدأ الشهر المجاني' : 'اختيار الخطة'}
                    </Button>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>

        <Card bordered={false} style={{ borderRadius: 18, border: `1px solid ${palette.border}` }}>
          <Tabs
            defaultActiveKey={hasSubscription ? 'status' : 'limits'}
            items={[
              {
                key: 'status',
                label: 'حالة الاشتراك',
                children: (
                  <Descriptions bordered column={1} size="middle">
                    <Descriptions.Item label="الخطة الحالية">{planUsage.plan.name} ({planUsage.plan.key})</Descriptions.Item>
                    <Descriptions.Item label="مدة الاشتراك">{totalDays != null ? `${totalDays} يوم` : 'اشتراك شهري'}</Descriptions.Item>
                    <Descriptions.Item label="تاريخ التفعيل">{startedAt ? startedAt.toLocaleString('ar-SA') : 'غير متوفر'}</Descriptions.Item>
                    <Descriptions.Item label="تاريخ الانتهاء">{endsAt ? endsAt.toLocaleString('ar-SA') : 'غير متوفر'}</Descriptions.Item>
                    <Descriptions.Item label="الوقت المتبقي">{remainingDays != null ? `${remainingDays} يوم تقريبا` : 'غير متوفر'}</Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'limits',
                label: 'الحدود والاستخدام',
                children: (
                  <Text type="secondary">
                    عند تجاوز حدود الخطة، سيتم إيقاف الإضافة الجديدة حتى تتم الترقية. الحدود الحالية: {planUsage.plan.max_users} مستخدم، {planUsage.plan.max_properties} عقار، وتخزين {formatStorage(planUsage.plan.max_storage_mb)}.
                  </Text>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    );
  };

  const renderSubdomainSection = () => (
    <>
      <Card bordered={false} style={{ marginBottom: 16, borderRadius: 18, border: `1px solid ${palette.border}` }}>
        <Title level={4} style={{ color: palette.text }}>السب دومين</Title>
        <Text type="secondary">
          يمكنك ربط مكتبك برابط مخصص مثل: <Text code>company.platform.com</Text>
        </Text>
        <div style={{ marginTop: 16, maxWidth: 400, display: 'flex', gap: 8 }}>
          <Input
            placeholder="اسم المكتب"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            disabled={!planUsage.plan.allow_custom_subdomain}
          />
          <span style={{ alignSelf: 'center' }}>.platform.com</span>
        </div>
        {!planUsage.plan.allow_custom_subdomain && (
          <div style={{ marginTop: 8 }}>
            <Text type="warning">
              تغيير السب دومين متاح في الخطط المدفوعة. يمكنك ترقية خطتك من قسم "الخطط والاشتراكات".
            </Text>
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button onClick={handleCheckSubdomain} loading={checkingSubdomain} disabled={!planUsage.plan.allow_custom_subdomain}>
            تحقق من التوفر
          </Button>
          <Button type="primary" onClick={handleSaveSubdomain} disabled={!planUsage.plan.allow_custom_subdomain}>
            حفظ السب دومين
          </Button>
        </div>
        {subdomainStatus && (
          <div style={{ marginTop: 12 }}>
            <Text type={subdomainStatus.ok ? 'success' : 'danger'}>{subdomainStatus.message}</Text>
          </div>
        )}
      </Card>
      <Modal
        title="تأكيد حفظ السب دومين"
        open={subdomainModalVisible}
        onCancel={() => setSubdomainModalVisible(false)}
        onOk={confirmSaveSubdomain}
        okText="تأكيد"
        cancelText="إلغاء"
      >
        <Space direction="vertical">
          <Text>
            سيتم حجز السب دومين التالي:
          </Text>
          <Text code>
            {subdomain || 'example'}.platform.com
          </Text>
          <Text type="secondary">
            لاحقًا يمكن ربط هذا السب دومين مع Cloudflare أو مزود DNS الخاص بك.
          </Text>
        </Space>
      </Modal>
    </>
  );

  const renderAccountSection = () => (
    <Card bordered={false} style={{ borderRadius: 18, border: `1px solid ${palette.border}` }}>
      <Title level={4} style={{ color: palette.text }}>إعدادات الحساب</Title>
      <Form
        layout="vertical"
        form={accountForm}
        onFinish={handleSaveAccount}
        initialValues={{
          company_name: companySettings.company_name,
          official_email: companySettings.official_email,
          contact_phone: companySettings.contact_phone,
          logo_url: companySettings.logo_url,
        }}
      >
        <Form.Item label="اسم الشركة" name="company_name">
          <Input placeholder="مثال: مكتب الصفوة للعقارات" />
        </Form.Item>
        {/* حقل مخفي لتخزين رابط الشعار ضمن قيم الفورم */}
        <Form.Item name="logo_url" style={{ display: 'none' }}>
          <Input type="hidden" />
        </Form.Item>
        <Form.Item shouldUpdate label="شعار الشركة">
          {() => {
            const logoUrl = accountForm.getFieldValue('logo_url') as string | undefined;
            return (
              <>
                {logoUrl && (
                  <div style={{ marginBottom: 8 }}>
                    <Avatar
                      src={resolveMediaUrl(logoUrl)}
                      size={64}
                      alt="شعار الشركة"
                      style={{ borderRadius: 8 }}
                    />
                  </div>
                )}
                <Upload
                  showUploadList={false}
                  beforeUpload={async (file) => {
                    try {
                      const url = await uploadFile(file as File);
                      accountForm.setFieldsValue({ logo_url: url });
                      message.success('تم رفع الشعار بنجاح.');
                    } catch {
                      message.error('فشل في رفع الشعار، حاول مرة أخرى.');
                    }
                    // منع الرفع التلقائي من Ant Design، لأننا نرفع بأنفسنا عبر API
                    return false;
                  }}
                  maxCount={1}
                >
                  <Button icon={<UploadOutlined />}>رفع الشعار (اختياري)</Button>
                </Upload>
                <Text type="secondary">سيتم عرض هذا الشعار في صفحة العرض العامة للعملاء.</Text>
              </>
            );
          }}
        </Form.Item>
        <Form.Item label="البريد الرسمي" name="official_email">
          <Input placeholder="info@company.com" />
        </Form.Item>
        <Form.Item label="رقم التواصل" name="contact_phone">
          <Input placeholder="+9665xxxxxxxx" />
        </Form.Item>
<Form.Item label="البريد المسجل في النظام">
          <Input value={currentUser?.email} disabled />
        </Form.Item>
        <Form.Item label="اسم المستخدم (يُستخدم في الملاحظات)">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="أدخل اسمك لعرضه في الملاحظات"
          />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            onClick={handleSaveDisplayName}
            loading={savingDisplayName}
          >
            حفظ اسم المستخدم
          </Button>
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={savingAccount}
            style={{ borderRadius: 10, background: palette.accent }}
          >
            حفظ إعدادات الشركة
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );

  const renderUsersSection = () => (
    <Card bordered={false} style={{ borderRadius: 18, border: `1px solid ${palette.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          المستخدمون والموظفون
        </Title>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          disabled={!companySettings.is_subscribed}
          onClick={() => {
            if (!companySettings.is_subscribed) {
              message.error('لا يمكنك إضافة موظفين قبل الاشتراك في إحدى الخطط. يرجى تفعيل الاشتراك من تبويب "الخطط والاشتراكات".');
              return;
            }
            setEditingEmployee(null);
            employeeForm.resetFields();
            employeeForm.setFieldsValue({
              role: 'employee',
              can_add_property: true,
              can_edit_property: true,
              can_delete_property: false,
              can_manage_files: true,
              status: 'active',
            });
            setIsEmployeeModalVisible(true);
          }}
        >
          إضافة موظف
        </Button>
      </div>
      <Table
        columns={userColumns}
        dataSource={teamUsers}
        rowKey="id"
        pagination={false}
      />
      <div style={{ marginTop: 16 }}>
        <Text type="secondary">
          سيتم ربط عدد الموظفين المسموحين بخطتك الحالية، ولن يُسمح بإضافة موظفين جدد عند تجاوز الحد أو قبل تفعيل الاشتراك.
        </Text>
      </div>

      <Modal
        title={editingEmployee ? 'تعديل الموظف' : 'إضافة موظف جديد'}
        open={isEmployeeModalVisible}
        onCancel={() => setIsEmployeeModalVisible(false)}
        onOk={async () => {
          try {
            const values = await employeeForm.validateFields();
            const selectedRole = values.role || 'employee';
            const permissions = {
              can_add_property: selectedRole === 'manager' ? true : values.can_add_property,
              can_edit_property: selectedRole === 'manager' ? true : values.can_edit_property,
              can_delete_property: selectedRole === 'manager' ? true : values.can_delete_property,
              can_manage_files: selectedRole === 'manager' ? true : values.can_manage_files,
            };

if (editingEmployee) {
              const updated = await updateEmployeeUser(editingEmployee.id, {
                status: values.status,
                role: selectedRole,
                permissions,
                display_name: values.display_name || undefined,
              });
              setTeamUsers((prev) =>
                prev.map((u) =>
                  u.id === updated.id
                    ? {
                        ...u,
                        role: updated.role,
                        status: updated.status,
                        permissions: updated.permissions,
                        display_name: updated.display_name,
                      }
                    : u,
                ),
              );
              message.success('تم تحديث بيانات الموظف بنجاح.');
            } else {
              const created = await createEmployeeUser({
                email: values.email,
                password: values.password || '',
                role: selectedRole,
                permissions,
                display_name: values.display_name || undefined,
              });
              setTeamUsers((prev) => [...prev, created]);
              message.success('تم إضافة الموظف بنجاح.');
            }
            setIsEmployeeModalVisible(false);
          } catch (e: any) {
            if (e?.errorFields) {
              // validation error
              return;
            }
            const detail = e?.response?.data?.detail;
            if (detail) {
              message.error(detail);
            } else {
              message.error('فشل في حفظ بيانات الموظف.');
            }
          }
        }}
        okText="حفظ"
        cancelText="إلغاء"
      >
        <Form
          layout="vertical"
          form={employeeForm}
        >
<Form.Item
            label="البريد الإلكتروني"
            name="email"
            rules={[{ required: true, message: 'الرجاء إدخال بريد الموظف.' }]}
          >
            <Input disabled={!!editingEmployee} />
          </Form.Item>
          {!editingEmployee && (
            <Form.Item
              label="كلمة المرور"
              name="password"
              rules={[{ required: true, message: 'الرجاء إدخال كلمة مرور للموظف.' }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item
            label="اسم الموظف (يظهر في الملاحظات)"
            name="display_name"
          >
            <Input placeholder="أدخل اسم الموظف لعرضه في الملاحظات" />
          </Form.Item>
          <Form.Item
            label="نوع المستخدم"
            name="role"
            rules={[{ required: true, message: 'الرجاء اختيار نوع المستخدم.' }]}
          >
            <Select
              options={[
                { value: 'employee', label: 'موظف' },
                { value: 'manager', label: 'مدير' },
              ]}
              onChange={(value) => {
                if (value === 'manager') {
                  employeeForm.setFieldsValue({
                    can_add_property: true,
                    can_edit_property: true,
                    can_delete_property: true,
                    can_manage_files: true,
                  });
                }
              }}
            />
          </Form.Item>
          {editingEmployee && (
            <Form.Item label="حالة الموظف" name="status">
              <Input disabled value={employeeForm.getFieldValue('status') === 'active' ? 'نشط' : 'موقوف'} />
            </Form.Item>
          )}

          <Title level={5} style={{ marginTop: 8 }}>
            صلاحيات الموظف
          </Title>
          {isManagerRoleSelected && (
            <Text type="secondary">
              المدير يملك جميع صلاحيات التشغيل تلقائيا، ولا يمكنه الدخول إلى الإعدادات أو الفوترة.
            </Text>
          )}
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>إضافة عقار</Text>
              <Form.Item name="can_add_property" noStyle valuePropName="checked">
                <Switch disabled={isManagerRoleSelected} />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>تعديل العقارات</Text>
              <Form.Item name="can_edit_property" noStyle valuePropName="checked">
                <Switch disabled={isManagerRoleSelected} />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>حذف العقارات</Text>
              <Form.Item name="can_delete_property" noStyle valuePropName="checked">
                <Switch disabled={isManagerRoleSelected} />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>إدارة الملفات (رفع / حذف المرفقات)</Text>
              <Form.Item name="can_manage_files" noStyle valuePropName="checked">
                <Switch disabled={isManagerRoleSelected} />
              </Form.Item>
            </div>
          </Space>
        </Form>
      </Modal>
    </Card>
  );

  const renderRolesSection = () => (
    <Card bordered={false} style={{ borderRadius: 18, border: `1px solid ${palette.border}` }}>
      <Title level={4} style={{ color: palette.text }}>الأدوار والصلاحيات</Title>
      <Card type="inner" title="مالك الحساب (Owner)" style={{ marginBottom: 16, borderRadius: 14 }}>
        <Text>يملك جميع الصلاحيات في النظام: إدارة الخطط، الإعدادات، العقارات، الملفات، والمستخدمين.</Text>
      </Card>
      <Card type="inner" title="الموظفون (Employees)" style={{ borderRadius: 14 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>إضافة عقار</Text>
            <Switch defaultChecked disabled />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>تعديل العقارات</Text>
            <Switch defaultChecked disabled />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>حذف العقارات</Text>
            <Switch disabled />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>إدارة الملفات (رفع / حذف المرفقات)</Text>
            <Switch defaultChecked disabled />
          </div>
          <Text type="secondary">
            لاحقًا يمكن ربط هذه الخيارات بصلاحيات حقيقية في الباك إند للتحكم في ما يمكن للموظف القيام به.
          </Text>
        </Space>
      </Card>
    </Card>
  );

  const renderBillingSection = () => (
    <Card bordered={false} style={{ borderRadius: 18, border: `1px solid ${palette.border}` }}>
      <Title level={4} style={{ color: palette.text }}>الفوترة</Title>
      <Space align="start" direction="vertical" style={{ width: '100%' }}>
        <Space align="start">
          <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <Text type="secondary">
            إدارة الإلغاء، الترقية، التخفيض، وتحديث وسيلة الدفع تتم من بوابة Stripe الرسمية.
          </Text>
        </Space>
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="الخطة الحالية">
            {planUsage.plan.name} ({planUsage.plan.key})
          </Descriptions.Item>
          <Descriptions.Item label="حالة الفوترة">
            {companySettings.billing_status || 'غير متوفر'}
            {companySettings.cancel_at_period_end ? ' - سيتم الإلغاء نهاية الفترة' : ''}
          </Descriptions.Item>
        </Descriptions>
        <Button
          type="primary"
          onClick={async () => {
            try {
              const portal = await createStripePortalSession(
                `${window.location.origin}/settings`,
              );
              window.location.href = portal.url;
            } catch (e: any) {
              const detail =
                e?.response?.data?.detail || 'تعذّر فتح بوابة إدارة الفوترة.';
              message.error(detail);
            }
          }}
        >
          فتح بوابة Stripe لإدارة الفوترة
        </Button>
      </Space>
    </Card>
  );

  const renderSection = () => {
    switch (section) {
      case 'plans':
        return renderPlansSection();
      case 'account':
        return renderAccountSection();
      case 'subdomain':
        return renderSubdomainSection();
      case 'users':
        return renderUsersSection();
      case 'roles':
        return renderRolesSection();
      case 'billing':
        return renderBillingSection();
      default:
        return null;
    }
  };

  return (
    <Layout className="dashboard-light" style={{ minHeight: '100vh', direction: 'rtl', background: palette.pageBg, padding: 14 }}>
      <Sider
        width={276}
        style={{
          background: palette.surface,
          borderLeft: `1px solid ${palette.border}`,
          borderRadius: 20,
          overflowY: 'auto',
          position: 'sticky',
          top: 14,
          alignSelf: 'flex-start',
          height: 'calc(100vh - 28px)',
          zIndex: 20,
        }}
      >
        <div style={{ padding: '20px 18px 16px', borderBottom: `1px solid ${palette.border}` }}>
          <Space direction="vertical" size={4}>
            <Avatar style={{ background: palette.accent, color: '#fff' }} icon={<SettingOutlined />} />
            <Title level={4} style={{ margin: 0, color: palette.text }}>
            إعدادات المنصة
            </Title>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              مركز تحكم مكتبك وفريقك واشتراكك
            </Text>
          </Space>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[section]}
          style={{ borderInlineEnd: 'none', background: 'transparent', padding: '12px 8px' }}
          onClick={(e) => {
            if (e.key === 'dashboard') {
              navigate('/app');
              return;
            }
            setSection(e.key as SettingsSectionKey);
          }}
          items={[
            { key: 'dashboard', icon: <HomeOutlined />, label: 'لوحة التحكم' },
            { key: 'plans', icon: <CrownOutlined />, label: 'الخطط والاشتراكات' },
            { key: 'account', icon: <SettingOutlined />, label: 'إعدادات الحساب' },
            { key: 'subdomain', icon: <LinkOutlined />, label: 'السب دومين' },
            { key: 'users', icon: <TeamOutlined />, label: 'المستخدمون والموظفون' },
            { key: 'roles', icon: <SafetyCertificateOutlined />, label: 'الأدوار والصلاحيات' },
            { key: 'billing', icon: <CreditCardOutlined />, label: 'الفوترة' },
          ]}
        />
        <div style={{ marginTop: 'auto', padding: 14 }}>
          <Card bordered={false} style={{ borderRadius: 16, background: palette.accentSoft }}>
            <Space direction="vertical" size={4}>
              <Text strong style={{ color: palette.text }}>{companySettings.company_name || 'مكتبك العقاري'}</Text>
              <Text style={{ color: palette.muted, fontSize: 12 }}>{currentUser?.email || 'حساب المنصة'}</Text>
            </Space>
          </Card>
        </div>
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        <Content style={{ padding: '0 18px 18px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
          <Card
            bordered={false}
            style={{
              borderRadius: 20,
              marginBottom: 16,
              border: `1px solid ${palette.border}`,
              boxShadow: '0 10px 24px rgba(41,66,49,0.07)',
            }}
            styles={{ body: { padding: '18px 20px' } }}
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center" wrap>
              <Space align="center" size={12}>
                <Avatar size={44} style={{ background: palette.accentSoft, color: palette.accent }} icon={sectionMeta[section].icon} />
                <div>
                  <Title level={3} style={{ margin: 0, color: palette.text }}>
                    {sectionMeta[section].title}
                  </Title>
                  <Text style={{ color: palette.muted }}>{sectionMeta[section].description}</Text>
                </div>
              </Space>
              <Button onClick={handleBackToApp} icon={<ArrowRightOutlined />}>
                العودة للمنصة
              </Button>
            </Space>
          </Card>
          <div>
            {renderSection()}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default SettingsPage;
