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
  Switch,
  Modal,
  Space,
  Avatar,
  Tabs,
} from 'antd';
import { UploadOutlined, ArrowRightOutlined, UserAddOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import {
  getCurrentUser,
  updateMyGeminiKey,
  getSettingsOverview,
  updateCompanySettings,
  checkSubdomainAvailability,
  updateSubdomain,
  createEmployeeUser,
  updateEmployeeUser,
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

const PLANS: PlanInfo[] = [
  {
    key: 'starter',
    name: 'خطة المكاتب الصغيرة',
    max_users: 3,
    max_properties: 100,
    max_storage_mb: 2048,
    allow_custom_subdomain: false,
    price_monthly_sar: 99,
  },
  {
    key: 'business',
    name: 'خطة المكاتب المتوسطة',
    max_users: 10,
    max_properties: 500,
    max_storage_mb: 10240,
    allow_custom_subdomain: true,
    price_monthly_sar: 249,
  },
  {
    key: 'enterprise',
    name: 'خطة الشركات',
    max_users: 50,
    max_properties: 5000,
    max_storage_mb: 102400,
    allow_custom_subdomain: true,
    price_monthly_sar: 799,
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
  const [savingGemini, setSavingGemini] = useState(false);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [subdomain, setSubdomain] = useState<string>('');
  const [subdomainStatus, setSubdomainStatus] = useState<null | { ok: boolean; message: string }>(null);
  const [subdomainModalVisible, setSubdomainModalVisible] = useState(false);
  const [isEmployeeModalVisible, setIsEmployeeModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<TeamUser | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const [accountForm] = Form.useForm<CompanySettings & { gemini_api_key?: string }>();
  const [employeeForm] = Form.useForm<{
    email: string;
    password?: string;
    can_add_property: boolean;
    can_edit_property: boolean;
    can_delete_property: boolean;
    can_manage_files: boolean;
    status?: 'active' | 'disabled';
  }>();

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);

        const overview = await getSettingsOverview();
        setPlanUsage(overview.plan_usage);
        setCompanySettings(overview.company);
        setTeamUsers(overview.team);
        setSubdomain(overview.company.subdomain || '');
        setSelectedPlanKey(null);

        accountForm.setFieldsValue({
          company_name: overview.company.company_name,
          official_email: overview.company.official_email,
          contact_phone: overview.company.contact_phone,
          logo_url: overview.company.logo_url,
          gemini_api_key: user.gemini_api_key || '',
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

  const handleSaveGeminiKey = async () => {
    try {
      const gemini_api_key = accountForm.getFieldValue('gemini_api_key') || '';
      setSavingGemini(true);
      const user = await updateMyGeminiKey(gemini_api_key || null);
      setCurrentUser(user);
      message.success('تم تحديث مفتاح Gemini بنجاح.');
    } catch (error: any) {
      const detail = error?.response?.data?.detail || 'فشل في تحديث مفتاح Gemini.';
      message.error(`خطأ: ${detail}`);
    } finally {
      setSavingGemini(false);
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
      title: 'الدور',
      dataIndex: 'role',
      key: 'role',
      render: (role: TeamUser['role']) => (
        <Tag color={role === 'owner' ? 'gold' : 'blue'}>
          {role === 'owner' ? 'مالك الحساب' : 'موظف'}
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
                status: record.status,
                can_add_property: perms.can_add_property ?? true,
                can_edit_property: perms.can_edit_property ?? true,
                can_delete_property: perms.can_delete_property ?? false,
                can_manage_files: perms.can_manage_files ?? true,
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
    const previewPlanKey = selectedPlanKey || effectiveSubscribedPlanKey;
    const isSameAsSubscribed =
      !!companySettings.is_subscribed && previewPlanKey === effectiveSubscribedPlanKey;

    const hasSubscription = !!companySettings.is_subscribed;

    // حساب قيم تبويب حالة الاشتراك
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

    const remainingUsers =
      planUsage.plan.max_users - planUsage.current_users > 0
        ? planUsage.plan.max_users - planUsage.current_users
        : 0;
    const remainingProperties =
      planUsage.plan.max_properties - planUsage.current_properties > 0
        ? planUsage.plan.max_properties - planUsage.current_properties
        : 0;

    const plansContent = (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            الخطط والاشتراكات
          </Title>
          {/* الزر يظهر إذا لم يكن الحساب مشتركاً، أو إذا اختار المالك خطة مختلفة عن الخطة المشترَك فيها */}
          {!isSameAsSubscribed && (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => {
                // بعد اختيار الخطة الحالية، هذا الزر ينقل المالك إلى صفحة الدفع
                // نمرر الخطة الحالية في كويري سترنج للاستخدام في صفحة الدفع
                navigate(`/billing/checkout?plan=${previewPlanKey}`);
              }}
            >
              اشترك الآن لتفعيل الحساب
            </Button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {PLANS.map((plan) => {
            const isCurrent = plan.key === previewPlanKey;
            return (
              <Card
                key={plan.key}
                style={{
                  width: 260,
                  borderColor: isCurrent ? '#1890ff' : undefined,
                }}
                title={plan.name}
                extra={
                  plan.price_monthly_sar != null ? (
                    <Text strong>
                      {plan.price_monthly_sar.toLocaleString('ar-SA')} ر.س / شهر
                    </Text>
                  ) : null
                }
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>حتى {plan.max_users} مستخدم</Text>
                  <Text>حتى {plan.max_properties} عقار</Text>
                  {plan.max_storage_mb && (
                    <Text>تخزين حتى {(plan.max_storage_mb / 1024).toFixed(1)} جيجابايت تقريبًا</Text>
                  )}
                  <Text>
                    سب دومين مخصص:{' '}
                    <Text strong type={plan.allow_custom_subdomain ? 'success' : 'secondary'}>
                      {plan.allow_custom_subdomain ? 'مدعوم' : 'غير متاح في هذه الخطة'}
                    </Text>
                  </Text>
                  <Button
                    type={isCurrent ? 'primary' : 'default'}
                    block
                    disabled={isCurrent}
                    onClick={() => {
                      setSelectedPlanKey(plan.key);
                      message.success(`تم اختيار "${plan.name}" كخطة مستهدفة. أكمل الدفع لتفعيل الاشتراك.`);
                    }}
                  >
                    {isCurrent ? 'الخطة المحددة حالياً' : 'تعيين كخطة حالية'}
                  </Button>
                </Space>
              </Card>
            );
          })}
        </div>

        <Descriptions bordered column={1} size="middle">
          <Descriptions.Item label="الخطة الحالية">
            {planUsage.plan.name} ({planUsage.plan.key}){' '}
            {!companySettings.is_subscribed && <Text type="warning">(غير مفعّلة حتى الآن)</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="عدد الموظفين">
            {planUsage.current_users} / {planUsage.plan.max_users}
          </Descriptions.Item>
          <Descriptions.Item label="عدد العقارات">
            {planUsage.current_properties} / {planUsage.plan.max_properties}
          </Descriptions.Item>
          <Descriptions.Item label="التخزين">
            {planUsage.used_storage_mb ?? 0} / {planUsage.plan.max_storage_mb ?? 0} MB
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={
                  planUsage.plan.max_storage_mb
                    ? Math.min(
                        100,
                        Math.round(((planUsage.used_storage_mb || 0) / planUsage.plan.max_storage_mb) * 100),
                      )
                    : 0
                }
                size="small"
              />
            </div>
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">
            عند تجاوز حدود الخطة (عدد الموظفين أو العقارات أو التخزين)، سيتم إيقاف الإضافة الجديدة حتى تتم الترقية.
          </Text>
        </div>
      </>
    );

    const statusContent = (
      <Card>
        <Descriptions bordered column={1} size="middle">
          <Descriptions.Item label="الخطة الحالية">
            {planUsage.plan.name} ({planUsage.plan.key})
          </Descriptions.Item>
          <Descriptions.Item label="مدة الاشتراك">
            {totalDays != null ? `${totalDays} يوم (اشتراك شهري مبدئي)` : 'اشتراك شهري (30 يوم تقريبًا)'}
          </Descriptions.Item>
          <Descriptions.Item label="تاريخ التفعيل">
            {startedAt ? startedAt.toLocaleString('ar-SA') : 'غير متوفر'}
          </Descriptions.Item>
          <Descriptions.Item label="تاريخ الانتهاء">
            {endsAt ? endsAt.toLocaleString('ar-SA') : 'غير متوفر'}
          </Descriptions.Item>
          <Descriptions.Item label="الوقت المتبقي">
            {remainingDays != null ? `${remainingDays} يوم متبقٍ تقريبًا` : 'غير متوفر'}
          </Descriptions.Item>
          <Descriptions.Item label="عدد الموظفين المستخدم / الحد">
            {planUsage.current_users} / {planUsage.plan.max_users} ({remainingUsers} متبقٍ)
          </Descriptions.Item>
          <Descriptions.Item label="عدد العقارات المستخدم / الحد">
            {planUsage.current_properties} / {planUsage.plan.max_properties} ({remainingProperties} متبقٍ)
          </Descriptions.Item>
        </Descriptions>
      </Card>
    );

    const items = [];
    if (hasSubscription) {
      items.push({
        key: 'status',
        label: 'حالة الاشتراك',
        children: statusContent,
      });
    }
    items.push({
      key: 'plans',
      label: 'الخطط المتاحة',
      children: plansContent,
    });

    return (
      <Card>
        <Tabs defaultActiveKey={hasSubscription ? 'status' : 'plans'} items={items} />
      </Card>
    );
  };

  const renderSubdomainSection = () => (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>السب دومين</Title>
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
    <Card>
      <Title level={4}>إعدادات الحساب</Title>
      <Form
        layout="vertical"
        form={accountForm}
        onFinish={handleSaveAccount}
        initialValues={{
          company_name: companySettings.company_name,
          official_email: companySettings.official_email,
          contact_phone: companySettings.contact_phone,
          logo_url: companySettings.logo_url,
          gemini_api_key: currentUser?.gemini_api_key || '',
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
        <Form.Item label="مفتاح Gemini المرتبط بالحساب" name="gemini_api_key">
          <Input.Password placeholder="ضع أو حدّث مفتاح Gemini الخاص بمكتبك" />
        </Form.Item>
        <Form.Item style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <Button
              type="primary"
              htmlType="submit"
              loading={savingAccount}
              style={{ marginLeft: 8 }}
            >
              حفظ إعدادات الشركة
            </Button>
            <Button onClick={handleSaveGeminiKey} loading={savingGemini}>
              حفظ مفتاح Gemini
            </Button>
          </div>
          <Button onClick={handleBackToApp} icon={<ArrowRightOutlined />}>
            العودة للمنصة
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );

  const renderUsersSection = () => (
    <Card>
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
            const permissions = {
              can_add_property: values.can_add_property,
              can_edit_property: values.can_edit_property,
              can_delete_property: values.can_delete_property,
              can_manage_files: values.can_manage_files,
            };

            if (editingEmployee) {
              const updated = await updateEmployeeUser(editingEmployee.id, {
                status: values.status,
                permissions,
              });
              setTeamUsers((prev) =>
                prev.map((u) =>
                  u.id === updated.id
                    ? {
                        ...u,
                        status: updated.status,
                        permissions: updated.permissions,
                      }
                    : u,
                ),
              );
              message.success('تم تحديث بيانات الموظف بنجاح.');
            } else {
              const created = await createEmployeeUser({
                email: values.email,
                password: values.password || '',
                permissions,
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
          {editingEmployee && (
            <Form.Item label="حالة الموظف" name="status">
              <Input disabled value={employeeForm.getFieldValue('status') === 'active' ? 'نشط' : 'موقوف'} />
            </Form.Item>
          )}

          <Title level={5} style={{ marginTop: 8 }}>
            صلاحيات الموظف
          </Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>إضافة عقار</Text>
              <Form.Item name="can_add_property" noStyle valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>تعديل العقارات</Text>
              <Form.Item name="can_edit_property" noStyle valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>حذف العقارات</Text>
              <Form.Item name="can_delete_property" noStyle valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>إدارة الملفات (رفع / حذف المرفقات)</Text>
              <Form.Item name="can_manage_files" noStyle valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
          </Space>
        </Form>
      </Modal>
    </Card>
  );

  const renderRolesSection = () => (
    <Card>
      <Title level={4}>الأدوار والصلاحيات</Title>
      <Card type="inner" title="مالك الحساب (Owner)" style={{ marginBottom: 16 }}>
        <Text>يملك جميع الصلاحيات في النظام: إدارة الخطط، الإعدادات، العقارات، الملفات، والمستخدمين.</Text>
      </Card>
      <Card type="inner" title="الموظفون (Employees)">
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
    <Card>
      <Title level={4}>الفوترة</Title>
      <Space align="start">
        <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 20 }} />
        <Text type="secondary">
          قسم الفوترة سيتم ربطه لاحقًا مع مزود دفع (مثل Stripe أو بوابات دفع محلية في السعودية) لعرض الفواتير
          وتجديد الاشتراك.
        </Text>
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
    <Layout style={{ minHeight: '100vh', direction: 'rtl' }}>
      <Sider
        width={240}
        style={{ background: '#fff', borderLeft: '1px solid #f0f0f0' }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            إعدادات المنصة
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            إدارة مكتبك العقاري في مكان واحد
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[section]}
          onClick={(e) => {
            if (e.key === 'dashboard') {
              navigate('/app');
              return;
            }
            setSection(e.key as SettingsSectionKey);
          }}
          items={[
            { key: 'dashboard', label: 'لوحة التحكم' },
            { key: 'plans', label: 'الخطط والاشتراكات' },
            { key: 'account', label: 'إعدادات الحساب' },
            { key: 'subdomain', label: 'السب دومين' },
            { key: 'users', label: 'المستخدمون والموظفون' },
            { key: 'roles', label: 'الأدوار والصلاحيات' },
            { key: 'billing', label: 'الفوترة (قريبًا)', disabled: true },
          ]}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ marginBottom: 16 }}>
            <Title level={3} style={{ marginBottom: 4 }}>
              {section === 'plans' && 'الخطط والاشتراكات'}
              {section === 'account' && 'إعدادات الحساب'}
              {section === 'subdomain' && 'إعدادات السب دومين'}
              {section === 'users' && 'المستخدمون والموظفون'}
              {section === 'roles' && 'الأدوار والصلاحيات'}
              {section === 'billing' && 'الفوترة'}
            </Title>
            <Text type="secondary">
              قم بإدارة إعدادات منصتك العقارية بما يناسب احتياج مكتبك في السعودية.
            </Text>
          </div>
          {renderSection()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default SettingsPage;


