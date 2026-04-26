import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Spin, Alert, Image, Button, Modal, Avatar, Tag, Form, Input, message } from 'antd';
import { EnvironmentOutlined, ShareAltOutlined, HeartOutlined, SaveOutlined, EyeOutlined, MessageOutlined } from '@ant-design/icons';
import type { Property, PublicCompany } from '../services/api';
import { getPublicProperty, getPublicCompany, resolveMediaUrl, createPublicPropertyInquiry } from '../services/api';
import PlatformLogo from './PlatformLogo';

const { Title, Text, Paragraph } = Typography;

const normalizeExternalHref = (value?: string | null): string | null => {
    if (!value) return null;
    const text = value.trim();
    if (!text) return null;
    if (/^https?:\/\//i.test(text)) return text;
    return `https://${text.replace(/^\/+/, '')}`;
};

const PublicPropertyPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
    const [company, setCompany] = useState<PublicCompany | null>(null);
    const [inquiryOpen, setInquiryOpen] = useState(false);
    const [sendingInquiry, setSendingInquiry] = useState(false);
    const [inquiryForm] = Form.useForm<{ name?: string; phone?: string; message: string }>();

    useEffect(() => {
        const fetchData = async () => {
            if (!id) {
                setError('لم يتم تحديد العقار.');
                setLoading(false);
                return;
            }
            try {
                const data = await getPublicProperty(id);
                setProperty(data);
                if (data.owner_id) {
                    try {
                        const companyData = await getPublicCompany(data.owner_id);
                        setCompany(companyData);
                    } catch {
                        // Ignore company loading errors on public page
                    }
                }
            } catch (e: any) {
                const detail = e?.response?.data?.detail || 'فشل في تحميل بيانات العقار.';
                setError(detail);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (error || !property) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Alert type="error" message={error || 'العقار غير موجود.'} />
            </div>
        );
    }

    const mapHref = normalizeExternalHref(property.map_url);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)',
                padding: '24px 8px',
                direction: 'rtl',
                display: 'flex',
                justifyContent: 'center',
            }}
        >
            <Card
                style={{ width: '100%', maxWidth: 960, boxShadow: '0 12px 28px rgba(41,66,49,0.08)', borderRadius: 18, border: '1px solid #e4e7df' }}
                bodyStyle={{ padding: 24 }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {company?.logo_url && (
                            <Avatar
                                src={resolveMediaUrl(company.logo_url)}
                                size={48}
                                alt={company.company_name || 'شعار المكتب'}
                            />
                        )}
                        <div>
                            <Title level={4} style={{ margin: 0 }}>
                                {company?.company_name || 'مكتب عقاري'}
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                عرض عقاري من مكتب مسوّق
                            </Text>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <PlatformLogo width={118} />
                        {property.owner_id && (
                            <Button
                                type="primary"
                                size="small"
                                style={{ background: '#3f7d3c' }}
                                onClick={() => navigate(`/share/company/${property.owner_id}`)}
                            >
                                عرض جميع العروض لهذا المكتب
                            </Button>
                        )}
                    </div>
                </div>

                {/* Hero section with title, location and price */}
                <div
                    style={{
                        marginBottom: 24,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                        <Title level={2} style={{ margin: 0, lineHeight: 1.3 }}>
                            {property.property_type || 'عقار'} في{' '}
                            {property.city || 'مدينة غير مذكورة'}
                        </Title>
                        <div
                            style={{
                                marginTop: 8,
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <Tag color="green">عرض عقاري</Tag>
                            <Text type="secondary">
                                <EnvironmentOutlined style={{ marginLeft: 4 }} />
                                {property.neighborhood || 'حي غير مذكور'}
                                {property.city ? `، ${property.city}` : ''}
                            </Text>
                        </div>
                    </div>
                    <div style={{ flex: '1 0 200px', minWidth: 200, textAlign: 'left' }}>
                        <Text type="secondary">السعر</Text>
                        <Title level={3} style={{ margin: '4px 0 8px' }}>
                            {property.price && property.price !== 0
                                ? property.price.toLocaleString('ar-SA', {
                                      style: 'currency',
                                      currency: 'SAR',
                                  })
                                : 'غير مذكور'}
                        </Title>
                        <div
                            style={{
                                marginTop: 8,
                                display: 'flex',
                                gap: 8,
                                justifyContent: 'flex-start',
                            }}
                        >
                            <Button icon={<ShareAltOutlined />} />
                            <Button icon={<HeartOutlined />} />
                            <Button icon={<SaveOutlined />} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                            <Tag icon={<EyeOutlined />} color="green">
                                {(property.view_count || 0).toLocaleString('ar-SA')} مشاهدة
                            </Tag>
                        </div>
                    </div>
                </div>

                {property.images && property.images.length > 0 && (
                    <Image.PreviewGroup>
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 12,
                                marginBottom: 24,
                            }}
                        >
                            <div
                                style={{
                                    flex: '3 1 260px',
                                    minWidth: 260,
                                    height: 320,
                                    borderRadius: 16,
                                    overflow: 'hidden',
                                    backgroundColor: '#000',
                                }}
                            >
                                <Image
                                    src={resolveMediaUrl(property.images[0])}
                                    alt="صورة العقار الرئيسية"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                            {property.images.length > 1 && (
                                <div
                                    style={{
                                        flex: '1 1 140px',
                                        minWidth: 140,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                    }}
                                >
                                    {property.images.slice(1, 4).map((url, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                width: '100%',
                                                height: 96,
                                                borderRadius: 12,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <Image
                                                src={resolveMediaUrl(url)}
                                                alt={`صورة إضافية ${index + 1}`}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Image.PreviewGroup>
                )}

                <Paragraph>
                    <Text strong>المدينة: </Text>
                    {property.city || 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>الحي: </Text>
                    {property.neighborhood || 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>نوع العقار: </Text>
                    {property.property_type || 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>المساحة: </Text>
                    {property.area
                        ? `${property.area.toLocaleString()} م²`
                        : 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>السعر المطلوب: </Text>
                    {property.price && property.price !== 0
                        ? property.price.toLocaleString('ar-SA', { style: 'currency', currency: 'SAR' })
                        : 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>تفاصيل إضافية: </Text>
                    {property.details || 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>اسم المالك: </Text>
                    {property.owner_name || 'غير مذكور'}
                </Paragraph>
                <Paragraph>
                    <Text strong>رقم المالك: </Text>
                    {property.owner_contact_number || 'غير مذكور'}
                </Paragraph>
                {property.marketer_contact_number && (
                    <Paragraph>
                        <Text strong>رقم المسوّق: </Text>
                        {property.marketer_contact_number}
                    </Paragraph>
                )}

                <Paragraph>
                    <Text strong>وصف العرض: </Text>
                    {property.formatted_description || 'غير مذكور'}
                </Paragraph>

                {property.videos && property.videos.length > 0 && (
                    <>
                        <Title level={5}>الفيديوهات</Title>
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                justifyContent: 'flex-start',
                            }}
                        >
                            {property.videos.map((url, index) => (
                                <div
                                    key={index}
                                    style={{ cursor: 'pointer', position: 'relative', width: 160, height: 100 }}
                                    onClick={() => setActiveVideoIndex(index)}
                                >
                                    <video
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: 8,
                                            objectFit: 'cover',
                                            backgroundColor: '#000',
                                            display: 'block',
                                        }}
                                        muted
                                        preload="metadata"
                                    >
                                        <source src={resolveMediaUrl(url)} />
                                        متصفحك لا يدعم تشغيل الفيديو.
                                    </video>
                                    {/* طبقة فوقية توضح أن هذا فيديو وقابل للنقر حتى لو لم تظهر أول فريم على الجوال */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            fontSize: 28,
                                            background: 'rgba(0, 0, 0, 0.25)',
                                            pointerEvents: 'none',
                                        }}
                                    >
                                        ▶
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Modal
                            open={activeVideoIndex !== null}
                            footer={null}
                            centered
                            onCancel={() => setActiveVideoIndex(null)}
                            width="90%"
                            style={{ maxWidth: 900 }}
                            bodyStyle={{ padding: 0 }}
                        >
                            {activeVideoIndex !== null && (
                                <video
                                    controls
                                    style={{
                                        width: '100%',
                                        maxHeight: '80vh',
                                        borderRadius: 8,
                                        display: 'block',
                                        backgroundColor: '#000',
                                    }}
                                >
                                    <source src={resolveMediaUrl(property.videos![activeVideoIndex])} />
                                    متصفحك لا يدعم تشغيل الفيديو.
                                </video>
                            )}
                        </Modal>
                    </>
                )}

                {property.documents && property.documents.length > 0 && (
                    <>
                        <Title level={5}>الملفات المرفقة</Title>
                        <ul style={{ paddingRight: 20 }}>
                            {property.documents.map((url, index) => (
                                <li key={index}>
                                    <a href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer">
                                        ملف رقم {index + 1}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                <Paragraph>
                    <Text strong>موقع العقار على الخريطة: </Text>
                    {mapHref ? (
                        <a href={mapHref} target="_blank" rel="noopener noreferrer">
                            فتح في Google Maps
                        </a>
                    ) : (
                        'غير مذكور'
                    )}
                </Paragraph>

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <Button type="primary" icon={<MessageOutlined />} onClick={() => setInquiryOpen(true)} style={{ background: '#3f7d3c' }}>
                        إرسال استفسار عن هذا العرض
                    </Button>
                </div>

                <Modal
                    title="إرسال استفسار"
                    open={inquiryOpen}
                    onCancel={() => setInquiryOpen(false)}
                    okText="إرسال"
                    cancelText="إلغاء"
                    confirmLoading={sendingInquiry}
                    onOk={async () => {
                        try {
                            const values = await inquiryForm.validateFields();
                            if (!id) return;
                            setSendingInquiry(true);
                            await createPublicPropertyInquiry(id, {
                                name: values.name,
                                phone: values.phone,
                                message: values.message,
                            });
                            message.success('تم إرسال استفسارك بنجاح.');
                            inquiryForm.resetFields();
                            setInquiryOpen(false);
                        } catch (e: any) {
                            if (e?.errorFields) return;
                            message.error(e?.response?.data?.detail || 'تعذر إرسال الاستفسار.');
                        } finally {
                            setSendingInquiry(false);
                        }
                    }}
                >
                    <Form form={inquiryForm} layout="vertical">
                        <Form.Item label="الاسم (اختياري)" name="name">
                            <Input />
                        </Form.Item>
                        <Form.Item label="رقم التواصل (اختياري)" name="phone">
                            <Input />
                        </Form.Item>
                        <Form.Item
                            label="نص الاستفسار"
                            name="message"
                            rules={[{ required: true, message: 'الرجاء كتابة الاستفسار.' }]}
                        >
                            <Input.TextArea rows={4} />
                        </Form.Item>
                    </Form>
                </Modal>
            </Card>
        </div>
    );
};

export default PublicPropertyPage;


