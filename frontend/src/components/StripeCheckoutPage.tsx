import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Alert, Button, Descriptions, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSettingsOverview, activateSubscription, type SettingsOverview } from '../services/api';

const { Title, Text } = Typography;

const StripeCheckoutPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SettingsOverview | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSettingsOverview();
        setOverview(data);
      } catch (e: any) {
        const detail = e?.response?.data?.detail || 'فشل في تحميل بيانات الاشتراك.';
        setError(detail);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert type="error" message={error || 'فشل في تحميل صفحة الدفع.'} />
      </div>
    );
  }

  const planFromQuery = searchParams.get('plan');
  const activePlan =
    planFromQuery && planFromQuery === overview.plan_usage.plan.key
      ? overview.plan_usage.plan
      : overview.plan_usage.plan;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        direction: 'rtl',
        padding: 16,
      }}
    >
      <Card style={{ width: 480, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          صفحة الدفع
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
          سيتم ربط الدفع لاحقًا مع Stripe بشكل كامل، هذه الصفحة تصميم مبدئي لتجربة التدفق.
        </Text>

        <Descriptions bordered column={1} size="middle" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="اسم المكتب">
            {overview.company.company_name || 'لم يتم تحديد اسم الشركة بعد'}
          </Descriptions.Item>
          <Descriptions.Item label="الخطة المختارة">
            {activePlan.name} ({activePlan.key})
          </Descriptions.Item>
          {activePlan.price_monthly_sar != null && (
            <Descriptions.Item label="سعر الاشتراك الشهري">
              {activePlan.price_monthly_sar.toLocaleString('ar-SA')} ر.س / شهر
            </Descriptions.Item>
          )}
        </Descriptions>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="دفع عبر Stripe (تجريبي)"
          description="في النسخة القادمة سيتم تحويلك مباشرة إلى صفحة دفع Stripe الآمنة لإكمال عملية الاشتراك."
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Button
            type="primary"
            block
            onClick={async () => {
              try {
                await activateSubscription(activePlan.key);
                message.success('تم تفعيل الاشتراك في الخطة بنجاح. سيتم ربط Stripe فعليًا في المرحلة القادمة.');
                navigate('/settings');
              } catch (e: any) {
                const detail = e?.response?.data?.detail || 'فشل في تفعيل الاشتراك.';
                message.error(detail);
              }
            }}
          >
            إكمال الدفع عبر Stripe
          </Button>
          <Button block onClick={() => navigate('/settings')}>
            الرجوع إلى الإعدادات
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default StripeCheckoutPage;


