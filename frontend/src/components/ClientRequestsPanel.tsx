import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowUpOutlined, DeleteOutlined, FileTextOutlined, SolutionOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { getClientRequests, createClientRequest, createClientProfile, getClientProfilesByType, getTeamUsers, updateClientProfile, deleteClientProfile, deleteClientRequest, type ClientRequest, type ClientProfile, type TeamUser, type UserPublic } from '../services/api';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with plugins
dayjs.extend(duration);
dayjs.extend(relativeTime);

const { Text } = Typography;

type ClientStatus = 'جديد' | 'بحث نشط' | 'تم الإغلاق';
type RequestStatus = 'جديد' | 'بحث نشط' | 'تم الإغلاق';

interface ClientRequestItem {
  id: string;
  title: string;
  status: RequestStatus;
  createdAt: string;
  strategy: string;
}

interface ClientDataType {
  key: string;
  profileId: string;
  clientTypes: string[];
  name: string;
  phone: string;
  lastActivity: string;
  status: ClientStatus;
  ownerEmployee: {
    id?: string | null;
    name: string;
    avatarText: string;
  };
  requests: ClientRequestItem[];
}

interface Props {
  loading?: boolean;
  currentUser?: UserPublic | null;
}

const mapStatus = (value: ClientRequest['status']): RequestStatus => {
  if (value === 'searching') return 'بحث نشط';
  if (value === 'closed') return 'تم الإغلاق';
  return 'جديد';
};

const statusColor = (status: ClientStatus | RequestStatus): string => {
  if (status === 'جديد') return 'blue';
  if (status === 'بحث نشط') return 'orange';
  return 'green';
};

const formatActivity = (iso: string): string => {
  const diffMs = Date.now() - Date.parse(iso);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'الآن';
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
};

const normalizeIdentityPart = (value?: string | null): string => (value || '').trim().toLowerCase();

const profileKey = (profile: ClientProfile): string => (
  `${profile.client_name || 'غير محدد'}|${profile.phone_number || ''}`
);

const getUserDisplayName = (user: TeamUser): string => (
  user.display_name?.trim() || (user.role === 'owner' ? 'مالك الحساب' : user.role === 'manager' ? 'مدير بدون اسم' : 'موظف بدون اسم')
);

const sameClientIdentity = (profile: ClientProfile, row: ClientRequest): boolean => {
  const rowProfileId = (row as ClientRequest & { profile_id?: string | null; client_profile_id?: string | null }).profile_id
    || (row as ClientRequest & { profile_id?: string | null; client_profile_id?: string | null }).client_profile_id;
  if (rowProfileId && rowProfileId === profile.id) return true;

  return normalizeIdentityPart(profile.client_name) === normalizeIdentityPart(row.client_name)
    && normalizeIdentityPart(profile.phone_number) === normalizeIdentityPart(row.phone_number);
};

const mergeProfilesWithRequests = (
  profiles: ClientProfile[],
  rows: ClientRequest[],
  teamUsers: TeamUser[] = [],
): ClientDataType[] => {
  const result: ClientDataType[] = profiles.map((profile) => {
    const requests = rows
      .filter((row) => sameClientIdentity(profile, row))
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

    const latest = requests[0];
    const items: ClientRequestItem[] = requests.map((r) => ({
      id: r.id,
      title: `${r.property_type || 'عقار'} - ${r.city || 'غير محدد'}`,
      status: mapStatus(r.status),
      createdAt: formatActivity(r.created_at),
      strategy: r.action_plan || 'غير محدد',
    }));

    const hasSearching = items.some((i) => i.status === 'بحث نشط');
    const hasNew = items.some((i) => i.status === 'جديد');
    const status: ClientStatus = hasSearching ? 'بحث نشط' : hasNew ? 'جديد' : 'تم الإغلاق';
    const lastActivityAt = latest?.updated_at || profile.updated_at || profile.created_at;
    const assignedUser = teamUsers.find((user) => user.id === profile.assigned_user_id);
    const assignedUserName = assignedUser ? getUserDisplayName(assignedUser) : profile.assigned_user_name || 'غير محدد';

    return {
      key: profileKey(profile),
      profileId: profile.id,
      clientTypes: profile.client_types || [],
      name: profile.client_name || latest?.client_name || 'غير محدد',
      phone: profile.phone_number || latest?.phone_number || 'غير متوفر',
      lastActivity: formatActivity(lastActivityAt),
      status,
      ownerEmployee: {
        id: profile.assigned_user_id,
        name: assignedUserName,
        avatarText: assignedUserName.trim().charAt(0) || '؟',
      },
      requests: items,
    };
  });

  return result.sort((a, b) => b.requests.length - a.requests.length);
};

const ClientRequestsPanel: React.FC<Props> = ({ loading = false, currentUser }) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [clients, setClients] = useState<ClientDataType[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [deletingClientMap, setDeletingClientMap] = useState<Record<string, boolean>>({});
  const canAssignEmployee = currentUser?.role === 'owner' || currentUser?.role === 'manager';

const loadClients = async () => {
    try {
      // Load client requests + profiles with "request" type (for Requests tab)
      const [rawRequestsData, requestProfilesData, teamUsersData] = await Promise.all([
        getClientRequests(),
        getClientProfilesByType('request'),  // Get profiles with request type
        getTeamUsers().catch(() => [] as TeamUser[]),
      ]);
      setTeamUsers(teamUsersData.filter((user) => user.status === 'active'));
      
      setClients(mergeProfilesWithRequests(requestProfilesData, rawRequestsData, teamUsersData));
    } catch {
      message.error('تعذر تحميل الطلبات.');
    }
  };

  const handleAssignEmployee = async (record: ClientDataType, userId: string | null) => {
    const selectedUser = teamUsers.find((user) => user.id === userId);
    setAssigningMap((prev) => ({ ...prev, [record.profileId]: true }));
    try {
      await updateClientProfile(record.profileId, {
        assigned_user_id: selectedUser?.id || null,
        assigned_user_name: selectedUser ? getUserDisplayName(selectedUser) : null,
      });
      message.success('تم تحديث الموظف المسؤول.');
      await loadClients();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تحديث الموظف المسؤول.');
    } finally {
      setAssigningMap((prev) => ({ ...prev, [record.profileId]: false }));
    }
  };

  const handleDeleteClientRequests = async (record: ClientDataType) => {
    setDeletingClientMap((prev) => ({ ...prev, [record.profileId]: true }));
    try {
      await Promise.all(record.requests.map((request) => deleteClientRequest(request.id)));
      const remainingTypes = record.clientTypes.filter((type) => type !== 'request');
      if (remainingTypes.length > 0) {
        await updateClientProfile(record.profileId, { client_types: remainingTypes });
      } else {
        await deleteClientProfile(record.profileId);
      }
      message.success('تم حذف العميل وطلباته.');
      await loadClients();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر حذف العميل.');
    } finally {
      setDeletingClientMap((prev) => ({ ...prev, [record.profileId]: false }));
    }
  };

const handleAddClient = async () => {
    try {
      const values = await form.validateFields();
      setAdding(true);
      
      // Create a persistent client profile with "request" type (independent from requests)
      // This ensures the client persists even if all requests are deleted
      await createClientProfile({
        client_name: values.client_name,
        phone_number: values.phone_number || undefined,
        notes: '',
        client_types: ['request'],  // Mark as request-type client
      });
      
      // Build raw text combining client info and optional AI analysis
      let rawText = `عميل: ${values.client_name}`;
      if (values.phone_number) rawText += ` - جوال: ${values.phone_number}`;
      
      // If user provides AI analysis request, add it
      if (values.raw_text && values.raw_text.trim()) {
        rawText += ` - ${values.raw_text.trim()}`;
      }
      
      await createClientRequest(rawText);
      message.success('تم إضافة الطلب بنجاح.');
      form.resetFields();
      setAddModalOpen(false);
      await loadClients();
    } catch (e: any) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || 'فشل إضافة العميل.');
      }
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter((c) => c.status === 'بحث نشط').length;
    const newRequests = clients.reduce((sum, c) => sum + c.requests.filter((r) => r.status === 'جديد').length, 0);
    return { totalClients, activeClients, newRequests };
  }, [clients]);

  const columns: ColumnsType<ClientDataType> = [
    {
      title: 'العميل',
      dataIndex: 'name',
      key: 'client',
      width: 170,
      render: (_: unknown, record) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <Text
            strong
            style={{ fontSize: 12, cursor: 'pointer', color: '#1677ff' }}
            onClick={() => navigate(`/app/clients/${encodeURIComponent(record.key)}`, { state: { clientSourceTab: 'requests' } })}
          >
            {record.name}
          </Text>
        </Space>
      ),
    },
    {
      title: 'رقم الجوال',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      responsive: ['md'],
      render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
    },
    {
      title: 'آخر نشاط',
      dataIndex: 'lastActivity',
      key: 'lastActivity',
      width: 110,
      responsive: ['lg'],
      render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
    },
    {
      title: 'عدد الطلبات',
      key: 'requestsCount',
      width: 90,
      render: (_: unknown, record) => <Text style={{ fontSize: 12 }}>{record.requests.length}</Text>,
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: ClientStatus) => <Tag color={statusColor(value)} style={{ marginInlineEnd: 0, fontSize: 11 }}>{value}</Tag>,
    },
    {
      title: 'الموظف المسؤول',
      key: 'ownerEmployee',
      width: 120,
      responsive: ['xl'],
      render: (_: unknown, record) => {
        if (!canAssignEmployee) {
          return (
            <Space>
              <Avatar size="small">{record.ownerEmployee.avatarText}</Avatar>
              <Text style={{ fontSize: 12 }}>{record.ownerEmployee.name}</Text>
            </Space>
          );
        }

        const options = teamUsers.map((user) => {
            const name = getUserDisplayName(user);
            return {
              value: user.id,
              label: (
                <Space>
                  <Avatar size="small">{name.trim().charAt(0) || '؟'}</Avatar>
                  <Text style={{ fontSize: 12 }}>{name}</Text>
                </Space>
              ),
            };
          });
        if (record.ownerEmployee.id && !options.some((option) => option.value === record.ownerEmployee.id)) {
          options.unshift({
            value: record.ownerEmployee.id,
            label: (
              <Space>
                <Avatar size="small">{record.ownerEmployee.avatarText}</Avatar>
                <Text style={{ fontSize: 12 }}>{record.ownerEmployee.name}</Text>
              </Space>
            ),
          });
        }

        return (
          <Select
            allowClear
            size="small"
            placeholder="اختر موظف"
            value={record.ownerEmployee.id || undefined}
            loading={!!assigningMap[record.profileId]}
            style={{ width: 150 }}
            onChange={(value) => handleAssignEmployee(record, value || null)}
            options={options}
          />
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record) => (
        <Popconfirm
          title="حذف العميل؟"
          description="سيتم حذف العميل وجميع طلباته."
          okText="حذف"
          cancelText="إلغاء"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDeleteClientRequests(record)}
        >
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            loading={!!deletingClientMap[record.profileId]}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 10, direction: 'rtl', maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic
              title="إجمالي العملاء"
              value={stats.totalClients}
              prefix={<TeamOutlined />}
              valueStyle={{ fontSize: 20 }}
              suffix={<Text style={{ color: '#16a34a', fontSize: 12 }}><ArrowUpOutlined /> 3%</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic
              title="الطلبات النشطة"
              value={stats.activeClients}
              prefix={<SolutionOutlined />}
              valueStyle={{ fontSize: 20 }}
              suffix={<Text style={{ color: '#16a34a', fontSize: 12 }}><ArrowUpOutlined /> 2%</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic
              title="طلبات جديدة"
              value={stats.newRequests}
              prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: 20 }}
              suffix={<Text style={{ color: '#16a34a', fontSize: 12 }}><ArrowUpOutlined /> 4%</Text>}
            />
          </Card>
        </Col>
      </Row>

<Card 
        title=" طلبات العملاء" 
        size="small" 
        styles={{ body: { padding: 10 } }}
        extra={
<Button 
            type="primary" 
            size="small"
            onClick={() => setAddModalOpen(true)}
          >
            + إضافة عميل
          </Button>
        }
      >
<Table<ClientDataType>
          rowKey="key"
          columns={columns}
          dataSource={clients}
          loading={loading}
          size="small"
          scroll={{ x: 760 }}
          pagination={{ pageSize: 6, size: 'small' }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ display: 'grid', gap: 8, padding: '8px 0' }}>
                {record.requests.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>لا توجد طلبات لهذا العميل بعد.</Text>
                ) : (
                  record.requests.map((request) => (
                    <Card key={request.id} size="small" style={{ borderRadius: 10 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <Space wrap style={{ justifyContent: 'space-between' }}>
                          <Text strong>{request.title}</Text>
                          <Tag color={statusColor(request.status)} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                            {request.status}
                          </Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          تاريخ الإضافة: {request.createdAt}
                        </Text>
                        <Text style={{ fontSize: 12 }}>
                          خطة العمل: {request.strategy}
                        </Text>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            ),
          }}
        />
      </Card>

      {/* Add Client Modal */}
<Modal
        open={addModalOpen}
        title="إضافة طلب جديد"
        onCancel={() => {
          setAddModalOpen(false);
          form.resetFields();
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setAddModalOpen(false);
            form.resetFields();
          }}>
            إلغاء
          </Button>,
          <Button key="submit" type="primary" loading={adding} onClick={handleAddClient}>
            إضافة
          </Button>,
        ]}
        style={{ direction: 'rtl' }}
      >
<Form form={form} layout="vertical" dir="rtl">
<div style={{ padding: 12, background: '#f0f5e6', borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>بيانات العميل</Text>
            <Form.Item name="client_name" label="اسم العميل" rules={[{ required: true, message: 'الرجاء إدخال اسم العميل' }]}>
              <Input placeholder="أدخل اسم العميل" style={{ textAlign: 'right', direction: 'rtl' }} />
            </Form.Item>
            <Form.Item name="phone_number" label="رقم الجوال">
              <Input placeholder="05xxxxxxxx" style={{ textAlign: 'right', direction: 'rtl' }} />
            </Form.Item>
          </div>
          
          <div style={{ padding: 12, background: '#eef5ff', borderRadius: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>تحليل الطلب بالذكاء الاصطناعي (اختياري)</Text>
            <Form.Item name="raw_text" label="وصف طلب العميل">
              <Input.TextArea 
                rows={4} 
                placeholder="مثال: ابحث عن شقة في الرياض حي الملقا الميزانية 500,000 إلى 800,000 ريال المساحة 150 إلى 200 متر"
                style={{ textAlign: 'right', direction: 'rtl' }} 
              />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              يمكنك إضافة تفاصيل الطلب لاحقاً من ملف العميل
            </Text>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ClientRequestsPanel;
