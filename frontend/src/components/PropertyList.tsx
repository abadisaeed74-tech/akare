import React, { useState } from 'react';
import { List, Card, Typography, Tag, Empty, Button, Modal, Form, Input, InputNumber, message, Carousel, Image } from 'antd';
import { Property, updateProperty, deleteProperty, deletePropertyByRawText, resolveMediaUrl, type UserPublic } from '../services/api';
import { EyeOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface PropertyListProps {
    properties: Property[];
    loading: boolean;
    onRefresh?: () => void;
    currentUser?: UserPublic | null;
}

const PropertyList: React.FC<PropertyListProps> = ({ properties, loading, onRefresh, currentUser }) => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
    const [detailsProperty, setDetailsProperty] = useState<Property | null>(null);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [form] = Form.useForm();

    const openEditModal = (property: Property) => {
        setEditingProperty(property);
        form.setFieldsValue({
            city: property.city === 'غير مذكور' ? '' : property.city,
            neighborhood: property.neighborhood === 'غير مذكور' ? '' : property.neighborhood,
            property_type: property.property_type === 'غير مذكور' ? '' : property.property_type,
            area: property.area || undefined,
            price: property.price || undefined,
            details: property.details === 'غير مذكور' ? '' : property.details,
            owner_name: property.owner_name === 'غير مذكور' ? '' : property.owner_name,
            owner_contact_number:
                property.owner_contact_number === 'غير مذكور' ? '' : property.owner_contact_number,
            marketer_contact_number:
                property.marketer_contact_number === 'غير مذكور' ? '' : property.marketer_contact_number,
        });
        setIsModalVisible(true);
    };

    const handleModalCancel = () => {
        setIsModalVisible(false);
        setEditingProperty(null);
        form.resetFields();
    };

    const openDetailsModal = (property: Property) => {
        setDetailsProperty(property);
        setIsDetailsModalVisible(true);
    };

    const handleDetailsModalClose = () => {
        setIsDetailsModalVisible(false);
        setDetailsProperty(null);
    };

    const handleUpdate = async () => {
        try {
            const values = await form.validateFields();
            if (!editingProperty || !editingProperty.id) {
                message.error('لا يمكن تعديل هذا العرض لأن المعرّف غير صالح.');
                return;
            }

            await updateProperty(editingProperty.id, values);
            message.success('تم تحديث العرض بنجاح');
            handleModalCancel();
            if (onRefresh) onRefresh();
        } catch (error: any) {
            if (error?.errorFields) {
                return;
            }
            const detail = error?.response?.data?.detail || 'فشل في تحديث العرض.';
            message.error(`خطأ: ${detail}`);
        }
    };

    const canDelete =
        !currentUser ||
        currentUser.role === 'owner' ||
        !!currentUser.permissions?.can_delete_property;

    const canEdit =
        !currentUser ||
        currentUser.role === 'owner' ||
        !!currentUser.permissions?.can_edit_property;

    const handleDelete = async (property: Property) => {
        if (!canDelete) {
            message.error('لا تملك صلاحية حذف العروض العقارية.');
            return;
        }
        Modal.confirm({
            title: 'حذف العرض',
            content: 'هل أنت متأكد من حذف هذا العرض؟ لا يمكن التراجع عن هذه العملية.',
            okText: 'حذف',
            cancelText: 'إلغاء',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    if (property.id) {
                        await deleteProperty(property.id);
                    } else {
                        await deletePropertyByRawText(property.raw_text);
                    }
                    message.success('تم حذف العرض بنجاح');
                    if (onRefresh) onRefresh();
                } catch (error: any) {
                    const detail = error?.response?.data?.detail || 'فشل في حذف العرض.';
                    message.error(`خطأ: ${detail}`);
                }
            },
        });
    };

    const handleShare = async (property: Property) => {
        if (!property.id) {
            message.error('لا يمكن مشاركة عرض بدون معرّف صالح.');
            return;
        }
        const url = `${window.location.origin}/share/${property.id}`;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
                message.success('تم نسخ رابط العرض إلى الحافظة.');
            } else {
                const tempInput = document.createElement('input');
                tempInput.value = url;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                message.success('تم نسخ رابط العرض إلى الحافظة.');
            }
        } catch (e) {
            console.error(e);
            message.error('تعذّر نسخ الرابط، يمكنك نسخه يدويًا من شريط العنوان بعد الفتح.');
        }
    };

    if (loading) {
        return (
            <Card style={{ borderRadius: 16, boxShadow: '0 12px 28px rgba(15,23,42,0.08)' }}>
                <List dataSource={[]} loading={true} />
            </Card>
        );
    }

    if (properties.length === 0) {
        return (
            <Card style={{ borderRadius: 16, boxShadow: '0 12px 28px rgba(15,23,42,0.08)' }}>
                <Empty description="لا توجد عروض عقارية تطابق هذا الفلتر." />
            </Card>
        );
    }

    const formatOrPlaceholder = (value: string | undefined | null) => {
        if (!value || !value.trim()) {
            return 'غير مذكور';
        }
        return value;
    };

    const formatNumberOrPlaceholder = (value: number | undefined | null, suffix?: string) => {
        if (!value || value === 0) {
            return 'غير مذكور';
        }
        return `${value.toLocaleString()}${suffix ? ` ${suffix}` : ''}`;
    };

    const isDark = (typeof document !== 'undefined' && document.body.classList.contains('akare-dark'));
    const actionBtnBaseStyle: React.CSSProperties = {
        borderRadius: 999,
        height: 34,
        width: '100%',
        fontWeight: 600,
    };

    return (
        <>
        <List
            grid={{
                gutter: 16,
                xs: 1,
                sm: 1,
                md: 2,
                lg: 2,
                xl: 3,
                xxl: 4,
            }}
            dataSource={properties}
            renderItem={(property) => (
                <List.Item>
                    <Card
                        title={`${formatOrPlaceholder(property.property_type)} في ${formatOrPlaceholder(property.neighborhood)}`}
                        variant="borderless"
                        style={{
                            boxShadow: '0 10px 24px rgba(41, 66, 49, 0.11)',
                            display: 'flex',
                            flexDirection: 'column',
                            height: 540,
                            borderRadius: 18,
                            border: isDark ? '1px solid rgba(122,189,105,0.24)' : '1px solid #e2e7dd',
                            background: isDark ? '#1b2a22' : '#fff',
                        }}
                        styles={{
                            body: {
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                padding: 14,
                            },
                        }}
                    >
                        <div
                            style={{
                                marginBottom: 12,
                                position: 'relative',
                                borderRadius: 12,
                                overflow: 'hidden',
                                height: 200,
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 8,
                                    right: 8,
                                    zIndex: 2,
                                    background: 'rgba(17, 24, 39, 0.58)',
                                    color: '#fff',
                                    borderRadius: 999,
                                    padding: '3px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    backdropFilter: 'blur(3px)',
                                }}
                            >
                                <EyeOutlined />
                                <span>{(property.view_count || 0).toLocaleString('ar-SA')}</span>
                            </div>
                            {property.images && property.images.length > 0 ? (
                                <Image.PreviewGroup>
                                    <Carousel>
                                        {property.images.map((url, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <Image
                                                    src={resolveMediaUrl(url)}
                                                    alt={`صورة ${index + 1}`}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        display: 'block',
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </Carousel>
                                </Image.PreviewGroup>
                            ) : (
                                <div
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        background: '#f0f0f0',
                                    }}
                                />
                            )}
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                height: 126,
                                overflow: 'hidden',
                            }}
                        >
                            <Paragraph style={{ marginBottom: 4 }}>
                                <Tag color="green">{formatOrPlaceholder(property.city)}</Tag>
                            </Paragraph>
                            <Paragraph style={{ marginBottom: 4 }}>
                                <Text strong>المساحة: </Text>
                                {formatNumberOrPlaceholder(property.area, 'م²')}
                            </Paragraph>
                            <Paragraph style={{ marginBottom: 4 }}>
                                <Text strong>السعر: </Text>
                                {property.price && property.price !== 0
                                    ? property.price.toLocaleString('ar-SA', { style: 'currency', currency: 'SAR' })
                                    : 'غير مذكور'}
                            </Paragraph>
                            <Paragraph
                                style={{ marginBottom: 0 }}
                                ellipsis={{ rows: 2 }}
                            >
                                <Text strong>تفاصيل: </Text>
                                {formatOrPlaceholder(property.details || '')}
                            </Paragraph>
                        </div>

                        <div
                            style={{
                                marginTop: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                gap: 8,
                            }}
                        >
                            <Button
                                type="primary"
                                onClick={() => openDetailsModal(property)}
                                style={{ ...actionBtnBaseStyle, background: '#2f6d33' }}
                            >
                                عرض التفاصيل
                            </Button>
                            <Button
                                onClick={() => handleShare(property)}
                                style={actionBtnBaseStyle}
                            >
                                مشاركة
                            </Button>
                            {canEdit && (
                                <Button
                                    onClick={() => openEditModal(property)}
                                    style={actionBtnBaseStyle}
                                >
                                    تعديل العرض
                                </Button>
                            )}
                            {canDelete && (
                                <Button
                                    danger
                                    onClick={() => handleDelete(property)}
                                    style={actionBtnBaseStyle}
                                >
                                    حذف العرض
                                </Button>
                            )}
                        </div>
                        </Card>
                    </List.Item>
                )}
            />

            <Modal
                title="تعديل العرض العقاري"
                open={isModalVisible}
                onOk={handleUpdate}
                onCancel={handleModalCancel}
                okText="حفظ التعديلات"
                cancelText="إلغاء"
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="المدينة" name="city">
                        <Input />
                    </Form.Item>
                    <Form.Item label="الحي" name="neighborhood">
                        <Input />
                    </Form.Item>
                    <Form.Item label="نوع العقار" name="property_type">
                        <Input />
                    </Form.Item>
                    <Form.Item label="المساحة (م²)" name="area">
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item label="السعر" name="price">
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item label="تفاصيل إضافية" name="details">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item label="اسم المالك" name="owner_name">
                        <Input />
                    </Form.Item>
                    <Form.Item label="رقم المالك" name="owner_contact_number">
                        <Input />
                    </Form.Item>
                    <Form.Item label="رقم المسوّق" name="marketer_contact_number">
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="تفاصيل العرض العقاري"
                open={isDetailsModalVisible}
                onCancel={handleDetailsModalClose}
                styles={{
                    header: { direction: 'rtl', textAlign: 'right' },
                    body: { direction: 'rtl', textAlign: 'right' },
                }}
                footer={[
                    <Button key="close" type="primary" onClick={handleDetailsModalClose}>
                        إغلاق
                    </Button>,
                ]}
            >
                {detailsProperty && (
                    <div style={{ lineHeight: 2 }}>
                        <Paragraph>
                            <Text strong>رقم العرض: </Text>
                            <span dir="ltr" style={{ unicodeBidi: 'isolate', display: 'inline-block' }}>
                                {formatOrPlaceholder(detailsProperty.property_code || '')}
                            </span>
                        </Paragraph>
                        <Paragraph>
                            <Text strong>المدينة: </Text>
                            {formatOrPlaceholder(detailsProperty.city)}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>الحي: </Text>
                            {formatOrPlaceholder(detailsProperty.neighborhood)}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>نوع العقار: </Text>
                            {formatOrPlaceholder(detailsProperty.property_type)}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>المساحة: </Text>
                            {formatNumberOrPlaceholder(detailsProperty.area, 'م²')}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>السعر المطلوب: </Text>
                            {detailsProperty.price && detailsProperty.price !== 0
                                ? detailsProperty.price.toLocaleString('ar-SA', {
                                      style: 'currency',
                                      currency: 'SAR',
                                  })
                                : 'غير مذكور'}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>تفاصيل إضافية: </Text>
                            {formatOrPlaceholder(detailsProperty.details || '')}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>اسم المالك: </Text>
                            {formatOrPlaceholder(detailsProperty.owner_name || '')}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>رقم المالك: </Text>
                            {formatOrPlaceholder(detailsProperty.owner_contact_number || '')}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>رقم المسوّق: </Text>
                            {formatOrPlaceholder(detailsProperty.marketer_contact_number || '')}
                        </Paragraph>
                        <Paragraph>
                            <Text strong>وصف العرض: </Text>
                            {formatOrPlaceholder(detailsProperty.formatted_description || '')}
                        </Paragraph>
                        {detailsProperty.images && detailsProperty.images.length > 0 && (
                            <Paragraph>
                                <Text strong>الصور: </Text>
                            </Paragraph>
                        )}
                        {detailsProperty.images && detailsProperty.images.length > 0 && (
                            <Carousel
                                dots={detailsProperty.images.length > 1}
                                arrows
                                style={{ marginBottom: 16 }}
                            >
                                {detailsProperty.images.map((url, index) => (
                                    <div key={index}>
                                        <Image
                                            src={resolveMediaUrl(url)}
                                            alt={`صورة ${index + 1}`}
                                            style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 8 }}
                                        />
                                    </div>
                                ))}
                            </Carousel>
                        )}
                        {detailsProperty.videos && detailsProperty.videos.length > 0 && (
                             <Paragraph>
                                <Text strong>الفيديوهات: </Text>
                             </Paragraph>
                        )}
                        {detailsProperty.videos &&
                            detailsProperty.videos.map((url, index) => (
                                <div key={index} style={{ marginBottom: 12 }}>
                                    <video controls style={{ width: '100%', borderRadius: 8 }}>
                                        <source src={resolveMediaUrl(url)} />
                                        متصفحك لا يدعم تشغيل الفيديو.
                                    </video>
                                </div>
                            ))}
                        {detailsProperty.documents && detailsProperty.documents.length > 0 && (
                             <Paragraph>
                                <Text strong>الملفات المرفقة: </Text>
                                <ul style={{ paddingRight: 20 }}>
                                    {detailsProperty.documents.map((url, index) => (
                                        <li key={index}>
                                            <a href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer">
                                                ملف رقم {index + 1}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                             </Paragraph>
                        )}
                        <Paragraph>
                            <Text strong>موقع العقار على الخريطة: </Text>
                            {detailsProperty.map_url ? (
                                <a href={detailsProperty.map_url} target="_blank" rel="noopener noreferrer">
                                    فتح في Google Maps
                                </a>
                            ) : (
                                'غير مذكور'
                            )}
                        </Paragraph>
                    </div>
                )}
            </Modal>
        </>
    );
};

export default PropertyList;
