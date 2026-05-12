
import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Modal,
  Form,
  Input,
  Select as AntSelect,
  Select,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowUpOutlined, CloseOutlined, DeleteOutlined, FileTextOutlined, ShareAltOutlined, TeamOutlined, UserOutlined, EditOutlined } from '@ant-design/icons';
import { getClientOffers, deleteClientOffer, createClientOffer, getProperties, resolveMediaUrl, getClientOfferNotes, createClientOfferNote, deleteClientOfferNote, updateClientOffer, createClientProfile, getClientProfilesByType, getTeamUsers, updateClientProfile, deleteClientProfile, type ClientOffer, type ClientProfile, type Property, type ClientNote, type TeamUser, type UserPublic } from '../services/api';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

type ClientOfferStatus = 'جديد' | ' جاري ' | 'اغلاق';

interface ClientOfferDataType {
  key: string;
  profileId: string;
  clientTypes: string[];
  name: string;
  phone: string;
  lastActivity: string;
  status: ClientOfferStatus;
  ownerEmployee: {
    id?: string | null;
    name: string;
    avatarText: string;
  };
  offers: ClientOfferItem[];
}

interface ClientOfferItem {
  id: string;
  propertyId: string;
  property?: Property;
  status: ClientOfferStatus;
  createdAt: string;
}

interface Props {
  loading?: boolean;
  currentUser?: UserPublic | null;
}

const statusColor = (status: ClientOfferStatus): string => {
  if (status === 'جديد') return 'blue';
  if (status === ' جاري ') return 'orange';
  return 'green';
};

// Helper to map backend status to frontend status
const mapOfferStatus = (backendStatus: string): ClientOfferStatus => {
  if (backendStatus === 'new' || backendStatus === 'active') return 'جديد';
  if (backendStatus === 'working') return ' جاري ';
  // archived, closed, or any other
  return 'اغلاق';
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

const sameClientIdentity = (profile: ClientProfile, row: ClientOffer): boolean => {
  const rowProfileId = (row as ClientOffer & { profile_id?: string | null; client_profile_id?: string | null }).profile_id
    || (row as ClientOffer & { profile_id?: string | null; client_profile_id?: string | null }).client_profile_id;
  if (rowProfileId && rowProfileId === profile.id) return true;

  return normalizeIdentityPart(profile.client_name) === normalizeIdentityPart(row.client_name)
    && normalizeIdentityPart(profile.phone_number) === normalizeIdentityPart(row.phone_number);
};

const mergeProfilesWithOffers = (
  profiles: ClientProfile[],
  rows: ClientOffer[],
  allProperties: Property[],
  teamUsers: TeamUser[] = [],
): ClientOfferDataType[] => {
  const propertyMap = new Map<string, Property>();
  for (const p of allProperties) {
    if (p.id) propertyMap.set(p.id, p);
  }

  const result: ClientOfferDataType[] = profiles.map((profile) => {
    const offers = rows
      .filter((row) => sameClientIdentity(profile, row))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latest = offers[0];

const items: ClientOfferItem[] = offers.map((o) => ({
      id: o.id,
      propertyId: o.property_id,
      // Handle empty property_id (client-only registration without an offer)
      property: o.property_id ? propertyMap.get(o.property_id) : undefined,
      status: mapOfferStatus(o.status),
      createdAt: formatActivity(o.created_at),
    }));

const hasNew = items.some((i) => i.status === 'جديد');
    const hasWorking = items.some((i) => i.status === ' جاري ');
    const status: ClientOfferStatus = hasWorking ? ' جاري ' : hasNew ? 'جديد' : 'اغلاق';
    const lastActivityAt = latest?.created_at || profile.updated_at || profile.created_at;
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
      offers: items,
    };
  });

  return result.sort((a, b) => b.offers.length - a.offers.length);
};

const ClientOffersPanel: React.FC<Props> = ({ loading = false, currentUser }) => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientOfferDataType[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
const [deletingMap, setDeletingMap] = useState<Record<string, boolean>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [deletingClientMap, setDeletingClientMap] = useState<Record<string, boolean>>({});
  const canAssignEmployee = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  // Notes state - per offer
  const [notesMap, setNotesMap] = useState<Record<string, ClientNote[]>>({});
  const [loadingNotesMap, setLoadingNotesMap] = useState<Record<string, boolean>>({});
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesOfferId, setNotesOfferId] = useState<string | null>(null);
const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

const loadData = async () => {
    try {
      // Load client offers + profiles with "offer" type (for Offers tab)
      const [offersData, propertiesData, offerProfilesData, teamUsersData] = await Promise.all([
        getClientOffers(),
        getProperties({}),
        getClientProfilesByType('offer'),  // Get profiles with offer type
        getTeamUsers().catch(() => [] as TeamUser[]),
      ]);
      setAllProperties(propertiesData);
      setTeamUsers(teamUsersData.filter((user) => user.status === 'active'));
      
      setClients(mergeProfilesWithOffers(offerProfilesData, offersData, propertiesData, teamUsersData));
    } catch {
      message.error('تعذر تحميل العروض.');
    }
  };

  const handleAssignEmployee = async (record: ClientOfferDataType, userId: string | null) => {
    const selectedUser = teamUsers.find((user) => user.id === userId);
    setAssigningMap((prev) => ({ ...prev, [record.profileId]: true }));
    try {
      await updateClientProfile(record.profileId, {
        assigned_user_id: selectedUser?.id || null,
        assigned_user_name: selectedUser ? getUserDisplayName(selectedUser) : null,
      });
      message.success('تم تحديث الموظف المسؤول.');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تحديث الموظف المسؤول.');
    } finally {
      setAssigningMap((prev) => ({ ...prev, [record.profileId]: false }));
    }
  };

  const handleDeleteClientOffers = async (record: ClientOfferDataType) => {
    setDeletingClientMap((prev) => ({ ...prev, [record.profileId]: true }));
    try {
      await Promise.all(record.offers.map((offer) => deleteClientOffer(offer.id)));
      const remainingTypes = record.clientTypes.filter((type) => type !== 'offer');
      if (remainingTypes.length > 0) {
        await updateClientProfile(record.profileId, { client_types: remainingTypes });
      } else {
        await deleteClientProfile(record.profileId);
      }
      message.success('تم حذف العميل وعروضه.');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر حذف العميل.');
    } finally {
      setDeletingClientMap((prev) => ({ ...prev, [record.profileId]: false }));
    }
  };

const handleDeleteOffer = async (offerId: string) => {
    setDeletingMap((prev) => ({ ...prev, [offerId]: true }));
    try {
      await deleteClientOffer(offerId);
      message.success('تم حذف العرض.');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل الحذف.');
    } finally {
      setDeletingMap((prev) => ({ ...prev, [offerId]: false }));
    }
};

// Notes functions
  const openNotesModal = async (offerId: string) => {
    // Guard: ensure offerId is valid before attempting to load notes
    if (!offerId || offerId.trim() === '') {
      message.warning('لا يوجد رقم عرض صالح untuk melihat catatan.');
      return;
    }
    setNotesOfferId(offerId);
    setNotesModalOpen(true);
    setLoadingNotesMap((prev) => ({ ...prev, [offerId]: true }));
    try {
      const notes = await getClientOfferNotes(offerId);
      setNotesMap((prev) => ({ ...prev, [offerId]: notes }));
    } catch (e: any) {
      console.error('Error loading notes:', e);
      message.error(e?.response?.data?.detail || 'تعذر تحميل الملاحظات.');
    } finally {
      setLoadingNotesMap((prev) => ({ ...prev, [offerId]: false }));
    }
  };

const handleAddNote = async () => {
    const offerId = notesOfferId;
    const content = newNoteContent.trim();
    
    // Guard: ensure offerId is valid
    if (!offerId || offerId.trim() === '') {
      message.error('رقم العرض غير محدد أو غير صالح.');
      return;
    }
    if (!content) {
      message.warning('يرجى إدخال نص الملاحظة.');
      return;
    }
    
    setSavingNote(true);
    
    try {
      const newNote = await createClientOfferNote(offerId, {
        content: content,
        color: '#cfd6cf',
      });
      
      message.success('تم إضافة الملاحظة.');
      setNewNoteContent('');
      setNotesMap((prev) => ({
        ...prev,
        [offerId]: [newNote, ...(prev[offerId] || [])],
      }));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل إضافة الملاحظة.');
    } finally {
      setSavingNote(false);
    }
  };

const handleDeleteNote = async (noteId: string) => {
    // Guard: ensure offerId is valid
    if (!notesOfferId || notesOfferId.trim() === '') {
      message.error('رقم العرض غير محدد أو غير صالح.');
      return;
    }
    try {
      await deleteClientOfferNote(notesOfferId, noteId);
      message.success('تم حذف الملاحظة.');
      const notes = await getClientOfferNotes(notesOfferId);
      setNotesMap((prev) => ({ ...prev, [notesOfferId]: notes }));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل حذف الملاحظة.');
    }
  };

  // Update offer status
  const handleStatusChange = async (offerId: string, newStatus: ClientOfferStatus) => {
    setSavingMap((prev) => ({ ...prev, [offerId]: true }));
    // Map Arabic status to backend status
    const backendStatus = newStatus === 'جديد' ? 'new' : newStatus === ' جاري ' ? 'working' : 'closed';
    try {
      await updateClientOffer(offerId, { status: backendStatus });
      message.success('تم تحديث الحالة.');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل التحديث.');
    } finally {
      setSavingMap((prev) => ({ ...prev, [offerId]: false }));
    }
  };

const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      
      // Create a persistent client profile with "offer" type (independent from offers)
      // This ensures the client persists even if all offers are deleted
      await createClientProfile({
        client_name: values.client_name,
        phone_number: values.phone_number || undefined,
        notes: '',
        client_types: ['offer'],  // Mark as offer-type client
      });
      
      // If property is selected, create the offer
      if (values.property_id) {
        await createClientOffer({
          client_name: values.client_name,
          phone_number: values.phone_number || undefined,
          property_id: values.property_id,
        });
        message.success('تم إضافة العرض بنجاح. سيبقى الملف حتى لو حذف العرض.');
      } else {
        // Only profile created without offer - shows in Offers tab with count=0
        message.success('تم إضافة العميل بنجاح. سيبقى الملف في قسم العروض.');
      }
      createForm.resetFields();
      setCreateModalOpen(false);
      await loadData();
    } catch (e: any) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || 'فشل إضافة العميل.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleShareProperty = async (p: Property, e: React.MouseEvent) => {
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

  useEffect(() => {
    loadData();
  }, []);

const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter((c) => c.status !== 'اغلاق').length;
    const totalOffers = clients.reduce((sum, c) => sum + c.offers.length, 0);
    return { totalClients, activeClients, totalOffers };
  }, [clients]);

  const columns: ColumnsType<ClientOfferDataType> = [
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
            onClick={() => navigate(`/app/clients/${encodeURIComponent(record.key)}`, { state: { clientSourceTab: 'offers' } })}
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
      title: 'عدد العروض',
      key: 'offersCount',
      width: 110,
      render: (_: unknown, record) => <Text style={{ fontSize: 12 }}>{record.offers.length}</Text>,
    },
{
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: ClientOfferStatus) => (
        <Tag color={statusColor(value)} style={{ marginInlineEnd: 0, fontSize: 11 }}>
          {value}
        </Tag>
      ),
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
          description="سيتم حذف العميل وجميع عروضه."
          okText="حذف"
          cancelText="إلغاء"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDeleteClientOffers(record)}
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
              title="العروض النشطة"
              value={stats.activeClients}
              prefix={<UserOutlined />}
              valueStyle={{ fontSize: 20 }}
              suffix={<Text style={{ color: '#16a34a', fontSize: 12 }}><ArrowUpOutlined /> 2%</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic
              title="إجمالي العروض"
              value={stats.totalOffers}
              prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: 20 }}
              suffix={<Text style={{ color: '#16a34a', fontSize: 12 }}><ArrowUpOutlined /> 4%</Text>}
            />
          </Card>
        </Col>
      </Row>

<Card 
        title="العروض المقدمة من العملاء" 
        size="small" 
        styles={{ body: { padding: 10 } }}
        extra={
          <Button
            type="primary"
            size="small"
            onClick={() => setCreateModalOpen(true)}
          >
            + إضافة عميل
          </Button>
        }
      >
        <Table<ClientOfferDataType>
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
                {record.offers.map((offer) => (
                  <Card
                    key={offer.id}
                    size="small"
                    style={{ borderRadius: 10 }}
                  >
<div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div
                        style={{
                          width: 180,
                          height: 135,
                          borderRadius: 12,
                          overflow: 'hidden',
                          background: '#f1f5f9',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                          cursor: 'pointer',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                        }}
                      >
                        {offer.property?.images && offer.property.images.length > 0 ? (
                          <img
                            src={resolveMediaUrl(offer.property.images[0])}
                            alt="property"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
<FileTextOutlined style={{ fontSize: 48 }} />
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text strong>
                            {offer.property 
                              ? `${offer.property.property_type} - ${offer.property.neighborhood}`
                              : 'بدون عرض بعد'}
                          </Text>
                          <Select
                            value={offer.status}
                            style={{ width: 100 }}
                            size="small"
                            onChange={(val) => handleStatusChange(offer.id, val as ClientOfferStatus)}
                            options={[
                              { value: 'جديد', label: 'جديد' },
                              { value: ' جاري ', label: ' جاري ' },
                              { value: 'اغلاق', label: 'اغلاق' },
                            ]}
                            loading={!!savingMap[offer.id]}
                          />
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {offer.property 
                            ? `${offer.property.city} | ${offer.property.price?.toLocaleString('ar-SA')} ر.س`
                            : 'لم يتم ربط عقار بعد'}
                        </Text>
                        <div style={{ marginTop: 4 }}>
                          <Space size="small">
                            <Button
                              size="small"
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => openNotesModal(offer.id)}
                              style={{ color: '#8c8c8c' }}
                              title="ملاحظات"
                            />
                            <Button
                              size="small"
                              type="text"
                              icon={<ShareAltOutlined />}
                              onClick={(e) => offer.property && handleShareProperty(offer.property, e)}
                              style={{ color: '#3f7d3c' }}
                              disabled={!offer.property?.id}
                              title="مشاركة"
                            />
                            <Popconfirm
                              title="حذف هذا العرض؟"
                              okText="حذف"
                              cancelText="إلغاء"
                              onConfirm={() => handleDeleteOffer(offer.id)}
                            >
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={!!deletingMap[offer.id]} />
                            </Popconfirm>
                          </Space>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ),
            rowExpandable: (record) => record.offers.length > 0,
          }}
        />
      </Card>

<Modal
        open={createModalOpen}
        title="إضافة عرض عقاري"
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
            إضافة
          </Button>,
        ]}
        style={{ direction: 'rtl' }}
      >
        <Form form={createForm} layout="vertical" dir="rtl">
          <Form.Item
            name="client_name"
            label="اسم العميل"
            rules={[{ required: true, message: 'الرجاء إدخال اسم العميل' }]}
          >
            <Input placeholder="أدخل اسم العميل" style={{ textAlign: 'right', direction: 'rtl' }} />
          </Form.Item>
          <Form.Item
            name="phone_number"
            label="رقم الجوال"
          >
            <Input placeholder="05xxxxxxxx" style={{ textAlign: 'right', direction: 'rtl' }} />
          </Form.Item>
<Form.Item
            name="property_id"
            label="العقار المعروض (اختياري)"
          >
            <AntSelect
              placeholder="اختر العقار"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
              options={allProperties
                .filter((p) => p.id)
                .map((p) => ({
                  value: p.id!,
                  label: `${p.property_type} - ${p.neighborhood} (${p.city})`,
                }))}
            />
          </Form.Item>
</Form>
      </Modal>

      {/* Notes Modal for offers */}
      <Modal
        open={notesModalOpen}
        title="ملاحظات العرض"
        onCancel={() => {
          setNotesModalOpen(false);
          setNotesOfferId(null);
          setNewNoteContent('');
        }}
        footer={[
          <Button key="close" type="primary" onClick={() => {
            setNotesModalOpen(false);
            setNotesOfferId(null);
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
          {loadingNotesMap[notesOfferId || ''] ? (
            <Text>جاري تحميل الملاحظات...</Text>
          ) : (notesMap[notesOfferId || ''] || []).length === 0 ? (
            <Text type="secondary">لا توجد ملاحظات لهذا العرض.</Text>
          ) : (
            (notesMap[notesOfferId || ''] || []).map((note) => (
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
                    icon={<CloseOutlined />}
                    style={{ position: 'absolute', top: 8, left: 8 }}
                  />
                </Popconfirm>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ClientOffersPanel;
