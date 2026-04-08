import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Typography, Spin, Alert, List, Button, Image, Carousel, message, Avatar } from 'antd';
import Search from 'antd/es/input/Search';
import type { Property, PublicCompany } from '../services/api';
import { getPublicCompany, getPublicCompanyProperties, publicCompanyAiSearch, resolveMediaUrl } from '../services/api';

const { Title, Text, Paragraph } = Typography;

const CompanyPublicPropertiesPage: React.FC = () => {
  const { ownerId } = useParams<{ ownerId: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!ownerId) {
        setError('لم يتم تحديد المكتب العقاري.');
        setLoading(false);
        return;
      }
      try {
        const [companyData, props] = await Promise.all([
          getPublicCompany(ownerId),
          getPublicCompanyProperties(ownerId),
        ]);
        setCompany(companyData);
        setAllProperties(props);
        setProperties(props);
      } catch (e: any) {
        const detail = e?.response?.data?.detail || 'فشل في تحميل بيانات المكتب العقاري.';
        setError(detail);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ownerId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert type="error" message={error} />
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
              <Title level={3} style={{ marginBottom: 4 }}>
                {company?.company_name || 'مكتب عقاري'}
              </Title>
              {company?.official_email && (
                <Paragraph style={{ margin: 0 }}>
                  <Text type="secondary">{company.official_email}</Text>
                </Paragraph>
              )}
              {company?.contact_phone && (
                <Paragraph style={{ margin: 0 }}>
                  <Text type="secondary">هاتف: {company.contact_phone}</Text>
                </Paragraph>
              )}
            </div>
          </div>
          <Button onClick={() => navigate(-1)}>رجوع</Button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginTop: 8,
            marginBottom: 16,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            جميع العروض التابعة لهذا المكتب
          </Title>
          <Search
            placeholder="اكتب طلبك باللغة العربية للبحث في عروض هذا المكتب..."
            allowClear
            loading={searchLoading}
            onSearch={async (value) => {
              const q = value.trim();
              if (!ownerId) return;
              if (!q) {
                setProperties(allProperties);
                return;
              }
              setSearchLoading(true);
              try {
                const results = await publicCompanyAiSearch(ownerId, q);
                setProperties(results);
              } catch (e: any) {
                const detail = e?.response?.data?.detail;
                if (detail) {
                  message.error(detail);
                } else {
                  message.error('فشل في تنفيذ البحث، سيتم استخدام بحث مبسط.');
                }
                // Fallback: بحث مبسط محلي
                const lower = q.toLowerCase();
                const filtered = allProperties.filter((p) => {
                  const text = [
                    p.city,
                    p.neighborhood,
                    p.property_type,
                    p.details,
                    p.owner_name,
                    p.formatted_description,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  return text.includes(lower);
                });
                setProperties(filtered);
              } finally {
                setSearchLoading(false);
              }
            }}
            style={{ maxWidth: 480, direction: 'ltr' }}
          />
        </div>

        {properties.length === 0 ? (
          <Alert type="info" message="لا توجد عروض عقارية حالياً لهذا المكتب." />
        ) : (
          <List
            grid={{
              gutter: 24,
              xs: 1,
              sm: 1,
              md: 2,
              lg: 2,
              xl: 3,
              xxl: 3,
            }}
            dataSource={properties}
            renderItem={(property) => (
              <List.Item key={property.id || property.raw_text}>
                <Card
                  hoverable
                  bordered={false}
                  style={{
                    borderRadius: 18,
                    overflow: 'hidden',
                    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#fff',
                  }}
                  bodyStyle={{ padding: 16, paddingTop: 12, display: 'flex', flexDirection: 'column' }}
                >
                  <div
                    style={{
                      marginBottom: 16,
                      position: 'relative',
                      borderRadius: 16,
                      overflow: 'hidden',
                      height: 200,
                    }}
                  >
                    {property.images && property.images.length > 0 ? (
                      <Image.PreviewGroup>
                        <Carousel dots={property.images.length > 1} arrows>
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
                          borderRadius: 16,
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
                      height: 140,
                      overflow: 'hidden',
                    }}
                  >
                    <Text strong style={{ fontSize: 16 }} ellipsis>
                      {property.property_type || 'عقار'} في{' '}
                      {property.neighborhood || 'حي غير مذكور'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {property.city || 'مدينة غير مذكورة'}
                    </Text>

                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12,
                        color: '#6b7280',
                      }}
                    >
                      <span>
                        المساحة:{' '}
                        {property.area
                          ? `${property.area.toLocaleString()} م²`
                          : 'غير مذكور'}
                      </span>
                      <span>
                        السعر:{' '}
                        {property.price && property.price !== 0
                          ? property.price.toLocaleString('ar-SA', {
                              style: 'currency',
                              currency: 'SAR',
                            })
                          : 'غير مذكور'}
                      </span>
                    </div>

                    <Paragraph
                      style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}
                      ellipsis={{ rows: 2 }}
                    >
                      {property.details || property.formatted_description || 'لا توجد تفاصيل إضافية.'}
                    </Paragraph>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Button
                      type="link"
                      onClick={() => {
                        if (property.id) {
                          navigate(`/share/${property.id}`);
                        }
                      }}
                      style={{ padding: 0, fontWeight: 500 }}
                    >
                      عرض تفاصيل العرض
                    </Button>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default CompanyPublicPropertiesPage;


