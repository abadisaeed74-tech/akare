import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Spin, Alert, Image, Button, Modal, Avatar, Tag } from 'antd';
import { EnvironmentOutlined, ShareAltOutlined, HeartOutlined, SaveOutlined } from '@ant-design/icons';
import type { Property, PublicCompany } from '../services/api';
import { getPublicProperty, getPublicCompany, resolveMediaUrl } from '../services/api';

const { Title, Text, Paragraph } = Typography;

const PublicPropertyPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
    const [company, setCompany] = useState<PublicCompany | null>(null);

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

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#f5f5f5',
                padding: '24px 8px',
                direction: 'rtl',
                display: 'flex',
                justifyContent: 'center',
            }}
        >
            <Card
                style={{ width: '100%', maxWidth: 900, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
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
                        <Text type="secondary">منصة عقاري</Text>
                        {property.owner_id && (
                            <Button
                                type="primary"
                                size="small"
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
                            <Tag color="black">عرض عقاري</Tag>
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
                    {property.map_url ? (
                        <a href={property.map_url} target="_blank" rel="noopener noreferrer">
                            فتح في Google Maps
                        </a>
                    ) : (
                        'غير مذكور'
                    )}
                </Paragraph>

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <Button
                        type="link"
                        href={property.map_url || undefined}
                        target={property.map_url ? '_blank' : undefined}
                    >
                        تواصل مع المسوّق لمزيد من التفاصيل
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default PublicPropertyPage;


