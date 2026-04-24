import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, message, Button, ConfigProvider, Card, Row, Col, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
    SettingOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    PlusOutlined,
    BarChartOutlined,
    HomeOutlined,
    ApartmentOutlined,
    EyeOutlined,
    UsergroupAddOutlined,
    AppstoreOutlined,
    EnvironmentOutlined,
    MessageOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import {
    Property,
    getProperties,
    aiSearchProperties,
    UserPublic,
    getCurrentUser,
    getPublicCompany,
    setAuthToken,
    resolveMediaUrl,
    getDashboardOverview,
    type DashboardOverview,
    updateInquiryStatus,
} from './services/api';
import PropertyForm from './components/PropertyForm';
import NavigationTree from './components/NavigationTree';
import PropertyList from './components/PropertyList';
import Search from 'antd/es/input/Search';
import PlatformLogo from './components/PlatformLogo';


const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const PLATFORM_OWNER_EMAIL = 'abadi.saeed@bynh.sa';

const App: React.FC = () => {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [filters, setFilters] = useState<object>({});
    const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
    const [companyName, setCompanyName] = useState<string>('');
    const [siderCollapsed, setSiderCollapsed] = useState<boolean>(false);
    const [treeReloadKey, setTreeReloadKey] = useState<number>(0);
    const [showPropertyForm, setShowPropertyForm] = useState<boolean>(false);
    const [activeSection, setActiveSection] = useState<'overview' | 'properties' | 'inquiries'>('overview');
    const [overview, setOverview] = useState<DashboardOverview | null>(null);
    const [isMobile, setIsMobile] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
    const navigate = useNavigate();

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const fetchAndSetProperties = useCallback(async () => {
        setLoading(true);
        try {
            const fetchedProperties = await getProperties(filters);
            setProperties(fetchedProperties);
        } catch (error) {
            message.error('فشل في تحميل قائمة العقارات.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const fetchOverview = useCallback(async () => {
        try {
            const data = await getDashboardOverview();
            setOverview(data);
        } catch {
            setOverview(null);
        }
    }, []);

    useEffect(() => {
        const initAuth = async () => {
            try {
                const user = await getCurrentUser();
                setCurrentUser(user);
                const ownerId = user.role === 'owner' ? user.id : user.company_owner_id;
                if (ownerId) {
                    try {
                        const company = await getPublicCompany(ownerId);
                        setCompanyName(company.company_name || '');
                    } catch {
                        setCompanyName('');
                    }
                } else {
                    setCompanyName('');
                }
            } catch {
                setCurrentUser(null);
                setCompanyName('');
                setAuthToken(null);
                navigate('/auth', { replace: true });
            }
        };
        initAuth();
    }, [navigate]);

    useEffect(() => {
        fetchAndSetProperties();
    }, [fetchAndSetProperties]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);
    
    const handleSearch = async (query: string) => {
        if (!query) {
            setFilters({}); // Reset filters if search is cleared
            return;
        }
        setLoading(true);
        try {
            const results = await aiSearchProperties(query);
            setProperties(results);
        } catch (error) {
            message.error('فشل في تنفيذ البحث بالذكاء الاصطناعي.');
        } finally {
            setLoading(false);
        }
    };

    const handlePropertyCreated = async () => {
        await fetchAndSetProperties();
        await fetchOverview();
        setTreeReloadKey((prev) => prev + 1);
    };


    const handleSelectInTree = (type: 'city' | 'neighborhood' | 'all', key: string) => {
        if (type === 'all') {
            setFilters({});
        } else {
            setFilters({ [type]: key });
        }
    };

    const handleLogout = () => {
        setAuthToken(null);
        setCurrentUser(null);
        message.success('تم تسجيل الخروج.');
        navigate('/auth', { replace: true });
    };

    const isPlatformOwner = (currentUser?.email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
    const palette = {
        pageBg: 'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)',
        glassBg: 'rgba(255, 255, 255, 0.95)',
        glassBorder: '1px solid #e4e7df',
        text: '#294231',
        textMuted: '#6d7d72',
        cardBg: '#ffffff',
        accent: '#3f7d3c',
        surface: 'rgba(255, 255, 255, 0.98)',
    };

    const appTheme = {
        token: {
            colorPrimary: palette.accent,
            colorBgLayout: 'transparent',
            colorBgContainer: palette.cardBg,
            colorText: palette.text,
            colorTextSecondary: palette.textMuted,
            borderRadius: 14,
            fontFamily:
                "'Readex Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
        },
        components: {
            Card: {
                colorBgContainer: palette.cardBg,
            },
        },
    };

    const totalProperties = overview?.total_properties ?? properties.length;
    const totalViewsLabel = overview ? overview.total_views.toLocaleString('ar-SA') : 'غير متوفرة';
    const newInterestedLabel = overview ? overview.total_inquiries.toLocaleString('ar-SA') : 'غير متوفرة';
    const latestProperties = properties.slice(0, 4);

    return (
        <ConfigProvider theme={appTheme}>
        <Layout
            className="dashboard-light"
            style={{ minHeight: '100vh', direction: 'rtl', background: palette.pageBg, padding: 14 }}
        >
            <Sider
                width={286}
                collapsible
                collapsed={siderCollapsed}
                onCollapse={(collapsed) => setSiderCollapsed(collapsed)}
                collapsedWidth={0}
                breakpoint="lg"
                trigger={null}
                style={{
                    background: palette.surface,
                    borderLeft: palette.glassBorder,
                    borderRadius: 20,
                }}
            >
                <div style={{ padding: '18px 16px 12px', borderBottom: palette.glassBorder }}>
                    <div style={{ marginBottom: 6 }}>
                        <PlatformLogo width={92} />
                    </div>
                    <Text style={{ color: palette.textMuted, fontSize: 12 }}>{companyName || 'مكتبك العقاري'}</Text>
                    <Button
                        type="primary"
                        block
                        icon={<PlusOutlined />}
                        style={{ marginTop: 12, borderRadius: 10, background: palette.accent }}
                        onClick={() => {
                            if (activeSection === 'properties') {
                                setShowPropertyForm((prev) => !prev);
                                return;
                            }
                            setActiveSection('properties');
                            setShowPropertyForm(true);
                            setFilters({});
                        }}
                    >
                        {showPropertyForm && activeSection === 'properties' ? 'إخفاء إضافة عقار' : 'إضافة عقار جديد'}
                    </Button>
                </div>
                <div style={{ padding: '12px 10px 6px', display: 'grid', gap: 8 }}>
                    <Button
                        type="text"
                        icon={<HomeOutlined />}
                        style={{
                            justifyContent: 'flex-start',
                            color: palette.text,
                            borderRadius: 10,
                            background: activeSection === 'overview' ? '#edf5e9' : 'transparent',
                        }}
                        onClick={() => setActiveSection('overview')}
                    >
                        نظرة عامة
                    </Button>
                    <Button
                        type="text"
                        icon={<ApartmentOutlined />}
                        style={{
                            justifyContent: 'flex-start',
                            color: palette.text,
                            borderRadius: 10,
                            background: activeSection === 'properties' ? '#edf5e9' : 'transparent',
                        }}
                        onClick={() => setActiveSection('properties')}
                    >
                        قائمة العقارات
                    </Button>
                    <Button
                        type="text"
                        icon={<MessageOutlined />}
                        style={{
                            justifyContent: 'flex-start',
                            color: palette.text,
                            borderRadius: 10,
                            background: activeSection === 'inquiries' ? '#edf5e9' : 'transparent',
                        }}
                        onClick={() => setActiveSection('inquiries')}
                    >
                        الاستفسارات
                    </Button>
                </div>
                <div style={{ padding: 8 }}>
                    {activeSection === 'properties' && (
                        <NavigationTree onSelect={handleSelectInTree} reloadKey={treeReloadKey} darkMode={false} />
                    )}
                </div>
                <div style={{ marginTop: 'auto', padding: '8px 10px 14px', display: 'grid', gap: 8 }}>
                    <Button
                        type="text"
                        icon={<SettingOutlined />}
                        onClick={() => {
                            if (currentUser?.role !== 'owner') {
                                message.error('ليس لديك صلاحية فتح صفحة الإعدادات. تواصل مع مالك الحساب.');
                                return;
                            }
                            navigate('/settings');
                        }}
                        style={{ justifyContent: 'flex-start', color: palette.text, borderRadius: 10 }}
                    >
                        الإعدادات
                    </Button>
                    {isPlatformOwner && (
                        <Button
                            type="text"
                            icon={<BarChartOutlined />}
                            onClick={() => navigate('/platform-admin')}
                            style={{ justifyContent: 'flex-start', color: palette.text, borderRadius: 10 }}
                        >
                            لوحة الأدمن
                        </Button>
                    )}
                    <Button
                        type="text"
                        icon={<LogoutOutlined />}
                        onClick={handleLogout}
                        style={{ justifyContent: 'flex-start', color: '#dc2626', borderRadius: 10 }}
                    >
                        تسجيل الخروج
                    </Button>
                </div>
            </Sider>
            <Layout style={{ background: 'transparent' }}>
                <Header
                    style={{
                        background: palette.surface,
                        padding: '0 18px',
                        height: 82,
                        lineHeight: '82px',
                        border: palette.glassBorder,
                        borderRadius: 18,
                        marginBottom: 14,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: isMobile ? 'wrap' : 'nowrap',
                            rowGap: isMobile ? 10 : 8,
                            columnGap: 16,
                            minHeight: isMobile ? 120 : 82,
                            paddingTop: isMobile ? 12 : 8,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button
                                type="text"
                                onClick={() => setSiderCollapsed((prev) => !prev)}
                                icon={
                                    siderCollapsed ? (
                                        <MenuUnfoldOutlined style={{ color: palette.text }} />
                                    ) : (
                                        <MenuFoldOutlined style={{ color: palette.text }} />
                                    )
                                }
                                style={{
                                            width: 42,
                                            height: 42,
                                            borderRadius: 13,
                                    border: palette.glassBorder,
                                            background: '#fff',
                                }}
                                aria-label="إظهار أو إخفاء القائمة الجانبية"
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                <Title
                                    level={3}
                                    style={{
                                        color: palette.text,
                                        margin: 0,
                                        whiteSpace: 'nowrap',
                                        fontSize: isMobile ? 22 : 30,
                                        lineHeight: 1.15,
                                    }}
                                >
                                    {activeSection === 'overview' ? 'نظرة عامة' : activeSection === 'inquiries' ? 'الاستفسارات' : 'قائمة العقارات'}
                                </Title>
                                <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                                    إجمالي العروض: {properties.length}
                                </Text>
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                flex: isMobile ? '1 1 100%' : '1 1 560px',
                                minWidth: isMobile ? 0 : 260,
                                marginInlineStart: 'auto',
                            }}
                        >
                            {activeSection === 'properties' ? (
                                <div style={{ flex: 1, minWidth: 220, maxWidth: 620 }}>
                                    <Search
                                        placeholder="ابحث باسم العقار، المدينة أو الحي..."
                                        onSearch={handleSearch}
                                        allowClear
                                        size="large"
                                        style={{ width: '100%', direction: 'rtl' }}
                                    />
                                </div>
                            ) : (
                                <Text style={{ whiteSpace: 'nowrap', color: palette.textMuted }}>
                                    ملخص أداء المكتب العقاري
                                </Text>
                            )}
                        </div>
                    </div>
                </Header>
                <Content style={{ margin: '0 4px 4px' }}>
                    {activeSection === 'overview' ? (
                        <div style={{ display: 'grid', gap: 16 }}>
                            <Row gutter={[12, 12]}>
                                <Col xs={24} sm={12} lg={8}>
                                    <Card style={{ borderRadius: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <Tag color="green" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                                                مباشر
                                            </Tag>
                                            <div
                                                style={{
                                                    width: 42,
                                                    height: 42,
                                                    borderRadius: 12,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: '#eef7ea',
                                                    color: palette.accent,
                                                    fontSize: 20,
                                                }}
                                            >
                                                <AppstoreOutlined />
                                            </div>
                                        </div>
                                        <Title level={2} style={{ margin: '12px 0 2px', color: palette.text }}>
                                            {totalProperties.toLocaleString('ar-SA')}
                                        </Title>
                                        <Text strong style={{ color: palette.textMuted }}>إجمالي العقارات</Text>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={8}>
                                    <Card style={{ borderRadius: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <Tag color="green" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                                                مباشر
                                            </Tag>
                                            <div
                                                style={{
                                                    width: 42,
                                                    height: 42,
                                                    borderRadius: 12,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: '#eaf2ff',
                                                    color: '#3b82f6',
                                                    fontSize: 20,
                                                }}
                                            >
                                                <EyeOutlined />
                                            </div>
                                        </div>
                                        <Title level={2} style={{ margin: '12px 0 2px', color: palette.text }}>
                                            {totalViewsLabel}
                                        </Title>
                                        <Text strong style={{ color: palette.textMuted }}>مشاهدات العروض</Text>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={8}>
                                    <Card style={{ borderRadius: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <Tag color="green" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                                                مباشر
                                            </Tag>
                                            <div
                                                style={{
                                                    width: 42,
                                                    height: 42,
                                                    borderRadius: 12,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: '#eefaf4',
                                                    color: '#65a30d',
                                                    fontSize: 20,
                                                }}
                                            >
                                                <UsergroupAddOutlined />
                                            </div>
                                        </div>
                                        <Title level={2} style={{ margin: '12px 0 2px', color: palette.text }}>
                                            {newInterestedLabel}
                                        </Title>
                                        <Text strong style={{ color: palette.textMuted }}>استفسارات جديدة</Text>
                                    </Card>
                                </Col>
                            </Row>
                            <Row gutter={[12, 12]}>
                                <Col xs={24} lg={14}>
                                    <Card
                                        title={<span style={{ color: palette.text }}>أحدث العقارات المضافة</span>}
                                        extra={
                                            <Button
                                                type="link"
                                                style={{ color: '#93a26f', padding: 0 }}
                                                onClick={() => {
                                                    setActiveSection('properties');
                                                    setShowPropertyForm(false);
                                                    setFilters({});
                                                }}
                                            >
                                                عرض الكل
                                            </Button>
                                        }
                                    >
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                                            {latestProperties.slice(0, 2).map((item, idx) => (
                                                <Card
                                                    key={item.id || idx}
                                                    bodyStyle={{ padding: 0 }}
                                                    style={{ borderRadius: 14, overflow: 'hidden', border: palette.glassBorder }}
                                                >
                                                    <div style={{ position: 'relative', height: 180, background: '#d7ddd4' }}>
                                                        {item.images && item.images[0] ? (
                                                            <img
                                                                src={resolveMediaUrl(item.images[0])}
                                                                alt={item.property_type || 'عقار'}
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                        ) : null}
                                                        <Tag color="green" style={{ position: 'absolute', top: 10, left: 10, borderRadius: 999 }}>
                                                            {item.price ? `${item.price.toLocaleString('ar-SA')} ريال` : 'سعر غير متوفر'}
                                                        </Tag>
                                                    </div>
                                                    <div style={{ padding: 10 }}>
                                                        <Text strong style={{ color: palette.text, fontSize: 18 }}>
                                                            {item.property_type || 'عقار'} في {item.neighborhood || 'حي'}
                                                        </Text>
                                                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <EnvironmentOutlined style={{ color: '#9ca3af' }} />
                                                            <Text type="secondary">{item.city || 'مدينة غير مذكورة'}</Text>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} lg={10}>
                                    <Card
                                        title={<span style={{ color: palette.text }}>آخر الاستفسارات</span>}
                                        extra={
                                            <Button
                                                type="link"
                                                style={{ color: '#93a26f', padding: 0 }}
                                                onClick={() => setActiveSection('inquiries')}
                                            >
                                                عرض الكل
                                            </Button>
                                        }
                                    >
                                        {overview && overview.recent_inquiries.length > 0 ? (
                                            <div style={{ display: 'grid', gap: 10 }}>
                                                {overview.recent_inquiries.slice(0, 3).map((inq) => (
                                                    <Card key={inq.id} size="small" style={{ borderRadius: 12 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                                            <Text strong>{inq.name || 'عميل مهتم'}</Text>
                                                            <Button
                                                                type="text"
                                                                icon={inq.status === 'responded' ? <CheckCircleOutlined style={{ color: '#16a34a' }} /> : <ClockCircleOutlined style={{ color: '#f59e0b' }} />}
                                                                onClick={async () => {
                                                                    try {
                                                                        const nextStatus = inq.status === 'responded' ? 'new' : 'responded';
                                                                        await updateInquiryStatus(inq.id, nextStatus);
                                                                        await fetchOverview();
                                                                        message.success(nextStatus === 'responded' ? 'تم تعيين الاستفسار كمُجاب.' : 'تم إرجاع الاستفسار كغير مُجاب.');
                                                                    } catch (e: any) {
                                                                        message.error(e?.response?.data?.detail || 'تعذر تحديث حالة الاستفسار.');
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ marginTop: 4 }}>
                                                            <Text style={{ color: palette.textMuted }}>{inq.message}</Text>
                                                        </div>
                                                        <div style={{ marginTop: 4 }}>
                                                            <Text type="secondary">
                                                                {inq.city || 'غير محدد'} - {inq.neighborhood || 'غير محدد'}
                                                            </Text>
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        ) : (
                                            <Text style={{ color: palette.textMuted }}>غير متوفرة</Text>
                                        )}
                                    </Card>
                                </Col>
                            </Row>
                        </div>
                    ) : activeSection === 'inquiries' ? (
                        <Card title="الاستفسارات">
                            {overview && overview.recent_inquiries.length > 0 ? (
                                <div style={{ display: 'grid', gap: 12 }}>
                                    {overview.recent_inquiries.map((inq) => (
                                        <Card key={inq.id} size="small" style={{ borderRadius: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                                <Text strong>{inq.name || 'عميل مهتم'}</Text>
                                                <Button
                                                    type="text"
                                                    icon={inq.status === 'responded' ? <CheckCircleOutlined style={{ color: '#16a34a' }} /> : <ClockCircleOutlined style={{ color: '#f59e0b' }} />}
                                                    onClick={async () => {
                                                        try {
                                                            const nextStatus = inq.status === 'responded' ? 'new' : 'responded';
                                                            await updateInquiryStatus(inq.id, nextStatus);
                                                            await fetchOverview();
                                                            message.success(nextStatus === 'responded' ? 'تم تعيين الاستفسار كمُجاب.' : 'تم إرجاع الاستفسار كغير مُجاب.');
                                                        } catch (e: any) {
                                                            message.error(e?.response?.data?.detail || 'تعذر تحديث حالة الاستفسار.');
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div style={{ marginTop: 6 }}>
                                                <Text>{inq.message}</Text>
                                            </div>
                                            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <Tag>{inq.property_title || 'عرض عقاري'}</Tag>
                                                <Tag>{inq.phone || 'لا يوجد رقم'}</Tag>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <Text type="secondary">لا توجد استفسارات حتى الآن.</Text>
                            )}
                        </Card>
                    ) : (
                        <>
                            {showPropertyForm && (
                                <PropertyForm onSuccess={handlePropertyCreated} currentUser={currentUser} />
                            )}
                            <PropertyList
                                properties={properties}
                                loading={loading}
                                onRefresh={fetchAndSetProperties}
                                currentUser={currentUser}
                            />
                        </>
                    )}
                </Content>
            </Layout>
        </Layout>
        </ConfigProvider>
    );
};

export default App;
