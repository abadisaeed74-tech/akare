import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Input, List, Select, Skeleton, Space, Tag, Typography, message } from 'antd';
import { ArrowRightOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../services/api';

const { Text, Title } = Typography;

const dayLabel = (iso: string): string => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'غير محدد';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((today - target) / dayMs);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  return date.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
};

const relativeLabel = (iso: string): string => {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const minutes = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
};

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const pageSize = 20;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications({
        page,
        page_size: pageSize,
        search: search || undefined,
        category,
        unread_only: unreadOnly || undefined,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      message.error('تعذر تحميل الإشعارات.');
    } finally {
      setLoading(false);
    }
  }, [page, category, search, unreadOnly]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const grouped = useMemo(() => {
    const groups: Record<string, NotificationItem[]> = {};
    for (const item of items) {
      const key = dayLabel(item.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [items]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true, read_at: new Date().toISOString() } : item)));
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((prev) => Math.max(prev - 1, 0));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((item) => ({ ...item, read: true, read_at: item.read_at || new Date().toISOString() })));
    message.success('تم تعليم كل الإشعارات كمقروءة.');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f5f2', padding: 18, direction: 'rtl' }}>
      <Card style={{ borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Space direction="vertical" size={2}>
            <Button type="text" icon={<ArrowRightOutlined />} onClick={() => navigate('/app')}>
              العودة للتطبيق
            </Button>
            <Title level={3} style={{ margin: 0 }}>مركز الإشعارات</Title>
            <Text type="secondary">كل إشعارات المنصة مع بحث وفلترة وتعليم كمقروء.</Text>
          </Space>
          <Space wrap>
            <Input.Search
              placeholder="ابحث في العنوان أو الرسالة"
              allowClear
              onSearch={(value) => {
                setPage(1);
                setSearch(value.trim());
              }}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              placeholder="التصنيف"
              style={{ width: 180 }}
              value={category}
              onChange={(value) => {
                setPage(1);
                setCategory(value);
              }}
              options={[
                { value: 'appointments', label: 'المواعيد' },
                { value: 'clients', label: 'العملاء' },
                { value: 'properties', label: 'العقارات' },
                { value: 'billing', label: 'الاشتراكات' },
                { value: 'ai', label: 'الذكاء الاصطناعي' },
                { value: 'system', label: 'النظام' },
              ]}
            />
            <Select
              style={{ width: 160 }}
              value={unreadOnly ? 'unread' : 'all'}
              onChange={(value) => {
                setPage(1);
                setUnreadOnly(value === 'unread');
              }}
              options={[
                { value: 'all', label: 'الكل' },
                { value: 'unread', label: 'غير المقروء' },
              ]}
            />
            <Button onClick={() => void handleMarkAllRead()}>تعليم الكل كمقروء</Button>
          </Space>
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : items.length === 0 ? (
          <Empty description="لا توجد إشعارات مطابقة للفلاتر الحالية." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {Object.entries(grouped).map(([label, dayItems]) => (
              <Card key={label} size="small" title={label} style={{ borderRadius: 12 }}>
                <List
                  dataSource={dayItems}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        !item.read ? (
                          <Button key="read" type="text" icon={<CheckOutlined />} onClick={() => void handleMarkRead(item.id)}>
                            تعليم كمقروء
                          </Button>
                        ) : null,
                        <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={() => void handleDelete(item.id)}>
                          حذف
                        </Button>,
                      ].filter(Boolean)}
                      style={{ alignItems: 'flex-start' }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space wrap size={6}>
                          <Badge status={item.read ? 'default' : 'processing'} text={item.read ? 'مقروء' : 'غير مقروء'} />
                          <Tag color={item.priority === 'high' ? 'red' : item.priority === 'low' ? 'default' : 'blue'}>
                            {item.priority === 'high' ? 'عالية' : item.priority === 'low' ? 'منخفضة' : 'عادية'}
                          </Tag>
                          <Text type="secondary">{relativeLabel(item.created_at)}</Text>
                        </Space>
                        <Text strong>{item.title}</Text>
                        <Text>{item.message}</Text>
                        {item.link ? (
                          <Button type="link" style={{ padding: 0, width: 'fit-content' }} onClick={() => navigate(item.link || '/app')}>
                            فتح الرابط
                          </Button>
                        ) : null}
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            ))}
          </Space>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">إجمالي الإشعارات: {total.toLocaleString('ar-SA')}</Text>
          <Space>
            <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              السابق
            </Button>
            <Text>صفحة {page}</Text>
            <Button disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
              التالي
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default NotificationsPage;
