import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PhoneOutlined,
  DeleteOutlined,
  UserOutlined,
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ar';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  getAppointments,
  updateClientRequest,
  updateClientOffer,
  getClientNotes,
  createClientNote,
  deleteClientNote,
  getClientOfferNotes,
  createClientOfferNote,
  deleteClientOfferNote,
  getCurrentUser,
  type Appointment,
  type ClientNote,
  type UserPublic,
} from '../services/api';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ar');

const SAUDI_TZ = 'Asia/Riyadh';

const { Title, Text, Paragraph } = Typography;
const { Content } = Layout;

type AppointmentTab = 'all' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'overdue' | 'calendar';
type ActivityFilter = 'all' | 'viewing' | 'follow_up' | 'other';
type StatusFilter = 'all' | 'pending' | 'overdue' | 'done';
type SourceFilter = 'all' | 'request' | 'offer';
type DateRangeFilter = 'all' | 'week' | 'month';

const calendarTheme = {
  green: '#1a7a4a',
  greenLight: '#22a060',
  greenPale: '#e8f5ee',
  greenMid: '#d0eddc',
  orange: '#f97316',
  red: '#ef4444',
  blue: '#3b82f6',
  textDark: '#1a1f2e',
  textMid: '#4b5563',
  textLight: '#9ca3af',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
};

const getAppointmentIcon = (type?: string | null) => {
  if (type === 'viewing') return <EyeOutlined />;
  if (type === 'follow_up') return <PhoneOutlined />;
  return <ClockCircleOutlined />;
};

const getAppointmentColor = (type?: string | null) => {
  if (type === 'viewing') return 'orange';
  if (type === 'follow_up') return 'blue';
  return 'default';
};

const getAppointmentLabel = (type?: string | null) => {
  if (type === 'viewing') return 'معاينة';
  if (type === 'follow_up') return 'متابعة';
  return 'غير محدد';
};

const groupAppointmentsByDay = (appointments: Appointment[]) => {
  const grouped: Record<string, Appointment[]> = {};
  appointments.forEach((appt) => {
    const deadline = appt.deadline_at;
    if (!deadline) return;
    // Parse as UTC first (from toISOString()), then convert to Saudi timezone for grouping
    const day = dayjs.utc(deadline).tz(SAUDI_TZ).startOf('day').format('YYYY-MM-DD');
    if (!grouped[day]) {
      grouped[day] = [];
    }
    grouped[day].push(appt);
  });
  return grouped;
};

const AppointmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
const [activeTab, setActiveTab] = useState<AppointmentTab>('all');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(() => dayjs().tz(SAUDI_TZ).startOf('month'));
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('all');
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [editingReminder, setEditingReminder] = useState<Appointment | null>(null);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderForm] = Form.useForm();
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const canSeeAssignedEmployee = currentUser?.role === 'owner' || currentUser?.role === 'manager';

useEffect(() => {
    const loadAppointments = async () => {
      setLoading(true);
      try {
        const [data, user] = await Promise.all([
          getAppointments(),
          getCurrentUser().catch(() => null),
        ]);
        setCurrentUser(user);
        // Sort by deadline ascending (filter out null)
        const sorted = data
          .filter((a) => a.deadline_at)
          .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime());
        setAppointments(sorted);
        setFilteredAppointments(sorted);
      } catch (e: any) {
        message.error(e?.response?.data?.detail || 'فشل في تحميل المواعيد.');
      } finally {
        setLoading(false);
      }
    };
    loadAppointments();
  }, []);

useEffect(() => {
    const now = dayjs().tz(SAUDI_TZ);
    let filtered: Appointment[] = [];
    switch (activeTab) {
      case 'calendar':
        filtered = selectedCalendarDate
          ? appointments.filter((a) => {
            const deadline = a.deadline_at;
            return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(dayjs.tz(selectedCalendarDate, SAUDI_TZ), 'day');
          })
          : appointments;
        break;
      case 'today':
        filtered = appointments.filter((a) => {
          const deadline = a.deadline_at;
          return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(now, 'day');
        });
        break;
      case 'tomorrow':
        filtered = appointments.filter((a) => {
          const deadline = a.deadline_at;
          return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(now.add(1, 'day'), 'day');
        });
        break;
      case 'this_week':
        filtered = appointments.filter((a) => {
          const deadline = a.deadline_at;
          return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(now, 'week');
        });
        break;
      case 'next_week':
        filtered = appointments.filter((a) => {
          const deadline = a.deadline_at;
          return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(now.add(1, 'week'), 'week');
        });
        break;
      case 'overdue':
        filtered = appointments.filter((a) => {
          const deadline = a.deadline_at;
          return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isBefore(now);
        });
        break;
      case 'all':
      default:
        filtered = appointments;
        break;
    }

    filtered = filtered.filter((appt) => {
      const deadline = appt.deadline_at ? dayjs.utc(appt.deadline_at).tz(SAUDI_TZ) : null;
      if (activityFilter !== 'all') {
        if (activityFilter === 'other') {
          if (appt.reminder_type === 'viewing' || appt.reminder_type === 'follow_up') return false;
        } else if (appt.reminder_type !== activityFilter) {
          return false;
        }
      }

      if (sourceFilter !== 'all' && appt.source_type !== sourceFilter) return false;

      if (statusFilter === 'overdue' && (!deadline || !deadline.isBefore(now))) return false;
      if (statusFilter === 'pending' && (!deadline || deadline.isBefore(now) || appt.status === 'closed')) return false;
      if (statusFilter === 'done' && appt.status !== 'closed') return false;

      if (dateRangeFilter === 'week' && (!deadline || !deadline.isSame(now, 'week'))) return false;
      if (dateRangeFilter === 'month' && (!deadline || !deadline.isSame(now, 'month'))) return false;

      return true;
    });
    setFilteredAppointments(filtered);
  }, [activeTab, activityFilter, appointments, dateRangeFilter, selectedCalendarDate, sourceFilter, statusFilter]);

  const grouped = groupAppointmentsByDay(filteredAppointments);
  const sortedDays = Object.keys(grouped).sort();

  const appointmentDays = useMemo(() => groupAppointmentsByDay(appointments), [appointments]);
  const calendarCells = useMemo(() => {
    const firstDay = visibleCalendarMonth.startOf('month');
    const startOffset = (firstDay.day() + 1) % 7;
    const gridStart = firstDay.subtract(startOffset, 'day');

    return Array.from({ length: 42 }, (_, index) => {
      const date = gridStart.add(index, 'day');
      const key = date.format('YYYY-MM-DD');
      return {
        date,
        key,
        isCurrentMonth: date.isSame(visibleCalendarMonth, 'month'),
        isToday: date.isSame(dayjs().tz(SAUDI_TZ), 'day'),
        isSelected: selectedCalendarDate === key,
        appointmentsCount: appointmentDays[key]?.length || 0,
      };
    });
  }, [appointmentDays, selectedCalendarDate, visibleCalendarMonth]);

  const selectedCalendarCount = selectedCalendarDate ? appointmentDays[selectedCalendarDate]?.length || 0 : 0;

// Open reminder modal
  const openReminderModal = (appt: Appointment) => {
    setEditingReminder(appt);
    reminderForm.setFieldsValue({
      reminder_type: appt.reminder_type || undefined,
      deadline_at: appt.deadline_at ? dayjs.utc(appt.deadline_at).tz(SAUDI_TZ) : null,
      reminder_before_minutes: appt.reminder_before_minutes ?? 120,
      follow_up_details: appt.follow_up_details || undefined,
    });
    setReminderModalOpen(true);
  };

  // Save reminder
  const saveReminder = async () => {
    if (!editingReminder) return;
    try {
      const values = await reminderForm.validateFields();
      if (editingReminder.source_type === 'request') {
        await updateClientRequest(editingReminder.id, {
          reminder_type: values.reminder_type ?? null,
          deadline_at: values.deadline_at ? values.deadline_at.toISOString() : null,
          reminder_before_minutes: values.reminder_before_minutes ?? 120,
          follow_up_details: values.follow_up_details || null,
        });
      } else {
        await updateClientOffer(editingReminder.id, {
          reminder_type: values.reminder_type ?? null,
          deadline_at: values.deadline_at ? values.deadline_at.toISOString() : null,
          reminder_before_minutes: values.reminder_before_minutes ?? 120,
          follow_up_details: values.follow_up_details || null,
        });
      }
      message.success('تم حفظ المتابعة.');
      setReminderModalOpen(false);
      setEditingReminder(null);
      // Reload appointments
      const data = await getAppointments();
      const sorted = data
        .filter((a) => a.deadline_at)
        .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime());
      setAppointments(sorted);
      setFilteredAppointments(sorted);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل حفظ المتابعة.');
    }
  };

  const stats = {
            overdue: appointments.filter((a) => {
              const deadline = a.deadline_at;
              return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isBefore(dayjs());
            }).length,
            today: appointments.filter((a) => {
              const deadline = a.deadline_at;
              return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(dayjs(), 'day');
            }).length,
            thisWeek: appointments.filter((a) => {
              const deadline = a.deadline_at;
              return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isSame(dayjs(), 'week');
            }).length,
            total: appointments.length,
        };

  const openNotesModal = async (appt: Appointment) => {
    setSelectedAppointment(appt);
    setNotesModalOpen(true);
    setNewNoteContent('');
    setNotesLoading(true);
    try {
      if (appt.source_type === 'request') {
        const requestNotes = await getClientNotes(appt.id);
        setNotes(requestNotes);
      } else {
        const offerNotes = await getClientOfferNotes(appt.id);
        setNotes(offerNotes);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'تعذر تحميل الملاحظات.');
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const addQuickNote = async () => {
    if (!selectedAppointment) return;
    const content = newNoteContent.trim();
    if (!content) {
      message.warning('اكتب نص الملاحظة أولاً.');
      return;
    }
    setNotesSaving(true);
    try {
      let created: ClientNote;
      if (selectedAppointment.source_type === 'request') {
        created = await createClientNote(selectedAppointment.id, { content, color: '#cfd6cf' });
      } else {
        created = await createClientOfferNote(selectedAppointment.id, { content, color: '#cfd6cf' });
      }
      setNotes((prev) => [created, ...prev]);
      setNewNoteContent('');
      message.success('تمت إضافة الملاحظة.');
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل إضافة الملاحظة.');
    } finally {
      setNotesSaving(false);
    }
  };

  const removeNote = async (noteId: string) => {
    if (!selectedAppointment) return;
    try {
      if (selectedAppointment.source_type === 'request') {
        await deleteClientNote(selectedAppointment.id, noteId);
      } else {
        await deleteClientOfferNote(selectedAppointment.id, noteId);
      }
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      message.success('تم حذف الملاحظة.');
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'فشل حذف الملاحظة.');
    }
  };

  const selectCalendarDate = (dateKey: string) => {
    setSelectedCalendarDate(dateKey);
    setActiveTab('calendar');
  };

  const resetCalendarSelection = () => {
    setSelectedCalendarDate(null);
    setActiveTab('all');
  };

  const resetFilters = () => {
    setActivityFilter('all');
    setStatusFilter('all');
    setSourceFilter('all');
    setDateRangeFilter('all');
    setSelectedCalendarDate(null);
    setActiveTab('all');
  };

  const renderMiniCalendar = () => {
    const weekdays = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

    return (
      <Card
        title={(
          <Space>
            <CalendarOutlined style={{ color: calendarTheme.green }} />
            <span>التقويم</span>
          </Space>
        )}
        style={{ borderRadius: 12, border: `1px solid ${calendarTheme.border}` }}
        bodyStyle={{ padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Button
            type="text"
            shape="circle"
            icon={<LeftOutlined />}
            onClick={() => setVisibleCalendarMonth((prev) => prev.add(1, 'month'))}
            aria-label="الشهر التالي"
          />
          <Text strong style={{ color: calendarTheme.textDark }}>
            {visibleCalendarMonth.format('MMMM YYYY')}
          </Text>
          <Button
            type="text"
            shape="circle"
            icon={<RightOutlined />}
            onClick={() => setVisibleCalendarMonth((prev) => prev.subtract(1, 'month'))}
            aria-label="الشهر السابق"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
          {weekdays.map((day) => (
            <Text
              key={day}
              style={{ textAlign: 'center', color: calendarTheme.textLight, fontSize: 12, fontWeight: 700 }}
            >
              {day}
            </Text>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {calendarCells.map((cell) => {
            const background = cell.isSelected
              ? calendarTheme.greenMid
              : cell.isToday
                ? calendarTheme.green
                : cell.appointmentsCount
                  ? calendarTheme.greenPale
                  : 'transparent';
            const color = cell.isToday
              ? '#fff'
              : cell.isSelected || cell.appointmentsCount
                ? calendarTheme.green
                : cell.isCurrentMonth
                  ? calendarTheme.textDark
                  : calendarTheme.textLight;

            return (
              <button
                key={cell.key}
                type="button"
                title={cell.appointmentsCount ? `${cell.appointmentsCount} موعد` : 'لا توجد مواعيد'}
                onClick={() => selectCalendarDate(cell.key)}
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1 / 1',
                  border: cell.isSelected ? `1px solid ${calendarTheme.green}` : '1px solid transparent',
                  borderRadius: '50%',
                  background,
                  color,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: cell.isToday || cell.appointmentsCount ? 800 : 600,
                  opacity: cell.isCurrentMonth ? 1 : 0.42,
                  transition: 'all 0.18s ease',
                }}
              >
                {cell.date.date()}
                {cell.appointmentsCount > 0 ? (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: cell.isToday ? '#fff' : calendarTheme.green,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 10,
            borderRadius: 10,
            background: selectedCalendarDate ? calendarTheme.greenPale : calendarTheme.borderLight,
            display: 'grid',
            gap: 4,
            textAlign: 'right',
          }}
        >
          <Text strong style={{ color: selectedCalendarDate ? calendarTheme.green : calendarTheme.textMid }}>
            {selectedCalendarDate
              ? dayjs(selectedCalendarDate).format('dddd، D MMMM YYYY')
              : 'اختر يوما من التقويم'}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {selectedCalendarDate
              ? `${selectedCalendarCount} موعد في هذا اليوم`
              : 'الأيام المظللة تحتوي على مواعيد أو متابعات.'}
          </Text>
        </div>

        <Space style={{ width: '100%', marginTop: 12 }} direction="vertical">
          <Button
            block
            icon={<CalendarOutlined />}
            onClick={() => {
              const today = dayjs().tz(SAUDI_TZ);
              setVisibleCalendarMonth(today.startOf('month'));
              selectCalendarDate(today.format('YYYY-MM-DD'));
            }}
          >
            مواعيد اليوم
          </Button>
          <Button block icon={<ReloadOutlined />} onClick={resetCalendarSelection}>
            عرض كل المواعيد
          </Button>
        </Space>
      </Card>
    );
  };

  const renderDayGroup = (day: string, dayAppointments: Appointment[]) => {
    const dayjsDate = dayjs(day);
    const isCollapsed = !!collapsedDays[day];
    let dayLabel = dayjsDate.format('dddd, D MMMM YYYY');
    if (dayjsDate.isSame(dayjs(), 'day')) {
      dayLabel = `اليوم - ${dayLabel}`;
    } else if (dayjsDate.isSame(dayjs().add(1, 'day'), 'day')) {
      dayLabel = `غداً - ${dayLabel}`;
    }

    return (
      <div key={day}>
        <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #f0f0f0', borderTop: '1px solid #f0f0f0', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Space size={8}>
            <Text strong>{dayLabel}</Text>
            <Tag color="green">{dayAppointments.length}</Tag>
          </Space>
          <Button
            size="small"
            type="text"
            icon={isCollapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={() => setCollapsedDays((prev) => ({ ...prev, [day]: !prev[day] }))}
            title={isCollapsed ? 'إظهار مواعيد اليوم' : 'إخفاء مواعيد اليوم'}
          />
        </div>
{!isCollapsed && dayAppointments.map((appt) => (
          <Card
            key={appt.source_id}
            hoverable
            style={{ marginBottom: 12, borderRadius: 12 }}
            bodyStyle={{ padding: '12px 16px' }}
            onClick={() => {
              const key = appt.client_key || `${appt.client_name}|${appt.phone_number || ''}`;
              navigate(`/app/clients/${encodeURIComponent(key)}`);
            }}
          >
<Row align="middle" gutter={[12, 8]} wrap>
              <Col flex="60px" style={{ textAlign: 'center' }}>
                <Title level={5} style={{ margin: 0 }}>
                  {(() => {
                    const deadline = appt.deadline_at;
                    return deadline ? dayjs.utc(deadline).tz(SAUDI_TZ).format('h:mm') : '--:--';
                  })()}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {(() => {
                    const deadline = appt.deadline_at;
                    return deadline ? dayjs.utc(deadline).tz(SAUDI_TZ).format('A') : '';
                  })()}
                </Text>
<div style={{ marginTop: 4 }}>
                  <Tag color={(() => {
                    const deadline = appt.deadline_at;
                    return deadline && dayjs.utc(deadline).tz(SAUDI_TZ).isBefore(dayjs()) ? 'red' : 'blue';
                  })()}>
                    {(() => {
                      const deadline = appt.deadline_at;
                      return deadline ? dayjs.utc(deadline).tz(SAUDI_TZ).fromNow() : 'غير محدد';
                    })()}
                  </Tag>
                </div>
              </Col>

<Col flex="auto">
                <Space align="center" style={{ marginBottom: 8 }}>
                  <Avatar icon={<UserOutlined />} size="small" />
                  <Text strong>{appt.client_name}</Text>
                </Space>
                <Paragraph style={{ margin: 0, fontSize: 12 }} type="secondary">
                  {appt.source_type === 'request' ? 'طلب' : 'عرض'}: {appt.title}
                </Paragraph>
                {canSeeAssignedEmployee && appt.assigned_user_name ? (
                  <Space size={6} style={{ marginTop: 4 }}>
                    <UserOutlined style={{ color: calendarTheme.textLight, fontSize: 12 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      المسؤول: {appt.assigned_user_name}
                    </Text>
                  </Space>
                ) : null}
                {appt.follow_up_details ? (
                  <Paragraph style={{ margin: '4px 0 0', fontSize: 13 }}>
                    <Text strong> المتابعة:</Text> {appt.follow_up_details}
                  </Paragraph>
                ) : null}
              </Col>

<Col flex="140px" style={{ textAlign: 'left' }}>
<Tag
                  icon={getAppointmentIcon(appt.reminder_type ?? undefined)}
                  color={getAppointmentColor(appt.reminder_type ?? undefined)}
                  style={{ marginBottom: 8 }}
                >
                  {getAppointmentLabel(appt.reminder_type ?? undefined)}
                </Tag>
<Space>
                  <Button
                    size="small"
                    shape="circle"
                    icon={<CheckOutlined />}
                    title={appt.source_type === 'request' ? 'إكمال الموعد' : 'إكمال متابعة'}
onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        if (appt.source_type === 'request') {
                          await updateClientRequest(appt.id, {
                            status: 'closed',
                            reminder_type: null,
                            deadline_at: null,
                            follow_up_details: appt.follow_up_details || undefined
                          });
                        } else {
                          await updateClientOffer(appt.id, {
                            status: 'closed',
                            reminder_type: null,
                            deadline_at: null,
                            follow_up_details: appt.follow_up_details || undefined
                          });
                        }
                        message.success('تم إكمال الموعد بنجاح');
                        // Reload appointments
                        const data = await getAppointments();
                        const sorted = data
                          .filter((a) => a.deadline_at)
                          .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime());
                        setAppointments(sorted);
                        setFilteredAppointments(sorted);
                      } catch (err: any) {
                        message.error(err?.response?.data?.detail || 'تعذر إكمال الموعد');
                      }
                    }}
                  />
                  <Button
                    size="small"
                    shape="circle"
                    icon={<FileTextOutlined />}
                    title="الملاحظات"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNotesModal(appt);
                    }}
                  />
<Button
                    size="small"
                    shape="circle"
                    icon={<EditOutlined />}
                    title="تعديل/إعادة جدولة"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReminderModal(appt);
                    }}
                  />
                </Space>
              </Col>
            </Row>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <Content style={{ padding: '0 1px' }}>
      <Title level={3}> </Title>
      <Paragraph type="secondary">
        جميع مواعيدك ومتابعاتك القادمة للعملاء المسؤول عنهم فقط.
      </Paragraph>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="مواعيد متأخرة" value={stats.overdue} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="مواعيد اليوم" value={stats.today} valueStyle={{ color: '#d48806' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="مواعيد هذا الأسبوع" value={stats.thisWeek} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="إجمالي المواعيد" value={stats.total} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card
            loading={loading}
            style={{ borderRadius: 12 }}
            bodyStyle={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 310px)', minHeight: 420, overflow: 'hidden' }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key as AppointmentTab);
                if (key !== 'calendar') {
                  setSelectedCalendarDate(null);
                }
              }}
              items={[
                { key: 'all', label: 'الكل' },
                { key: 'today', label: 'اليوم' },
                { key: 'tomorrow', label: 'غداً' },
                { key: 'this_week', label: 'هذا الأسبوع' },
                { key: 'next_week', label: 'الأسبوع القادم' },
                { key: 'overdue', label: 'المتأخرة' },
                ...(selectedCalendarDate ? [{ key: 'calendar', label: dayjs(selectedCalendarDate).format('D MMMM') }] : []),
              ]}
            />
            <div style={{ overflowY: 'auto', paddingInlineEnd: 4 }}>
              {sortedDays.length > 0 ? (
                sortedDays.map((day) => renderDayGroup(day, grouped[day]))
              ) : (
                <Text>لا توجد مواعيد تطابق هذا الفلتر.</Text>
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {renderMiniCalendar()}
            <Card title="فلترة" style={{ borderRadius: 12 }}>
              <Select
                value={activityFilter}
                onChange={setActivityFilter}
                style={{ width: '100%', marginBottom: 8 }}
                options={[
                  { value: 'all', label: 'كل الأنشطة' },
                  { value: 'viewing', label: 'معاينة' },
                  { value: 'follow_up', label: 'متابعة' },
                  { value: 'other', label: 'أخرى' },
                ]}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: '100%', marginBottom: 8 }}
                options={[
                  { value: 'all', label: 'كل الحالات' },
                  { value: 'pending', label: 'مجدول' },
                  { value: 'overdue', label: 'متأخر' },
                  { value: 'done', label: 'منجز' },
                ]}
              />
              <Select
                value={sourceFilter}
                onChange={setSourceFilter}
                style={{ width: '100%', marginBottom: 8 }}
                options={[
                  { value: 'all', label: 'كل المصادر' },
                  { value: 'request', label: 'طلبات' },
                  { value: 'offer', label: 'عروض' },
                ]}
              />
              <Select
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                style={{ width: '100%', marginBottom: 12 }}
                options={[
                  { value: 'all', label: 'كل التواريخ' },
                  { value: 'week', label: 'هذا الأسبوع' },
                  { value: 'month', label: 'هذا الشهر' },
                ]}
              />
              <Button block icon={<ReloadOutlined />} onClick={resetFilters}>
                إعادة تعيين الفلاتر
              </Button>
</Card>
          </Space>
        </Col>
      </Row>

      {/* Reminder Modal */}
      <Modal
        open={reminderModalOpen}
        title="تعديل/إعادة جدولة المتابعة"
        onCancel={() => {
          setReminderModalOpen(false);
          setEditingReminder(null);
        }}
        onOk={saveReminder}
        okText="حفظ"
        cancelText="إلغاء"
        style={{ direction: 'rtl' }}
      >
        <Form form={reminderForm} layout="vertical" dir="rtl">
          <Form.Item name="reminder_type" label="نوع المتابعة">
            <Select
              allowClear
              options={[
                { value: 'follow_up', label: 'متابعة - للتواصل مع العميل' },
                { value: 'viewing', label: 'معاينة - عقد جلسة معاينة' },
              ]}
            />
          </Form.Item>
          <Form.Item name="deadline_at" label="موعد المتابعة">
            <DatePicker
              showTime={{ format: 'h:mm A', use12Hours: true }}
              format="YYYY-MM-DD h:mm A"
              style={{ width: '100%' }}
              placeholder="اختر التاريخ والوقت"
            />
          </Form.Item>
          <Form.Item name="follow_up_details" label="تفاصيل المتابعة - ما الذي سأقوم به مع العميل">
            <Input.TextArea rows={2} placeholder="اكتب ما ستقوم به مع العميل..." style={{ textAlign: 'right', direction: 'rtl' }} />
          </Form.Item>
          <Form.Item name="reminder_before_minutes" label="التذكير قبل (بالدقائق)">
            <InputNumber
              style={{ width: '100%', textAlign: 'right', direction: 'rtl' }}
              min={15}
              max={10080}
              placeholder="افتراضي: 120 دقيقة (ساعتان)"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={notesModalOpen}
        title="ملاحظات الموعد"
        onCancel={() => {
          setNotesModalOpen(false);
          setSelectedAppointment(null);
          setNotes([]);
          setNewNoteContent('');
        }}
        footer={null}
        style={{ direction: 'rtl' }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <Input.TextArea
            rows={3}
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="اكتب ملاحظة سريعة..."
            style={{ textAlign: 'right', direction: 'rtl' }}
          />
          <Button type="primary" loading={notesSaving} onClick={addQuickNote}>
            إضافة ملاحظة
          </Button>
          <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {notesLoading ? (
              <Text>جاري تحميل الملاحظات...</Text>
            ) : notes.length === 0 ? (
              <Text type="secondary">لا توجد ملاحظات بعد.</Text>
            ) : (
              notes.map((note) => (
                <Card key={note.id} size="small" bodyStyle={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Text style={{ display: 'block', marginBottom: 4 }}>{note.content}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {note.author_name || 'غير محدد'} | {dayjs(note.created_at).format('YYYY/MM/DD HH:mm')}
                      </Text>
                    </div>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeNote(note.id)}
                    />
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </Modal>
    </Content>
  );
};

export default AppointmentsPage;


declare module 'dayjs' {
  interface Dayjs {
    fromNow(withoutSuffix?: boolean): string;
  }
}
