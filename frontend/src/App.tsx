import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, message, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { SettingOutlined, LogoutOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Property, getProperties, aiSearchProperties, UserPublic, getCurrentUser, setAuthToken } from './services/api';
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
    const [siderCollapsed, setSiderCollapsed] = useState<boolean>(false);
    const [treeReloadKey, setTreeReloadKey] = useState<number>(0);
    const navigate = useNavigate();

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
            } catch {
                setCurrentUser(null);
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

    return (
        <Layout style={{ minHeight: '100vh', direction: 'rtl' }}>
            <Sider
                width={250}
                collapsible
                collapsed={siderCollapsed}
                onCollapse={(collapsed) => setSiderCollapsed(collapsed)}
                collapsedWidth={0}
                breakpoint="lg"
                trigger={siderCollapsed ? <RightOutlined /> : <LeftOutlined />}
                style={{ background: '#f0f2f5', borderLeft: '1px solid #e8e8e8' }}
            >
                <div style={{ padding: '16px', textAlign: 'center' }}>
                    <Title level={4} style={{ color: '#1890ff' }}>عقاري</Title>
                </div>
                <NavigationTree onSelect={handleSelectInTree} reloadKey={treeReloadKey} />
            </Sider>
            <Layout>
                <Header style={{ background: '#fff', padding: '0 16px', borderBottom: '1px solid #e8e8e8' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            rowGap: 8,
                        }}
                    >
                        <Title
                            level={3}
                            style={{
                                color: '#001529',
                                margin: 0,
                                whiteSpace: 'nowrap',
                                fontSize: 20,
                            }}
                        >
                            نظام إدارة العروض العقارية
                        </Title>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                flex: 1,
                                minWidth: 260,
                            }}
                        >
                            <Search
                                placeholder="ابحث عن مدينة، حي، تفاصيل..."
                                onSearch={handleSearch}
                                enterButton
                                allowClear
                                style={{ width: '100%', direction: 'ltr' }}
                            />
                            {currentUser ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Button
                                        type="link"
                                        icon={<SettingOutlined />}
                                        onClick={() => {
                                            if (currentUser?.role !== 'owner') {
                                                message.error('ليس لديك صلاحية فتح صفحة الإعدادات. تواصل مع مالك الحساب.');
                                                return;
                                            }
                                            navigate('/settings');
                                        }}
                                        aria-label="إعدادات المنصة"
                                    />
                                    <Button
                                        type="link"
                                        icon={<LogoutOutlined />}
                                        onClick={handleLogout}
                                        aria-label="تسجيل الخروج"
                                    />
                                </div>
                            ) : (
                                <Text style={{ whiteSpace: 'nowrap' }}>غير مسجل الدخول</Text>
                            )}
                        </div>
                    </div>
                </Header>
                <Content style={{ margin: '24px 16px 0' }}>
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
    );
};

export default App;
