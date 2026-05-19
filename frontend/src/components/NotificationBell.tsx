import React from 'react';
import { Badge, Button, Dropdown, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import { BellOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import type { NotificationItem } from '../services/api';

const { Text } = Typography;

const priorityColor = (priority: NotificationItem['priority']): string => {
  if (priority === 'high') return 'red';
  if (priority === 'low') return 'default';
  return 'blue';
};

const formatRelativeTime = (isoDate: string): string => {
  const created = new Date(isoDate).getTime();
  if (!Number.isFinite(created)) return '';
  const diffMs = Date.now() - created;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
};

interface NotificationBellProps {
  items: NotificationItem[];
  unreadCount: number;
  loading?: boolean;
  onMarkAsRead: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenAll: () => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({
  items,
  unreadCount,
  loading = false,
  onMarkAsRead,
  onDelete,
  onMarkAllRead,
  onOpenAll,
}) => {
  const latest = items.slice(0, 6);

  const overlay = (
    <div
      style={{
        width: 370,
        maxWidth: '92vw',
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #e5e7eb',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.16)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text strong>الإشعارات</Text>
        <Space size={6}>
          <Button size="small" type="text" onClick={() => void onMarkAllRead()}>
            تعليم الكل كمقروء
          </Button>
          <Button size="small" type="link" onClick={onOpenAll}>
            عرض الكل
          </Button>
        </Space>
      </div>
      {loading ? (
        <div style={{ padding: 12 }}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      ) : latest.length === 0 ? (
        <div style={{ padding: 16 }}>
          <Empty description="لا توجد إشعارات حالياً" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <List
          size="small"
          dataSource={latest}
          style={{ maxHeight: 420, overflowY: 'auto', padding: '0 8px 8px' }}
          renderItem={(item) => (
            <List.Item
              style={{
                borderRadius: 10,
                padding: '10px 10px',
                background: item.read ? '#fff' : '#f7fbf7',
                marginBottom: 6,
                alignItems: 'flex-start',
              }}
              actions={[
                !item.read ? (
                  <Button
                    key="read"
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() => void onMarkAsRead(item.id)}
                  />
                ) : null,
                <Button
                  key="delete"
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => void onDelete(item.id)}
                />,
              ].filter(Boolean) as React.ReactNode[]}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space size={6} wrap>
                  <Tag color={priorityColor(item.priority)} style={{ marginInlineEnd: 0 }}>
                    {item.priority === 'high' ? 'عالية' : item.priority === 'low' ? 'منخفضة' : 'عادية'}
                  </Tag>
                  {!item.read && <Tag color="green" style={{ marginInlineEnd: 0 }}>جديد</Tag>}
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatRelativeTime(item.created_at)}</Text>
                </Space>
                <Text strong>{item.title}</Text>
                <Text type="secondary">{item.message}</Text>
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown trigger={['click']} popupRender={() => overlay} placement="bottomLeft">
      <Badge count={unreadCount} size="small" overflowCount={99}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          aria-label="الإشعارات"
          style={{ width: 42, height: 42, borderRadius: 13, border: '1px solid #e5e7eb', background: '#fff' }}
        />
      </Badge>
    </Dropdown>
  );
};

export default NotificationBell;
