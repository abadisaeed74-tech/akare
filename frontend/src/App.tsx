import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, message, Button, ConfigProvider } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
    SettingOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    MoonOutlined,
    SunOutlined,
} from '@ant-design/icons';
import {
    Property,
    getProperties,
    aiSearchProperties,
    UserPublic,
    getCurrentUser,
    getPublicCompany,
    setAuthToken,
} from './services/api';
import PropertyForm from './components/PropertyForm';
import NavigationTree from './components/NavigationTree';
import PropertyList from './components/PropertyList';
import Search from 'antd/es/input/Search';


const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const App: React.FC = () => {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [filters, setFilters] = useState<object>({});
    const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
    const [companyName, setCompanyName] = useState<string>('');
    const [siderCollapsed, setSiderCollapsed] = useState<boolean>(false);
    const [treeReloadKey, setTreeReloadKey] = useState<number>(0);
    const [mode, setMode] = useState<'light' | 'dark'>(() => {
        if (typeof window === 'undefined') return 'light';
        const savedMode = window.localStorage.getItem('akare_theme_mode');
        return savedMode === 'dark' ? 'dark' : 'light';
    });
    const navigate = useNavigate();

    useEffect(() => {
        window.localStorage.setItem('akare_theme_mode', mode);
        document.body.classList.toggle('akare-dark', mode === 'dark');
        document.body.classList.toggle('akare-light', mode === 'light');
        return () => {
            document.body.classList.remove('akare-dark');
            document.body.classList.remove('akare-light');
        };
    }, [mode]);

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

    const isDark = mode === 'dark';
    const palette = isDark
        ? {
              pageBg:
                  'radial-gradient(circle at 12% 14%, rgba(99,102,241,0.2), transparent 36%), radial-gradient(circle at 88% 12%, rgba(6,182,212,0.14), transparent 30%), linear-gradient(145deg, #1e293b 0%, #334155 48%, #1e293b 100%)',
              glassBg: 'rgba(30, 41, 59, 0.58)',
              glassBorder: '1px solid rgba(148,163,184,0.35)',
              text: '#f8fafc',
              textMuted: '#cbd5e1',
              cardBg: '#1e293b',
          }
        : {
              pageBg:
                  'radial-gradient(circle at 10% 12%, rgba(30,58,138,0.14), transparent 36%), radial-gradient(circle at 92% 10%, rgba(56,189,248,0.13), transparent 30%), linear-gradient(145deg, #f7faff 0%, #ffffff 50%, #f2f9ff 100%)',
              glassBg: '#ffffffcc',
              glassBorder: '1px solid #e2e8f0',
              text: '#0f172a',
              textMuted: '#475569',
              cardBg: '#ffffff',
          };

    const appTheme = {
        token: {
            colorPrimary: '#2563eb',
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

    return (
        <ConfigProvider theme={appTheme}>
        <Layout
            className={isDark ? 'dashboard-dark' : 'dashboard-light'}
            style={{ minHeight: '100vh', direction: 'rtl', background: palette.pageBg }}
        >
            <Sider
                width={250}
                collapsible
                collapsed={siderCollapsed}
                onCollapse={(collapsed) => setSiderCollapsed(collapsed)}
                collapsedWidth={0}
                breakpoint="lg"
                trigger={null}
                style={{
                    background: palette.glassBg,
                    borderLeft: palette.glassBorder,
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                }}
            >
                <div style={{ padding: '16px', textAlign: 'center', borderBottom: palette.glassBorder }}>
                    <Title level={4} style={{ color: palette.text, margin: 0 }}>عقاري</Title>
                    <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                        {companyName || 'لوحة تحكم المكتب العقاري'}
                    </Text>
                </div>
                <div style={{ padding: 8 }}>
                    <NavigationTree onSelect={handleSelectInTree} reloadKey={treeReloadKey} darkMode={isDark} />
                </div>
            </Sider>
            <Layout style={{ background: 'transparent' }}>
                <Header
                    style={{
                        background: palette.glassBg,
                        padding: '0 16px',
                        height: 72,
                        lineHeight: '72px',
                        borderBottom: palette.glassBorder,
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            rowGap: 8,
                            columnGap: 16,
                            minHeight: 72,
                            paddingTop: 6,
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
                                    width: 40,
                                    height: 40,
                                    borderRadius: 12,
                                    border: palette.glassBorder,
                                    background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)',
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
                                        fontSize: 20,
                                        lineHeight: 1.15,
                                    }}
                                >
                                    نظام إدارة العروض العقارية
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
                                flex: 1,
                                minWidth: 320,
                                marginInlineStart: 12,
                            }}
                        >
                            <Search
                                placeholder="ابحث عن مدينة، حي، تفاصيل..."
                                onSearch={handleSearch}
                                enterButton="بحث"
                                allowClear
                                style={{ width: '100%', direction: 'ltr' }}
                            />
                            {currentUser ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Button
                                        type="text"
                                        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                                        onClick={() => setMode(isDark ? 'light' : 'dark')}
                                        aria-label="تبديل الوضع الليلي والنهاري"
                                        style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: 12,
                                            border: palette.glassBorder,
                                            color: palette.text,
                                            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)',
                                        }}
                                    />
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
                                        aria-label="إعدادات المنصة"
                                        style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: 12,
                                            border: palette.glassBorder,
                                            color: palette.text,
                                            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)',
                                        }}
                                    />
                                    <Button
                                        type="text"
                                        icon={<LogoutOutlined />}
                                        onClick={handleLogout}
                                        aria-label="تسجيل الخروج"
                                        style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: 12,
                                            border: palette.glassBorder,
                                            color: '#ef4444',
                                            background: isDark ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.75)',
                                        }}
                                    />
                                </div>
                            ) : (
                                <Text style={{ whiteSpace: 'nowrap', color: palette.textMuted }}>غير مسجل الدخول</Text>
                            )}
                        </div>
                    </div>
                </Header>
                <Content style={{ margin: '20px 16px 16px' }}>
                    <PropertyForm onSuccess={handlePropertyCreated} currentUser={currentUser} />
                    <PropertyList
                        properties={properties}
                        loading={loading}
                        onRefresh={fetchAndSetProperties}
                        currentUser={currentUser}
                    />
                </Content>
            </Layout>
        </Layout>
        </ConfigProvider>
    );
};

export default App;
