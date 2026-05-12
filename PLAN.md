# خطة تطوير قسم المواعيد والمتابعة

## ملخص المتطلبات

1. إنشاء قسم جديد "المواعيد و المتابعة" متكامل مع المنصة
2. عرض المواعيد والمتابعات فقط للموظف المسؤول عن العملاء المكلفين بهم
3. إضافة حقل "تفاصيل المتابعة" في نماذج العروض والطلبات
4. إظهار تفاصيل المتابعة في القسم الجديد فقط

---

## الحالة الحالية

### الـ Backend
- ✅ نموذج `AppointmentItem` مع حقل `follow_up_details`
- ✅ نقطة `/appointments` مع تحكم وصول الموظفين
- ✅ نماذج `ClientRequest` و `ClientOffer` مع حقول `reminder_type`, `deadline_at`, `follow_up_details`

### الـ Frontend
- ✅ مكون `AppointmentsPage`
- ✅ واجهة `Appointment` في api.ts

---

## خطة التنفيذ

### 1. تحديث Backend - نموذج المواعيد

**الملف:** `backend/main.py`

إضافة حقول محسوبة للنموذج:
```python
client_key: Optional[str] = None    # "name|phone" للتنقل
source_id: Optional[str] = None     # نفس id للتنقل
source_type: Optional[str] = None   # "request" أو "offer"
title: Optional[str] = None       # وصف العرض/الطلب
```

تحديث نقطة `/appointments` لإضافة الحقول المحسوبة.

### 2. تحديث Frontend - api.ts

**الملف:** `frontend/src/services/api.ts`

تحديث واجهة `Appointment`:
```typescript
interface Appointment {
  // ... existing fields
  client_key?: string;
  source_id?: string;
  source_type?: string;
  title?: string;
}
```

### 3. تحديث Frontend - AppointmentsPage

**الملف:** `frontend/src/components/AppointmentsPage.tsx`

- عرض `follow_up_details` بشكل صحيح
- إضافة الحقول المحسوبة للتنقل
- تحسين واجهة المستخدم

### 4. تحديث ClientProfilePage

**الملف:** `frontend/src/components/ClientProfilePage.tsx`

- إضافة حقل "تفاصيل المتابعة" في نموذج المتابعة
- حفظ القيمة عند إنشاء/تعديل المتابعة

---

## الملفات المطلوب تعديلها

1. `backend/main.py` - AppointmentItem + /appointments endpoint
2. `frontend/src/services/api.ts` - Appointment interface
3. `frontend/src/components/AppointmentsPage.tsx` - display improvements
4. `frontend/src/components/ClientProfilePage.tsx` - follow_up_details field

---

## خطوات التنفيذ

### الخطوة 1: Backend
- [ ] إضافة الحقول المحسوبة لـ AppointmentItem
- [ ] تحديث /appointments لرفع الحقول الجديدة

### الخطوة 2: Frontend API
- [ ] تحديث Appointment interface

### الخطوة 3: Frontend Components
- [ ] تحديث AppointmentsPage
- [ ] إضافة حقل في ClientProfilePage

---

## ملاحظات

- نظام تحكم الوصول موجود بالفعل: الموظفون يرون فقط مواعيد عملائهم المسندة إليهم
- حقل `follow_up_details` موجود بالفعل في قاعدة البيانات
- المطلوب فقط واجهة العرض بشكل صحيح
