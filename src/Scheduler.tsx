import { useEffect, useState, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { v4 as uuidv4 } from "uuid";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc,
  setDoc,
} from "firebase/firestore";

/**************************************************************
 *  유저별 고유 UUID (브라우저당 1회 생성)
 *************************************************************/
const getOrCreateUserId = (): string => {
  const existing = localStorage.getItem("userUUID");
  if (existing) return existing;
  const newId = uuidv4();
  localStorage.setItem("userUUID", newId);
  return newId;
};
const userUUID = getOrCreateUserId();

export default function Scheduler() {
  /************************************************************
   *  🗓️  상태 선언
   ***********************************************************/
  const [mode, setMode] = useState<'reservation' | 'maintenance'>(
    'reservation'
  );
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'calendar' | 'history' | null>(
    null
  );

  // 공통 선택 상태
  const [selectedInstrument, setSelectedInstrument] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedSubDevice, setSelectedSubDevice] = useState<string | null>(
    null
  );
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null);

  // 예약
  const [username, setUsername] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);

  // 수리·점검
  const [maintenanceDetails, setMaintenanceDetails] = useState('');
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [editMaintenanceId, setEditMaintenanceId] = useState<string | null>(
    null
  );

  /************************************************************
   *  📚 장비 목록
   ***********************************************************/
  const instruments = [
    'ALL',
    'HPLC',
    'GC',
    'GC-MS',
    'LC-MS',
    'IC',
    'ICP-MS',
    'ICP-OES',
  ];
  const hplcDevices = [
    'Agilent 1',
    'Agilent 2',
    'Agilent 3',
    'Agilent Bio',
    'Shiseido 1',
    'Shiseido 2',
  ];
  const gcDevices = ['Agilent 1', 'Agilent 2'];
  const gcmsDevices: Record<string, string[]> = {
    'GC-MS': [],
    'GC-MSMS(Agilent)': ['MSD', '전자코'],
    'GC-MSMS(Thermo)': [],
  };
  const lcmsDevices = ['Sciex 5500', 'Sciex 4500'];
  const icDevices = ['Thermo'];
  const icpmsDevices = ['Agilent'];
  const icpoesDevices = ['Perkin'];

  /************************************************************
   *  🕒 유틸
   ***********************************************************/
  const generateTimeOptions = () => {
    const times: string[] = [];
    for (let h = 8; h < 18; h++) {
      times.push(`${h.toString().padStart(2, '0')}:00`);
      times.push(`${h.toString().padStart(2, '0')}:30`);
    }
    times.push('18:00');
    return times;
  };
  const timeOptions = generateTimeOptions();

  const formatTime = (dt: string) =>
    new Date(dt).toTimeString().slice(0, 5);
  const formatDate = (dt: string) => new Date(dt).toISOString().split('T')[0];
  const combineDateTime = (date: string, time: string) => `${date}T${time}:00`;

  /************************************************************
   *  🔄 Firestore 실시간 구독
   ***********************************************************/
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reservations'), (snap) => {
      setReservations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'maintenances'), (snap) => {
      setMaintenances(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  /************************************************************
   *  📆 월·일 선택 → 날짜 문자열 동기화
   ***********************************************************/
  useEffect(() => {
    if (selectedMonth && selectedDay) {
      const year = new Date().getFullYear();
      setSelectedDate(
        `${year}-${selectedMonth.padStart(2, '0')}-${selectedDay.padStart(2, '0')}`
      );
    }
  }, [selectedMonth, selectedDay]);

  /************************************************************
   *  🗓️ 월별 예약 요약 (예약모드 전용)
   ***********************************************************/
  const monthEvents = useMemo(() => {
    if (mode !== 'reservation') return [];
    const now = new Date();
    const ym = `${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
    const summary: Record<string, Record<string, number>> = {};
    reservations.forEach((r) => {
      if (!r.date.startsWith(ym)) return;
      const hours =
        (new Date(r.end).getTime() - new Date(r.start).getTime()) / 36e5;
      if (!summary[r.date]) summary[r.date] = {};
      summary[r.date][r.instrument] =
        (summary[r.date][r.instrument] || 0) + hours;
    });
    return Object.entries(summary).map(([date, instObj]) => ({
      id: date,
      title: Object.entries(instObj)
        .map(([inst, h]) => `${inst} ${h.toFixed(1)}h`)
        .join('\n'),
      start: `${date}T00:00:00`,
      end: `${date}T23:59:59`,
    }));
  }, [mode, reservations]);

  /************************************************************
   *  🛠️ 선택 장비·디바이스 점검 내역
   ***********************************************************/
  const maintenanceHistory = useMemo(() => {
    if (modalType !== 'history' || !selectedDevice) return [];
    const fullDevice = selectedSubDevice
      ? `${selectedDevice} - ${selectedSubDevice}`
      : selectedDevice;
    return maintenances
      .filter(
        (m) => m.instrument === selectedInstrument && m.device === fullDevice
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [modalType, maintenances, selectedInstrument, selectedDevice, selectedSubDevice]);

  /************************************************************
   *  🔘 헤더 아이콘 클릭
   ***********************************************************/
  const handleHeaderIconClick = () => {
    if (mode === 'reservation') {
      setModalType('calendar');
      setShowModal(true);
    } else {
      if (selectedInstrument === 'ALL' || !selectedDevice) {
        alert('장비와 디바이스를 먼저 선택해 주세요.');
        return;
      }
      setModalType('history');
      setShowModal(true);
    }
  };

  /************************************************************
   *  🔘 셀·이벤트 핸들러
   ***********************************************************/
  const handleSelect = (info: DateSelectArg) => {
    const d = new Date(info.startStr);
    setSelectedDate(info.startStr.split('T')[0]);
    setSelectedMonth((d.getMonth() + 1).toString());
    setSelectedDay(d.getDate().toString());
    setStartTime(formatTime(info.startStr));
    setEndTime(formatTime(info.endStr));
    setEditId(null);
    setSelectInfo(info);
  };

  const handleMaintenanceDateClick = (info: { dateStr: string }) => {
    const d = new Date(info.dateStr);
    setSelectedMonth((d.getMonth() + 1).toString());
    setSelectedDay(d.getDate().toString());
    setSelectedDate(info.dateStr.split('T')[0]);
    setSelectInfo(null);
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const matched =
      mode === 'reservation'
        ? reservations.find((r) => r.id === clickInfo.event.id)
        : maintenances.find((m) => m.id === clickInfo.event.id);
    if (!matched) return;

    if (mode === 'reservation' && matched.userUUID !== userUUID) {
      alert('본인의 예약만 수정할 수 있습니다.');
      return;
    }

    if (mode === 'reservation') {
      const r = matched as any;
      setEditId(r.id);
      setUsername(r.user);
      setPurpose(r.purpose);
      setSelectedInstrument(r.instrument);
      const [main, sub] = r.device.split(' - ');
      setSelectedDevice(main);
      setSelectedSubDevice(sub || null);
      setSelectedDate(formatDate(r.start));
      setStartTime(formatTime(r.start));
      setEndTime(formatTime(r.end));
    } else {
      const m = matched as any;
      setEditMaintenanceId(m.id);
      setSelectedInstrument(m.instrument);
      const [main, sub] = m.device.split(' - ');
      setSelectedDevice(main);
      setSelectedSubDevice(sub || null);
      const dateParts = m.date.split('-');
      setSelectedMonth(dateParts[1]);
      setSelectedDay(dateParts[2]);
      setMaintenanceDetails(m.details);
    }
  };

  /************************************************************
   *  ✅ 예약 저장·수정
   ***********************************************************/
  const handleReservation = async () => {
    if (
      !username ||
      !purpose ||
      selectedInstrument === 'ALL' ||
      !selectedDevice ||
      !startTime ||
      !endTime ||
      !selectedDate
    ) {
      alert('모든 필드를 정확히 입력해 주세요.');
      return;
    }

    const start = combineDateTime(selectedDate, startTime);
    const end = combineDateTime(selectedDate, endTime);
    const fullDevice = selectedSubDevice
      ? `${selectedDevice} - ${selectedSubDevice}`
      : selectedDevice;

    const overlap = reservations.some(
      (r) =>
        r.id !== editId &&
        r.date === selectedDate &&
        r.instrument === selectedInstrument &&
        r.device === fullDevice &&
        start < r.end &&
        end > r.start
    );
    if (overlap) {
      alert('해당 기기의 예약 시간이 겹칩니다!');
      return;
    }

    const payload = {
      id: editId ?? uuidv4(),
      title: `${selectedInstrument} ${fullDevice} - ${username}`,
      date: selectedDate,
      start,
      end,
      instrument: selectedInstrument,
      device: fullDevice,
      user: username,
      purpose,
      userUUID,
    };

    if (editId) {
      if (!window.confirm('예약을 수정하시겠습니까?')) return;
      await updateDoc(doc(db, 'reservations', editId), payload);
      alert('예약이 수정되었습니다!');
    } else {
      await setDoc(doc(db, 'reservations', payload.id), payload);
      alert('예약이 완료되었습니다!');
    }

    // 초기화
    setUsername('');
    setPurpose('');
    setSelectedInstrument('ALL');
    setSelectedDevice(null);
    setSelectedSubDevice(null);
    setEditId(null);
    setStartTime('');
    setEndTime('');
    setSelectedDate('');
    setSelectInfo(null);
  };

  /************************************************************
   *  ✅ 수리·점검 저장·수정
   ***********************************************************/
  const handleMaintenanceSave = async () => {
    if (
      selectedInstrument === 'ALL' ||
      !selectedDevice ||
      !selectedDate ||
      !maintenanceDetails
    ) {
      alert('모든 필드를 정확히 입력하세요.');
      return;
    }

    const fullDevice = selectedSubDevice
      ? `${selectedDevice} - ${selectedSubDevice}`
      : selectedDevice;
    const payload = {
      id: editMaintenanceId ?? uuidv4(),
      title: `${selectedInstrument} ${fullDevice} - 점검`,
      date: selectedDate,
      start: combineDateTime(selectedDate, '08:00'),
      end: combineDateTime(selectedDate, '09:00'),
      instrument: selectedInstrument,
      device: fullDevice,
      details: maintenanceDetails,
    };

    if (editMaintenanceId) {
      if (!window.confirm('수리/점검 내역을 수정하시겠습니까?')) return;
      await updateDoc(doc(db, 'maintenances', editMaintenanceId), payload);
      alert('내역이 수정되었습니다!');
    } else {
      await setDoc(doc(db, 'maintenances', payload.id), payload);
      alert('수리/점검 내역이 저장되었습니다!');
    }

    // 초기화
    setMaintenanceDetails('');
    setSelectedInstrument('ALL');
    setSelectedDevice(null);
    setSelectedSubDevice(null);
    setSelectedDate('');
    setSelectedMonth('');
    setSelectedDay('');
    setEditMaintenanceId(null);
    setSelectInfo(null);
  };

  /************************************************************
   *  ❌ 삭제
   ***********************************************************/
  const handleCancel = async (id: string) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    const col = mode === 'reservation' ? 'reservations' : 'maintenances';
    await deleteDoc(doc(db, col, id));
    alert(mode === 'reservation' ? '예약이 삭제되었습니다.' : '내역이 삭제되었습니다.');
    if (mode === 'maintenance') {
      setEditMaintenanceId(null);
      setMaintenanceDetails('');
    } else {
      setEditId(null);
    }
  };

  /************************************************************
   *  🎨 장비별 색상
   ***********************************************************/
  const getColorByInstrument = (inst: string) => {
    switch (inst) {
      case 'HPLC':
        return { background: '#007bff', border: '#0056b3' };
      case 'GC':
        return { background: '#28a745', border: '#1c7c31' };
      case 'GC-MS':
        return { background: '#17a2b8', border: '#117a8b' };
      case 'LC-MS':
        return { background: '#ffc107', border: '#d39e00' };
      case 'IC':
        return { background: '#6610f2', border: '#520dc2' };
      case 'ICP-MS':
        return { background: '#fd7e14', border: '#e8590c' };
      case 'ICP-OES':
        return { background: '#6f42c1', border: '#5936a2' };
      default:
        return { background: '#6c757d', border: '#5a6268' };
    }
  };

  const getDevices = (inst: string): string[] => {
    switch (inst) {
      case 'HPLC':
        return hplcDevices;
      case 'GC':
        return gcDevices;
      case 'GC-MS':
        return Object.keys(gcmsDevices);
      case 'LC-MS':
        return lcmsDevices;
      case 'IC':
        return icDevices;
      case 'ICP-MS':
        return icpmsDevices;
      case 'ICP-OES':
        return icpoesDevices;
      default:
        return [];
    }
  };

  /************************************************************
   *  오늘 예약 (ALL 탭)
   ***********************************************************/
  const filteredReservations =
    selectedInstrument === 'ALL'
      ? reservations
      : reservations.filter((r) => r.instrument === selectedInstrument);
  const today = new Date().toISOString().split('T')[0];
  const todayReservations = filteredReservations.filter((r) => r.date === today);

  /************************************************************
   *  ✨ 렌더링
   ***********************************************************/
  return (
    <div style={{ padding: 20 }}>
      {/* 헤더 */}
      <div
        style={
          {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          } as const
        }
      >
        <h1
          style={{ fontSize: 24, fontWeight: 'bold', display: 'flex', gap: 6 }}
        >
          {mode === 'reservation' ? '장비 예약 달력' : '수리/점검 달력'}
          <button
            aria-label={mode === 'reservation' ? '월 달력' : '점검 내역'}
            onClick={handleHeaderIconClick}
            style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {mode === 'reservation' ? '📅' : '🔧'}
          </button>
        </h1>
        <div>
          <button
            onClick={() => setMode('reservation')}
            style={{
              marginRight: 8,
              padding: '6px 12px',
              backgroundColor: mode === 'reservation' ? '#343a40' : '#eee',
              color: mode === 'reservation' ? 'white' : 'black',
              borderRadius: 4,
            }}
          >
            예약
          </button>
          <button
            onClick={() => setMode('maintenance')}
            style={{
              padding: '6px 12px',
              backgroundColor: mode === 'maintenance' ? '#343a40' : '#eee',
              color: mode === 'maintenance' ? 'white' : 'black',
              borderRadius: 4,
            }}
          >
            수리/점검
          </button>
        </div>
      </div>

      {/* 모달 */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '90%',
              maxWidth: 900,
              padding: 20,
              borderRadius: 8,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>
                {modalType === 'calendar' ? '월별 사용시간 요약' : '점검 내역'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
              >
                ✖️
              </button>
            </div>

            {modalType === 'calendar' && (
              <FullCalendar
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                headerToolbar={false}
                height="auto"
                events={monthEvents}
                eventContent={(arg) => (
                  <div style={{ fontSize: 10, whiteSpace: 'pre-line' }}>{arg.event.title}</div>
                )}
              />
            )}

            {modalType === 'history' && (
              <ul style={{ maxHeight: 400, overflowY: 'auto', paddingLeft: 18 }}>
                {maintenanceHistory.length > 0 ? (
                  maintenanceHistory.map((m) => (
                    <li key={m.id} style={{ marginBottom: 4 }}>
                      {m.date} – {m.details}
                    </li>
                  ))
                ) : (
                  <li>점검 내역이 없습니다.</li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 장비 필터 */}
      <div style={{ marginBottom: 12 }}>
        {instruments.map((inst) => (
          <button
            key={inst}
            onClick={() => {
              setSelectedInstrument(inst);
              setSelectedDevice(null);
              setSelectedSubDevice(null);
              setSelectedMonth('');
              setSelectedDay('');
            }}
            style={{
              marginRight: 8,
              padding: '6px 12px',
              backgroundColor: selectedInstrument === inst ? '#343a40' : '#eee',
              color: selectedInstrument === inst ? 'white' : 'black',
              borderRadius: 4,
            }}
          >
            {inst === 'ALL' ? '전체' : inst}
          </button>
        ))}
      </div>

      {/* GC-MS 서브 디바이스 */}
      {selectedInstrument === 'GC-MS' && (
        <>
          <div style={{ marginBottom: 12 }}>
            {Object.keys(gcmsDevices).map((dev) => (
              <button
                key={dev}
                onClick={() => {
                  setSelectedDevice(dev);
                  setSelectedSubDevice(null);
                }}
                style={{
                  marginRight: 8,
                  padding: '6px 12px',
                  backgroundColor: selectedDevice === dev ? '#FFEB99' : '#FFFFE0',
                  borderRadius: 4,
                }}
              >
                {dev}
              </button>
            ))}
          </div>
          {selectedDevice && gcmsDevices[selectedDevice]?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <select
                value={selectedSubDevice || ''}
                onChange={(e) => setSelectedSubDevice(e.target.value)}
                style={{ padding: '6px' }}
              >
                <option value="">서브 디바이스 선택</option>
                {gcmsDevices[selectedDevice].map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* 일반 디바이스 */}
      {selectedInstrument !== 'ALL' && selectedInstrument !== 'GC-MS' && (
        <div style={{ marginBottom: 12 }}>
          {getDevices(selectedInstrument).map((dev) => (
            <button
              key={dev}
              onClick={() => setSelectedDevice(dev)}
              style={{
                marginRight: 8,
                padding: '6px 12px',
                backgroundColor: selectedDevice === dev ? '#FFEB99' : '#FFFFE0',
                borderRadius: 4,
              }}
            >
              {dev}
            </button>
          ))}
        </div>
      )}

      {/* 주간 캘린더 */}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable={mode === 'reservation'}
        select={mode === 'reservation' ? handleSelect : undefined}
        dateClick={mode === 'maintenance' ? handleMaintenanceDateClick : undefined}
        eventClick={handleEventClick}
        allDaySlot={false}
        events={
          mode === 'reservation'
            ? filteredReservations.map((r) => ({
                id: r.id,
                title: r.title,
                start: r.start,
                end: r.end,
                backgroundColor: getColorByInstrument(r.instrument).background,
                borderColor: getColorByInstrument(r.instrument).border,
                textColor: 'white',
              }))
            : maintenances.map((m) => ({
                id: m.id,
                title: m.title,
                start: `${m.date}T08:00:00`,
                end: `${m.date}T09:00:00`,
                backgroundColor: getColorByInstrument(m.instrument).background,
                borderColor: getColorByInstrument(m.instrument).border,
                textColor: 'white',
              }))
        }
        eventContent={(arg) => (
          <div style={{ fontSize: 10, padding: '0 2px' }}>{arg.event.title}</div>
        )}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotEventOverlap={false}
      />

      {/* 오늘 예약 리스트 */}
      {mode === 'reservation' && selectedInstrument === 'ALL' && (
        <div style={{ marginTop: 20 }}>
          <h3>오늘의 예약😎</h3>
          {todayReservations.length > 0 ? (
            todayReservations.map((r) => (
              <div key={r.id} style={{ marginBottom: 4 }}>
                {formatTime(r.start)} - {formatTime(r.end)} {r.instrument} {r.device}{' '}
                ({r.user})
              </div>
            ))
          ) : (
            <div>오늘 예약이 없습니다.</div>
          )}
        </div>
      )}

      {/* 예약 폼 */}
      {mode === 'reservation' && (selectedInstrument !== 'ALL' || selectInfo) && (
        <div style={{ marginTop: 20 }}>
          <h3>
            선택한 날짜와 시간: {selectedDate} {startTime} ~ {endTime}
          </h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>월:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="">월 선택</option>
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>
                  {i + 1}
                </option>
              ))}
            </select>
            <label style={{ margin: '0 8px' }}>일:</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              <option value="">일 선택</option>
              {[...Array(31)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="이름"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: '6px', marginRight: 8 }}
          />
          <input
            type="text"
            placeholder="사용 목적"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            style={{ padding: '6px', marginRight: 8 }}
          />
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            <option value="">시작 시간 선택</option>
            {timeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">종료 시간 선택</option>
            {timeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={handleReservation}
            style={{
              padding: '6px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              borderRadius: 4,
              marginLeft: 8,
            }}
          >
            {editId ? '수정하기' : '예약하기'}
          </button>
          {editId && (
            <button
              onClick={() => handleCancel(editId)}
              style={{
                marginLeft: 8,
                padding: '6px 12px',
                backgroundColor: '#dc3545',
                color: 'white',
                borderRadius: 4,
              }}
            >
              삭제하기
            </button>
          )}
        </div>
      )}

      {/* 수리·점검 폼 */}
      {mode === 'maintenance' && selectedInstrument !== 'ALL' && (
        <div style={{ marginTop: 20 }}>
          <h3>수리/점검 내역 작성</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>월:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="">월 선택</option>
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>
                  {i + 1}
                </option>
              ))}
            </select>
            <label style={{ margin: '0 8px' }}>일:</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              <option value="">일 선택</option>
              {[...Array(31)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="점검 내역"
            value={maintenanceDetails}
            onChange={(e) => setMaintenanceDetails(e.target.value)}
            style={{ width: '100%', minHeight: 80, padding: 6 }}
          />
          <button
            onClick={handleMaintenanceSave}
            style={{
              padding: '6px 12px',
              backgroundColor: '#28a745',
              color: 'white',
              borderRadius: 4,
              marginTop: 8,
            }}
          >
            {editMaintenanceId ? '수정하기' : '저장하기'}
          </button>
          {editMaintenanceId && (
            <button
              onClick={() => handleCancel(editMaintenanceId)}
              style={{
                marginLeft: 8,
                padding: '6px 12px',
                backgroundColor: '#dc3545',
                color: 'white',
                borderRadius: 4,
              }}
            >
              삭제하기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
