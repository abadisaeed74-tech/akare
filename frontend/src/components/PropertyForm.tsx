import React, { useState } from 'react';
import { Form, Input, Button, message, Card, Upload, Alert } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { createProperty, uploadFile, type UserPublic } from '../services/api';
import { useNavigate } from 'react-router-dom';

const { TextArea } = Input;

interface PropertyFormProps {
    onSuccess: () => void; // Callback to refresh data
    currentUser?: UserPublic | null;
}

const PropertyForm: React.FC<PropertyFormProps> = ({ onSuccess, currentUser }) => {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);
    const [videoFiles, setVideoFiles] = useState<UploadFile[]>([]);
    const [docFiles, setDocFiles] = useState<UploadFile[]>([]);
    const [showUpgradeHint, setShowUpgradeHint] = useState(false);
    const navigate = useNavigate();

    const uploadAndStore = async (file: UploadFile, setter: React.Dispatch<React.SetStateAction<UploadFile[]>>) => {
        try {
            const origin = file.originFileObj as File | undefined;
            if (!origin) return;
            const url = await uploadFile(origin);
            setter((prev) =>
                prev.map((f) =>
                    f.uid === file.uid
                        ? {
                              ...f,
                              url,
                              status: 'done',
                          }
                        : f,
                ),
            );
            message.success('تم رفع الملف بنجاح');
        } catch (e) {
            console.error(e);
            message.error('فشل في رفع الملف');
        }
    };

    const handleFinish = async (values: { raw_text: string; map_url?: string }) => {
        setLoading(true);
        try {
            const images = imageFiles
                .map((f) => f.url)
                .filter((u): u is string => typeof u === 'string');
            const videos = videoFiles
                .map((f) => f.url)
                .filter((u): u is string => typeof u === 'string');
            const documents = docFiles
                .map((f) => f.url)
                .filter((u): u is string => typeof u === 'string');

            await createProperty({
                raw_text: values.raw_text,
                images,
                videos,
                documents,
                map_url: values.map_url || null,
            });
            message.success('تمت إضافة العرض العقاري بنجاح!');
            form.resetFields();
            setImageFiles([]);
            setVideoFiles([]);
            setDocFiles([]);
            onSuccess(); // Trigger data refresh in parent component
        } catch (error: any) {
            const detail = error.response?.data?.detail || 'فشل في إضافة العرض.';
            if (error.response?.status === 403 && typeof detail === 'string' && detail.includes('الاشتراك في إحدى الخطط')) {
                // الحساب غير مشترك في أي خطة
                setShowUpgradeHint(true);
            }
            if (typeof detail === 'string' && detail.includes('RESOURCE_EXHAUSTED')) {
                message.warning('تم حفظ العرض، لكن تحليل الذكاء الاصطناعي موقّتًا متوقف بسبب انتهاء الحد اليومي. يمكنك تعديل البيانات يدويًا من قائمة العروض.');
            } else {
                message.error(`خطأ: ${detail}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title="إضافة عرض عقاري جديد" style={{ marginBottom: 24 }}>
            {showUpgradeHint && currentUser?.role === 'owner' && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="لا يمكنك إضافة عروض جديدة قبل الاشتراك في إحدى الخطط."
                    description="اختر خطة اشتراك مناسبة لمكتبك العقاري من صفحة الإعدادات، ثم أعد المحاولة."
                    action={
                        <Button type="primary" size="small" onClick={() => navigate('/settings')}>
                            ترقية الخطة الآن
                        </Button>
                    }
                />
            )}
            <Form form={form} onFinish={handleFinish} layout="vertical">
                <Form.Item
                    name="raw_text"
                    label="الصق نص العرض العقاري هنا"
                    rules={[{ required: true, message: 'الرجاء إدخال نص العرض!' }]}
                >
                    <TextArea rows={6} placeholder="مثال: فيلا في حي الفيحاء بمدينة جدة، مساحتها 300م..." />
                </Form.Item>
                <Form.Item
                    name="images"
                    label="صور العقار (تظهر في بطاقة العرض، يمكنك إضافة أكثر من صورة)"
                >
                    <Upload
                        listType="picture-card"
                        fileList={imageFiles}
                        beforeUpload={(file) => {
                            const uploadFileObj: UploadFile = {
                                uid: file.uid,
                                name: file.name,
                                status: 'uploading',
                                originFileObj: file,
                            };
                            setImageFiles((prev) => prev.concat(uploadFileObj));
                            uploadAndStore(uploadFileObj, setImageFiles);
                            return false;
                        }}
                        onRemove={(file) => {
                            setImageFiles((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                    >
                        {imageFiles.length >= 10 ? null : <div>+ إضافة صورة</div>}
                    </Upload>
                </Form.Item>

                <Form.Item
                    name="videos"
                    label="فيديوهات / جولات للعقار (تظهر داخل تفاصيل العرض)"
                >
                    <Upload
                        fileList={videoFiles}
                        beforeUpload={(file) => {
                            const uploadFileObj: UploadFile = {
                                uid: file.uid,
                                name: file.name,
                                status: 'uploading',
                                originFileObj: file,
                            };
                            setVideoFiles((prev) => prev.concat(uploadFileObj));
                            uploadAndStore(uploadFileObj, setVideoFiles);
                            return false;
                        }}
                        onRemove={(file) => {
                            setVideoFiles((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                    >
                        <Button>إضافة فيديو</Button>
                    </Upload>
                </Form.Item>

                <Form.Item
                    name="documents"
                    label="ملفات مرفقة (مثلاً صك PDF، كروكي…، تظهر داخل تفاصيل العرض)"
                >
                    <Upload
                        fileList={docFiles}
                        beforeUpload={(file) => {
                            const uploadFileObj: UploadFile = {
                                uid: file.uid,
                                name: file.name,
                                status: 'uploading',
                                originFileObj: file,
                            };
                            setDocFiles((prev) => prev.concat(uploadFileObj));
                            uploadAndStore(uploadFileObj, setDocFiles);
                            return false;
                        }}
                        onRemove={(file) => {
                            setDocFiles((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                    >
                        <Button>إضافة ملف</Button>
                    </Upload>
                </Form.Item>

                <Form.Item
                    name="map_url"
                    label="رابط موقع العقار على خرائط جوجل (اختياري، يظهر في تفاصيل العرض)"
                >
                    <Input placeholder="مثال: رابط Google Maps لموقع العقار" />
                </Form.Item>

                <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading}>
                        تحليل وإضافة العرض
                    </Button>
                </Form.Item>
            </Form>
        </Card>
    );
};

export default PropertyForm;
