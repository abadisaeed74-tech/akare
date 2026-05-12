import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Col,
  Row,
  Spin,
  Alert,
  Typography,
  Button,
  Input,
  InputNumber,
  Table,
  Tag,
  Drawer,
  Descriptions,
  Tabs,
  List,
  Space,
  message,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowRightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getCurrentUser,
  getPlatformStats,
  getPlatformOffices,
  getPlatformOfficeDetail,
  platformAdminSubscriptionAction,
  type PlatformStats,
  type PlatformOfficeSummary,
  type PlatformOfficeDetail,
} from '../services/api';

const { Title, Text } = Typography;

const PLATFORM_OWNER_EMAIL = 'abadi.saeed@bynh.sa';

const StatCard: React.FC<{ title: string; value: number; color?: string }> = ({ title, value, color }) => (
  <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e4e7df', boxShadow: '0 10px 24px rgba(41,66,49,0.07)' }}>
    <Text type="secondary">{title}</Text>
    <Title level={2} style={{ margin: '8px 0 0', color: color || '#0f172a' }}>
      {value.toLocaleString('ar-SA')}
    </Title>
  </Card>
);

const PlatformAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [offices, setOffices] = useState<PlatformOfficeSummary[]>([]);
  const [searchText, setSearchText] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<PlatformOfficeSummary | null>(null);
  const [officeDetail, setOfficeDetail] = useState<PlatformOfficeDetail | null>(null);
  const [subscriptionDays, setSubscriptionDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = async () => {
    const [data, officesData] = await Promise.all([
      getPlatformStats(),
      getPlatformOffices(),
    ]);
    setStats(data);
    setOffices(officesData);
  };

  const loadOfficeDetail = async (ownerUserId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await getPlatformOfficeDetail(ownerUserId);
      setOfficeDetail(detail);
      return detail;
    } catch {
      setOfficeDetail(null);
      return null;
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
        const detail = e?.response?.data?.detail || 'فشل في تحميل إحصائيات المنصة.';
        setError(detail);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const filteredOffices = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return offices;
    return offices.filter((o) => {
      const haystack = [
        o.company_name || '',
        o.owner_email || '',
        o.owner_user_id || '',
        o.plan_key || '',
        o.billing_status || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [offices, searchText]);

  const officeColumns: ColumnsType<PlatformOfficeSummary> = [
    {
      title: 'المكتب',
      dataIndex: 'company_name',
      key: 'company_name',
      render: (v: string | null | undefined) => v || 'بدون اسم',
    },
    {
      title: 'إيميل المالك',
      dataIndex: 'owner_email',
      key: 'owner_email',
      render: (v: string | null | undefined) => v || 'غير متوفر',
    },
    {
      title: 'الخطة',
      dataIndex: 'plan_key',
      key: 'plan_key',
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'الاشتراك',
      key: 'is_subscribed',
      render: (_, row) =>
        row.is_subscribed ? (
          <Tag color="green">نشط</Tag>
        ) : (
          <Tag color="red">غير نشط</Tag>
        ),
    },
    {
      title: 'الحالة',
      dataIndex: 'billing_status',
      key: 'billing_status',
      render: (v: string | null | undefined) => <Tag color="blue">{v || 'غير محدد'}</Tag>,
    },
    {
      title: 'العقارات',
      dataIndex: 'total_properties',
      key: 'total_properties',
    },
    {
      title: 'الموظفون',
      dataIndex: 'total_employees',
      key: 'total_employees',
    },
    {
      title: 'إجراءات',
      key: 'actions',
      render: (_, row) => (
        <Button
          size="small"
          onClick={async () => {
            setSelectedOffice(row);
            setDetailOpen(true);
            setOfficeDetail(null);
            setSubscriptionDays(30);
            await loadOfficeDetail(row.owner_user_id);
          }}
        >
          عرض التفاصيل
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ maxWidth: 1100, margin: '24px auto', direction: 'rtl' }}>
        <Alert type="error" message={error || 'تعذر فتح لوحة إدارة المنصة.'} />
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => navigate('/app')}>العودة للوحة التحكم</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', direction: 'rtl', padding: '0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            لوحة مالك المنصة
          </Title>
          <Text type="secondary">نظرة تفصيلية على الحسابات، الاشتراكات، العقارات، والموظفين</Text>
        </div>
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate(-1)}>
          رجوع
        </Button>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="إجمالي الحسابات" value={stats.total_users} />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="إجمالي المكاتب" value={stats.total_offices} />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="إجمالي العقارات" value={stats.total_properties} />
        </Col>

        <Col xs={24} sm={12} md={8}>
          <StatCard title="المكاتب المشتركة" value={stats.subscribed_offices} color="#16a34a" />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="في الفترة التجريبية" value={stats.trialing_offices} color="#2563eb" />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="مكاتب غير مشتركة" value={stats.unsubscribed_offices} color="#dc2626" />
        </Col>

        <Col xs={24} sm={12} md={8}>
          <StatCard title="حسابات الملاك" value={stats.total_owners} />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <StatCard title="حسابات الموظفين" value={stats.total_employees} />
        </Col>
      </Row>

      <Card style={{ marginTop: 16, borderRadius: 16, border: '1px solid #e4e7df', boxShadow: '0 10px 24px rgba(41,66,49,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <Title level={4} style={{ margin: 0 }}>
            حسابات المكاتب
          </Title>
          <Input
            placeholder="بحث باسم المكتب أو إيميل المالك..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 360 }}
            allowClear
          />
        </div>
        <Table
          rowKey="owner_user_id"
          columns={officeColumns}
          dataSource={filteredOffices}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Drawer
        title={selectedOffice?.company_name || 'تفاصيل المكتب'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={920}
        destroyOnClose
      >
        {loadingDetail ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : !officeDetail ? (
          <Alert type="error" message="تعذر تحميل تفاصيل المكتب." />
        ) : (
          <Tabs
            defaultActiveKey="overview"
            items={[
              {
                key: 'overview',
                label: 'معلومات الحساب',
                children: (
                  <>
                    <Card size="small" style={{ marginBottom: 12, borderRadius: 12 }}>
                      <Space wrap>
                        <Text>عدد الأيام:</Text>
                        <InputNumber
                          min={1}
                          max={3650}
                          value={subscriptionDays}
                          onChange={(v) => setSubscriptionDays(Number(v || 1))}
                        />
                        <Button
                          type="primary"
                          loading={actionLoading}
                          style={{ background: '#3f7d3c' }}
                          onClick={async () => {
                            if (!selectedOffice) return;
                            setActionLoading(true);
                            try {
                              await platformAdminSubscriptionAction(selectedOffice.owner_user_id, {
                                action: 'extend',
                                days: subscriptionDays,
                              });
                              await Promise.all([
                                loadDashboardData(),
                                loadOfficeDetail(selectedOffice.owner_user_id),
                              ]);
                              message.success('تم تمديد الاشتراك بنجاح.');
                            } catch (e: any) {
                              message.error(
                                e?.response?.data?.detail || 'تعذر تمديد الاشتراك.',
                              );
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          تمديد الاشتراك
                        </Button>
                        <Button
                          loading={actionLoading}
                          onClick={async () => {
                            if (!selectedOffice) return;
                            setActionLoading(true);
                            try {
                              await platformAdminSubscriptionAction(selectedOffice.owner_user_id, {
                                action: 'grant_free',
                                days: subscriptionDays,
                              });
                              await Promise.all([
                                loadDashboardData(),
                                loadOfficeDetail(selectedOffice.owner_user_id),
                              ]);
                              message.success('تم تفعيل اشتراك مجاني للحساب.');
                            } catch (e: any) {
                              message.error(
                                e?.response?.data?.detail || 'تعذر تفعيل الاشتراك المجاني.',
                              );
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          اشتراك مجاني
                        </Button>
                        <Button
                          danger
                          loading={actionLoading}
                          onClick={async () => {
                            if (!selectedOffice) return;
                            setActionLoading(true);
                            try {
                              await platformAdminSubscriptionAction(selectedOffice.owner_user_id, {
                                action: 'cancel',
                              });
                              await Promise.all([
                                loadDashboardData(),
                                loadOfficeDetail(selectedOffice.owner_user_id),
                              ]);
                              message.success('تم إلغاء الاشتراك لهذا الحساب.');
                            } catch (e: any) {
                              message.error(
                                e?.response?.data?.detail || 'تعذر إلغاء الاشتراك.',
                              );
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          إلغاء الاشتراك
                        </Button>
                      </Space>
                    </Card>

                    <Descriptions bordered column={1} size="small">
                      <Descriptions.Item label="اسم المكتب">
                        {officeDetail.company_name || 'بدون اسم'}
                      </Descriptions.Item>
                      <Descriptions.Item label="إيميل المالك">
                        {officeDetail.owner_email || 'غير متوفر'}
                      </Descriptions.Item>
                      <Descriptions.Item label="إيميل المكتب الرسمي">
                        {officeDetail.official_email || 'غير متوفر'}
                      </Descriptions.Item>
                      <Descriptions.Item label="هاتف المكتب">
                        {officeDetail.contact_phone || 'غير متوفر'}
                      </Descriptions.Item>
                      <Descriptions.Item label="الخطة الحالية">
                        {officeDetail.plan_key}
                      </Descriptions.Item>
                      <Descriptions.Item label="حالة الاشتراك">
                        {officeDetail.is_subscribed ? 'نشط' : 'غير نشط'} ({officeDetail.billing_status || 'غير محدد'})
                      </Descriptions.Item>
                      <Descriptions.Item label="نهاية الاشتراك">
                        {officeDetail.subscription_ends_at
                          ? new Date(officeDetail.subscription_ends_at).toLocaleString('ar-SA')
                          : 'غير محدد'}
                      </Descriptions.Item>
                      <Descriptions.Item label="عدد العقارات">
                        {officeDetail.total_properties}
                      </Descriptions.Item>
                      <Descriptions.Item label="عدد الموظفين">
                        {officeDetail.total_employees}
                      </Descriptions.Item>
                      <Descriptions.Item label="Subdomain">
                        {officeDetail.subdomain || 'غير متوفر'}
                      </Descriptions.Item>
                    </Descriptions>
                  </>
                ),
              },
              {
                key: 'employees',
                label: `الموظفون (${officeDetail.employees.length})`,
                children: (
                  <List
                    dataSource={officeDetail.employees}
                    locale={{ emptyText: 'لا يوجد موظفون لهذا المكتب.' }}
                    renderItem={(emp) => (
                      <List.Item>
                        <List.Item.Meta
                          title={emp.email}
                          description={`الدور: ${emp.role} | الحالة: ${emp.status}`}
                        />
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'properties',
                label: `العقارات (${officeDetail.properties.length})`,
                children: (
                  <Table
                    rowKey={(p) => p.id || `${p.city}-${p.neighborhood}-${p.property_type}`}
                    pagination={{ pageSize: 8 }}
                    dataSource={officeDetail.properties}
                    columns={[
                      { title: 'المدينة', dataIndex: 'city', key: 'city' },
                      { title: 'الحي', dataIndex: 'neighborhood', key: 'neighborhood' },
                      { title: 'النوع', dataIndex: 'property_type', key: 'property_type' },
                      { title: 'المساحة', dataIndex: 'area', key: 'area' },
                      {
                        title: 'السعر',
                        dataIndex: 'price',
                        key: 'price',
                        render: (v: number) => (v ? v.toLocaleString('ar-SA') : 0),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
};

export default PlatformAdminPage;
