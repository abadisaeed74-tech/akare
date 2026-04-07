import React from 'react';
import { Card, Tabs, Form, Input, Button, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { registerUser, loginUser, getCurrentUser, setAuthToken } from '../services/api';

const { Title, Text } = Typography;

const AuthPage: React.FC = () => {
  const navigate = useNavigate();

  const handleRegister = async (values: { email: string; password: string; gemini_api_key?: string }) => {
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ width: 420 }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
          لوحة دخول المكاتب العقارية
        </Title>
        <Tabs
          defaultActiveKey="login"
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
                    <Button type="primary" htmlType="submit" block>
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
                  <Form.Item label="مفتاح Gemini (اختياري)" name="gemini_api_key">
                    <Input.Password placeholder="ضع مفتاح Gemini الخاص بمكتبك" />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" block>
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


