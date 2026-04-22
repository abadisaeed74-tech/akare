import React, { useEffect, useState } from 'react';
import { Card, Tabs, Form, Input, Button, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { registerUser, loginUser, getCurrentUser, setAuthToken } from '../services/api';

const { Title, Text } = Typography;

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(
    mode === 'register' ? 'register' : 'login'
  );

  useEffect(() => {
    setActiveTab(mode === 'register' ? 'register' : 'login');
  }, [mode]);

  const handleRegister = async (values: { email: string; password: string }) => {
    try {
      await registerUser(values);
      message.success('تم إنشاء الحساب بنجاح، قم بتسجيل الدخول الآن.');
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'فشل في إنشاء الحساب.';
      message.error(`خطأ: ${detail}`);
    }
  };

  const handleLogin = async (values: { email: string; password: string }) => {
    try {
      const res = await loginUser(values.email, values.password);
      setAuthToken(res.access_token);
      await getCurrentUser(); // فقط للتأكد أن التوكن صالح
      message.success('تم تسجيل الدخول بنجاح.');
      navigate('/app', { replace: true });
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'فشل في تسجيل الدخول.';
      message.error(`خطأ: ${detail}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)', padding: 16 }}>
      <Card style={{ width: 440, borderRadius: 18, border: '1px solid #e4e7df', boxShadow: '0 14px 30px rgba(41,66,49,0.08)' }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
          لوحة دخول المكاتب العقارية
        </Title>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'login' | 'register')}
          items={[
            {
              key: 'login',
              label: 'تسجيل الدخول',
              children: (
                <Form layout="vertical" onFinish={handleLogin}>
                  <Form.Item
                    label="البريد الإلكتروني"
                    name="email"
                    rules={[{ required: true, message: 'الرجاء إدخال البريد الإلكتروني' }]}
                  >
                    <Input type="email" />
                  </Form.Item>
                  <Form.Item
                    label="كلمة المرور"
                    name="password"
                    rules={[{ required: true, message: 'الرجاء إدخال كلمة المرور' }]}
                  >
                    <Input.Password />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" block style={{ background: '#3f7d3c' }}>
                      دخول
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: 'إنشاء حساب جديد',
              children: (
                <Form layout="vertical" onFinish={handleRegister}>
                  <Form.Item
                    label="البريد الإلكتروني"
                    name="email"
                    rules={[{ required: true, message: 'الرجاء إدخال البريد الإلكتروني' }]}
                  >
                    <Input type="email" />
                  </Form.Item>
                  <Form.Item
                    label="كلمة المرور"
                    name="password"
                    rules={[{ required: true, message: 'الرجاء إدخال كلمة المرور' }]}
                  >
                    <Input.Password />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" block style={{ background: '#3f7d3c' }}>
                      تسجيل
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
        <Text type="secondary">بعد تسجيل الدخول سيتم نقلك للوحة إدارة عقارات مكتبك.</Text>
      </Card>
    </div>
  );
};

export default AuthPage;


