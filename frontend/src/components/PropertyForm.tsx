import React, { useState } from 'react';
import { Form, Input, InputNumber, Button, message, Card, Upload, Alert, Radio, Row, Col } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { createProperty, uploadFile, type UserPublic } from '../services/api';
import { useNavigate } from 'react-router-dom';

const { TextArea } = Input;

const parseVideoLinks = (value?: string): string[] =>
    (value || '')
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean);

interface PropertyFormProps {
    onSuccess: () => void; // Callback to refresh data
    currentUser?: UserPublic | null;
}

type AddMode = 'ai' | 'manual';

interface PropertyFormValues {
    raw_text?: string;
    map_url?: string;
    video_links?: string;
    city?: string;
    neighborhood?: string;
    property_type?: string;
    area?: number | null;
    price?: number | null;
    details?: string;
    owner_name?: string;
    owner_contact_number?: string;
    marketer_contact_number?: string;
    formatted_description?: string;
    region_within_city?: string;
}

const PropertyForm: React.FC<PropertyFormProps> = ({ onSuccess, currentUser }) => {
    const [loading, setLoading] = useState(false);
    const [addMode, setAddMode] = useState<AddMode>('ai');
    const [form] = Form.useForm();
    const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);
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

    const handleFinish = async (values: PropertyFormValues) => {
        setLoading(true);
        try {
            const images = imageFiles
                .map((f) => f.url)
                .filter((u): u is string => typeof u === 'string');
            const videos = parseVideoLinks(values.video_links);
            const documents = docFiles
                .map((f) => f.url)
                .filter((u): u is string => typeof u === 'string');
            const manualRawText = [
                values.property_type,
                values.neighborhood,
                values.city,
                values.area ? `المساحة ${values.area}م²` : null,
                values.price ? `السعر ${values.price} ر.س` : null,
                values.details,
            ].filter(Boolean).join(' - ');

            await createProperty({
                input_mode: addMode,
                raw_text: addMode === 'ai' ? values.raw_text || '' : manualRawText,
                city: values.city,
                neighborhood: values.neighborhood,
                property_type: values.property_type,
                area: values.area,
                price: values.price,
                details: values.details,
                owner_name: values.owner_name,
                owner_contact_number: values.owner_contact_number,
                marketer_contact_number: values.marketer_contact_number,
                formatted_description: values.formatted_description,
                region_within_city: values.region_within_city,
                images,
                videos,
                documents,
                map_url: values.map_url || null,
            });
            message.success('تمت إضافة العرض العقاري بنجاح!');
            form.resetFields();
            setImageFiles([]);
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
        <Card
            title="إضافة عرض عقاري جديد"
            style={{
                marginBottom: 24,
                borderRadius: 18,
                boxShadow: '0 10px 24px rgba(41,66,49,0.1)',
                border: '1px solid #e2e7dd',
            }}
            styles={{ header: { fontWeight: 700, color: '#2f4d37' } }}
        >
            {showUpgradeHint && currentUser?.role === 'owner' && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="لا يمكنك إضافة عروض جديدة قبل الاشتراك في إحدى الخطط."
                    description="اختر خطة اشتراك مناسبة لمكتبك العقاري من صفحة الإعدادات، ثم أعد المحاولة."
                    action={
                        <Button type="primary" size="small" style={{ background: '#3f7d3c' }} onClick={() => navigate('/settings')}>
                            ترقية الخطة الآن
                        </Button>
                    }
                />
            )}
            <Form form={form} onFinish={handleFinish} layout="vertical">
                <Form.Item label="طريقة الإضافة">
                    <Radio.Group
                        value={addMode}
                        onChange={(event) => setAddMode(event.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                    >
                        <Radio.Button value="ai">بالذكاء الاصطناعي</Radio.Button>
                        <Radio.Button value="manual">إضافة يدوية</Radio.Button>
                    </Radio.Group>
                </Form.Item>

                {addMode === 'ai' ? (
                    <Form.Item
                        name="raw_text"
                        label="الصق نص العرض العقاري هنا"
                        rules={[{ required: true, message: 'الرجاء إدخال نص العرض!' }]}
                    >
                        <TextArea rows={6} placeholder="مثال: فيلا في حي الفيحاء بمدينة جدة، مساحتها 300م..." />
                    </Form.Item>
                ) : (
                    <>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="property_type"
                                    label="نوع العقار"
                                    rules={[{ required: true, message: 'الرجاء إدخال نوع العقار' }]}
                                >
                                    <Input placeholder="مثال: فيلا، شقة، أرض، عمارة" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="city"
                                    label="المدينة"
                                    rules={[{ required: true, message: 'الرجاء إدخال المدينة' }]}
                                >
                                    <Input placeholder="مثال: الرياض" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="neighborhood" label="الحي">
                                    <Input placeholder="مثال: النرجس" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="region_within_city" label="المنطقة داخل المدينة">
                                    <Input placeholder="مثال: شمال، جنوب، شرق، غرب" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="area" label="المساحة (م²)">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="مثال: 300" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="price" label="السعر">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="مثال: 1200000" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="owner_name" label="اسم المالك">
                                    <Input placeholder="اختياري" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="owner_contact_number" label="رقم المالك">
                                    <Input placeholder="اختياري" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="marketer_contact_number" label="رقم المسوّق">
                                    <Input placeholder="اختياري" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="details" label="تفاصيل العقار">
                            <TextArea rows={4} placeholder="اكتب تفاصيل العقار، المميزات، الشارع، الواجهة، العمر..." />
                        </Form.Item>
                        <Form.Item name="formatted_description" label="وصف العرض العام">
                            <TextArea rows={3} placeholder="وصف يظهر في تفاصيل العرض والصفحة العامة. إذا تركته فارغًا سيتم استخدام التفاصيل." />
                        </Form.Item>
                    </>
                )}
                <Form.Item
                    name="images"
                    label="صور العقار (تظهر في بطاقة العرض، يمكنك إضافة أكثر من صورة)"
                >
                    <Upload
                        multiple
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
                    name="video_links"
                    label="روابط فيديوهات العقار"
                    tooltip="يدعم روابط TikTok و YouTube Shorts و Instagram Reels. ضع كل رابط في سطر مستقل."
                >
                    <TextArea
                        rows={3}
                        placeholder={`مثال:
https://www.tiktok.com/@account/video/123456789
https://youtube.com/shorts/VIDEO_ID
https://www.instagram.com/reel/REEL_ID/`}
                    />
                </Form.Item>

                <Form.Item
                    name="documents"
                    label="ملفات مرفقة (مثلاً صك PDF، كروكي…، تظهر داخل تفاصيل العرض)"
                >
                    <Upload
                        multiple
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
                    <Button type="primary" htmlType="submit" loading={loading} style={{ background: '#3f7d3c' }}>
                        {addMode === 'ai' ? 'تحليل وإضافة العرض' : 'إضافة العرض يدويًا'}
                    </Button>
                </Form.Item>
            </Form>
        </Card>
    );
};

export default PropertyForm;
