import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Spin, Alert, Image, Button, Modal, Avatar, Tag, Form, Input, message } from 'antd';
import { EnvironmentOutlined, ShareAltOutlined, HeartOutlined, SaveOutlined, EyeOutlined, MessageOutlined } from '@ant-design/icons';
import type { Property, PublicCompany } from '../services/api';
import { getPublicProperty, getPublicCompany, resolveMediaUrl, createPublicPropertyInquiry } from '../services/api';
import PlatformLogo from './PlatformLogo';

const { Title, Text, Paragraph } = Typography;

type VideoEmbed = {
    href: string;
    embedUrl?: string;
    platform: string;
};

const normalizeExternalHref = (value?: string | null): string | null => {
    if (!value) return null;
    const text = value.trim();
    if (!text) return null;
    if (/^https?:\/\//i.test(text)) return text;
    return `https://${text.replace(/^\/+/, '')}`;
};

const hasMeaningfulText = (value?: string | null): boolean => {
    if (!value) return false;
    const text = value.trim();
    return text !== '' && text !== 'غير مذكور';
};

const getVideoEmbed = (value: string): VideoEmbed => {
    const href = normalizeExternalHref(value) || value;
    try {
        const parsed = new URL(href);
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

        if (host === 'youtu.be') {
            const id = parsed.pathname.split('/').filter(Boolean)[0];
            return { href, embedUrl: id ? `https://www.youtube.com/embed/${id}` : undefined, platform: 'YouTube' };
        }

        if (host.includes('youtube.com')) {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const id =
                parsed.searchParams.get('v') ||
                (['shorts', 'embed'].includes(parts[0]) ? parts[1] : undefined);
            return { href, embedUrl: id ? `https://www.youtube.com/embed/${id}` : undefined, platform: 'YouTube' };
        }

        if (host.includes('tiktok.com')) {
            const match = parsed.pathname.match(/\/video\/(\d+)/);
            return {
                href,
                embedUrl: match?.[1] ? `https://www.tiktok.com/embed/v2/${match[1]}` : undefined,
                platform: 'TikTok',
            };
        }

        if (host.includes('instagram.com')) {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const type = ['reel', 'p', 'tv'].includes(parts[0]) ? parts[0] : 'reel';
            const id = ['reel', 'p', 'tv'].includes(parts[0]) ? parts[1] : undefined;
            return {
                href,
                embedUrl: id ? `https://www.instagram.com/${type}/${id}/embed` : undefined,
                platform: 'Instagram',
            };
        }
    } catch {
        // Fall back to native video rendering for uploaded files.
    }

    return { href, platform: 'فيديو' };
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
    const propertyTypeLabel = hasMeaningfulText(property.property_type) ? property.property_type : 'عقار';
    const cityLabel = hasMeaningfulText(property.city) ? property.city : '';
    const neighborhoodLabel = hasMeaningfulText(property.neighborhood) ? property.neighborhood : '';
    const locationLabel = [neighborhoodLabel, cityLabel].filter(Boolean).join('، ');
    const galleryItems = (property.images || []).map((url) => resolveMediaUrl(url)).filter(Boolean);

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
                        <Button onClick={() => navigate(-1)} style={{ marginTop: 8 }}>
                          رجوع
                        </Button>
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
                            {propertyTypeLabel}
                            {cityLabel ? ` في ${cityLabel}` : ''}
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
                            {locationLabel && (
                                <Text type="secondary">
                                    <EnvironmentOutlined style={{ marginLeft: 4 }} />
                                    {locationLabel}
                                </Text>
                            )}
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
                                : 'السعر عند التواصل'}
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

                {galleryItems.length > 0 && (
                    <Image.PreviewGroup items={galleryItems}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: 12,
                                marginBottom: 24,
                            }}
                        >
                            {galleryItems.map((url, index) => (
                                <div
                                    key={`${url}-${index}`}
                                    style={{
                                        height: 150,
                                        borderRadius: 12,
                                        overflow: 'hidden',
                                        background: '#0f172a',
                                    }}
                                >
                                    <Image
                                        src={url}
                                        alt={`صورة العقار ${index + 1}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </Image.PreviewGroup>
                )}

                <Paragraph>
                    <Text strong>رقم العرض: </Text>
                    {property.property_code || 'غير متوفر'}
                </Paragraph>
                {hasMeaningfulText(property.city) && (
                    <Paragraph>
                        <Text strong>المدينة: </Text>
                        {property.city}
                    </Paragraph>
                )}
                {hasMeaningfulText(property.neighborhood) && (
                    <Paragraph>
                        <Text strong>الحي: </Text>
                        {property.neighborhood}
                    </Paragraph>
                )}
                {hasMeaningfulText(property.property_type) && (
                    <Paragraph>
                        <Text strong>نوع العقار: </Text>
                        {property.property_type}
                    </Paragraph>
                )}
                {typeof property.area === 'number' && property.area > 0 && (
                    <Paragraph>
                        <Text strong>المساحة: </Text>
                        {`${property.area.toLocaleString()} م²`}
                    </Paragraph>
                )}
                {typeof property.price === 'number' && property.price > 0 && (
                    <Paragraph>
                        <Text strong>السعر المطلوب: </Text>
                        {property.price.toLocaleString('ar-SA', { style: 'currency', currency: 'SAR' })}
                    </Paragraph>
                )}
                {hasMeaningfulText(property.details) && (
                    <Paragraph>
                        <Text strong>تفاصيل إضافية: </Text>
                        {property.details}
                    </Paragraph>
                )}
                {hasMeaningfulText(property.formatted_description) && (
                    <Paragraph>
                        <Text strong>وصف العرض: </Text>
                        {property.formatted_description}
                    </Paragraph>
                )}

                {property.videos && property.videos.length > 0 && (
                    <>
                        <Title level={5}>الفيديوهات</Title>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                gap: 12,
                            }}
                        >
                            {property.videos.map((url, index) => {
                                const video = getVideoEmbed(url);
                                const isUploadedVideo = !video.embedUrl && url.startsWith('/uploads/');

                                if (video.embedUrl) {
                                    return (
                                        <div
                                            key={index}
                                            style={{
                                                border: '1px solid #e4e7df',
                                                borderRadius: 12,
                                                overflow: 'hidden',
                                                background: '#fff',
                                            }}
                                        >
                                            <div style={{ padding: '8px 12px', fontWeight: 700, color: '#2f4d37' }}>
                                                {video.platform}
                                            </div>
                                            <iframe
                                                src={video.embedUrl}
                                                title={`${video.platform} video ${index + 1}`}
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                                style={{
                                                    width: '100%',
                                                    height: 420,
                                                    border: 0,
                                                    display: 'block',
                                                    background: '#000',
                                                }}
                                            />
                                        </div>
                                    );
                                }

                                if (isUploadedVideo) {
                                    return (
                                        <div
                                            key={index}
                                            style={{ cursor: 'pointer', position: 'relative', height: 180 }}
                                            onClick={() => setActiveVideoIndex(index)}
                                        >
                                            <video
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    borderRadius: 12,
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
                                                    borderRadius: 12,
                                                }}
                                            >
                                                ▶
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <Card key={index} size="small" style={{ borderRadius: 12 }}>
                                        <Text strong>{video.platform}</Text>
                                        <Paragraph ellipsis={{ rows: 1 }} style={{ marginTop: 8 }}>
                                            {video.href}
                                        </Paragraph>
                                        <Button href={video.href} target="_blank" rel="noopener noreferrer">
                                            فتح الفيديو
                                        </Button>
                                    </Card>
                                );
                            })}
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

                {mapHref && (
                    <Paragraph>
                        <Text strong>موقع العقار على الخريطة: </Text>
                        <a href={mapHref} target="_blank" rel="noopener noreferrer">
                            فتح في Google Maps
                        </a>
                    </Paragraph>
                )}

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
