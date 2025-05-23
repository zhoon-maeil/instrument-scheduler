import { useEffect, useState } from "react";
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

const getOrCreateUserId = (): string => {
  const existing = localStorage.getItem("userUUID");
  if (existing) return existing;
  const newId = uuidv4();
  localStorage.setItem("userUUID", newId);
  return newId;
};
const userUUID = getOrCreateUserId();

export default function Scheduler() {
  // mode: reservation or maintenance
  const [mode, setMode] = useState<'reservation' | 'maintenance'>('reservation');

  // common states
  const [selectedInstrument, setSelectedInstrument] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedSubDevice, setSelectedSubDevice] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null);

  // reservation states
  const [username, setUsername] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);

  // maintenance states
  const [maintenanceDetails, setMaintenanceDetails] = useState('');
  const [maintenances, setMaintenances] = useState<any[]>([]);

  // instruments & devices
  const instruments = [
    'ALL', 'HPLC', 'GC', 'GC-MS', 'LC-MS', 'IC', 'ICP-MS', 'ICP-OES',
  ];
  const hplcDevices = ['Agilent 1', 'Agilent 2', 'Agilent 3', 'Agilent Bio', 'Shiseido 1', 'Shiseido 2'];
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

  const formatTime = (datetimeStr: string) => new Date(datetimeStr).toTimeString().slice(0, 5);
  const formatDate = (datetimeStr: string) => new Date(datetimeStr).toISOString().split('T')[0];
  const combineDateTime = (date: string, time: string) => `${date}T${time}:00`;

  // Firestore subscriptions
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReservations(data);
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'maintenances'), (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMaintenances(data);
    });
    return () => unsub();
  }, []);

  // sync month/day -> date
  useEffect(() => {
    if (selectedMonth && selectedDay) {
      const year = new Date().getFullYear();
      const date = `${year}-${selectedMonth.padStart(2, '0')}-${selectedDay.padStart(2, '0')}`;
      setSelectedDate(date);
    }
  }, [selectedMonth, selectedDay]);

  const handleSelect = (info: DateSelectArg) => {
    const date = new Date(info.startStr);
    setSelectedDate(info.startStr.split('T')[0]);
    setSelectedMonth((date.getMonth() + 1).toString());
    setSelectedDay(date.getDate().toString());
    setStartTime(formatTime(info.startStr));
    setEndTime(formatTime(info.endStr));
    setEditId(null);
    setSelectInfo(info);
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
      setEditId(matched.id);
      setUsername(matched.user);
      setPurpose(matched.purpose);
      setSelectedInstrument(matched.instrument);
      const [main, sub] = matched.device.split(' - ');
      setSelectedDevice(main);
      setSelectedSubDevice(sub || null);
      setSelectedDate(formatDate(matched.start));
      setStartTime(formatTime(matched.start));
      setEndTime(formatTime(matched.end));
    } else {
      // maintenance click - could implement detail view
      alert(matched.details);
    }
  };

  const handleReservation = async () => {
    if (
      !username || !purpose ||
      selectedInstrument === 'ALL' || !selectedDevice || !startTime || !endTime || !selectedDate
    ) {
      alert('모든 필드를 정확히 입력해 주세요.');
      return;
    }
    const start = combineDateTime(selectedDate, startTime);
    const end = combineDateTime(selectedDate, endTime);
    const date = selectedDate;
    const fullDevice = selectedSubDevice ? `${selectedDevice} - ${selectedSubDevice}` : selectedDevice;
    const isDuplicate = reservations.some(
      (r) =>
        r.id !== editId &&
        r.date === date &&
        r.instrument === selectedInstrument &&
        r.device === fullDevice &&
        start < r.end && end > r.start
    );
    if (isDuplicate) {
      alert('해당 기기의 예약 시간이 겹칩니다!');
      return;
    }
    const payload = {
      id: editId ?? uuidv4(),
      title: `${selectedInstrument} ${fullDevice} - ${username}`,
      date,
      start,
      end,
      instrument: selectedInstrument,
      device: fullDevice,
      user: username,
      purpose,
      userUUID,
    };
    if (editId) {
      const confirmEdit = window.confirm('예약을 수정하시겠습니까?');
      if (!confirmEdit) return;
      await updateDoc(doc(db, 'reservations', editId), payload);
      alert('예약이 수정되었습니다!');
    } else {
      await setDoc(doc(db, 'reservations', payload.id), payload);
      alert('예약이 완료되었습니다!');
    }
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
    const start = combineDateTime(selectedDate, '08:00');
    const end = combineDateTime(selectedDate, '09:00');
    const fullDevice = selectedSubDevice ? `${selectedDevice} - ${selectedSubDevice}` : selectedDevice;
    const payload = {
      id: uuidv4(),
      title: `${selectedInstrument} ${fullDevice} - 점검`,
      date: selectedDate,
      start,
      end,
      instrument: selectedInstrument,
      device: fullDevice,
      details: maintenanceDetails,
    };
    await setDoc(doc(db, 'maintenances', payload.id), payload);
    alert('수리/점검 내역이 저장되었습니다!');
    setMaintenanceDetails('');
    setSelectedInstrument('ALL');
    setSelectedDevice(null);
    setSelectedSubDevice(null);
    setSelectedDate('');
    setSelectedMonth('');
    setSelectedDay('');
    setSelectInfo(null);
  };

  const handleCancel = async (id: string) => {
    const confirmDelete = window.confirm('삭제하시겠습니까?');
    if (!confirmDelete) return;
    const col = mode === 'reservation' ? 'reservations' : 'maintenances';
    await deleteDoc(doc(db, col, id));
    alert(mode === 'reservation' ? '예약이 삭제되었습니다.' : '내역이 삭제되었습니다.');
  };

  const getColorByInstrument = (instrument: string) => {
    switch (instrument) {
      case 'HPLC': return { background: '#007bff', border: '#0056b3' };
      case 'GC': return { background: '#28a745', border: '#1c7c31' };
      case 'GC-MS': return { background: '#17a2b8', border: '#117a8b' };
      case 'LC-MS': return { background: '#ffc107', border: '#d39e00' };
      case 'IC': return { background: '#6610f2', border: '#520dc2' };
      case 'ICP-MS': return { background: '#fd7e14', border: '#e8590c' };
      case 'ICP-OES': return { background: '#6f42c1', border: '#5936a2' };
      default: return { background: '#6c757d', border: '#5a6268' };
    }
  };

  const getDevices = (instrument: string): string[] => {
    switch (instrument) {
      case 'HPLC': return hplcDevices;
      case 'GC': return gcDevices;
      case 'LC-MS': return lcmsDevices;
      case 'IC': return icDevices;
      case 'ICP-MS': return icpmsDevices;
      case 'ICP-OES': return icpoesDevices;
      default: return [];
    }
  };

  // filter
  const filteredReservations = selectedInstrument === 'ALL'
    ? reservations
    : reservations.filter(r => r.instrument === selectedInstrument);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>
          {mode === 'reservation' ? '장비 예약 달력' : '수리/점검 달력'}
        </h1>
        <div>
          <button onClick={() => setMode('reservation')}
            style={{ marginRight: 8, padding: '6px 12px', backgroundColor: mode === 'reservation' ? '#343a40' : '#eee', color: mode === 'reservation' ? 'white' : 'black', borderRadius: 4 }}>
            예약
          </button>
          <button onClick={() => setMode('maintenance')}
            style={{ padding: '6px 12px', backgroundColor: mode === 'maintenance' ? '#343a40' : '#eee', color: mode === 'maintenance' ? 'white' : 'black', borderRadius: 4 }}>
            수리/점검
          </button>
        </div>
      </div>

      {/* Instrument filter bar */}
      <div style={{ marginBottom: 12 }}>
        {instruments.map(inst => (
          <button key={inst} onClick={() => { setSelectedInstrument(inst); setSelectedDevice(null); setSelectedSubDevice(null); }}
            style={{ marginRight: 8, padding: '6px 12px', backgroundColor: selectedInstrument === inst ? '#343a40' : '#eee', color: selectedInstrument === inst ? 'white' : 'black', borderRadius: 4 }}>
            {inst === 'ALL' ? '전체' : inst}
          </button>
        ))}
      </div>
      {/* Sub-device selectors for GC-MS */}
      {selectedInstrument === 'GC-MS' && (
        <>
          <div style={{ marginBottom: 12 }}>
            {Object.keys(gcmsDevices).map(device => (
              <button key={device} onClick={() => { setSelectedDevice(device); setSelectedSubDevice(null); }}
                style={{ marginRight: 8, padding: '6px 12px', backgroundColor: selectedDevice === device ? '#aaa' : '#eee', color: selectedDevice === device ? 'white' : 'black', borderRadius: 4 }}>
                {device}
              </button>
            ))}
          </div>
          {selectedDevice && gcmsDevices[selectedDevice]?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <select value={selectedSubDevice || ''} onChange={e => setSelectedSubDevice(e.target.value)} style={{ padding: '6px' }}>
                <option value="">서브 디바이스 선택</option>
                {gcmsDevices[selectedDevice].map(sub => (<option key={sub} value={sub}>{sub}</option>))}
              </select>
            </div>
          )}
        </>
      )}
      {/* Device selectors */}
      {selectedInstrument !== 'ALL' && selectedInstrument !== 'GC-MS' && (
        <div style={{ marginBottom: 12 }}>
          {getDevices(selectedInstrument).map(id => (
            <button key={id} onClick={() => setSelectedDevice(id)}
              style={{ marginRight: 8, padding: '6px 12px', backgroundColor: selectedDevice === id ? '#aaa' : '#eee', color: selectedDevice === id ? 'white' : 'black', borderRadius: 4 }}>
              {id}
            </button>
          ))}
        </div>
      )}

      {/* Calendar */}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable={mode === 'reservation'}
        select={mode === 'reservation' ? handleSelect : undefined}
        eventClick={handleEventClick}
        allDaySlot={false}
        events={
          mode === 'reservation'
            ? filteredReservations.map(r => ({
                id: r.id,
                title: r.title,
                start: r.start,
                end: r.end,
                backgroundColor: getColorByInstrument(r.instrument).background,
                borderColor: getColorByInstrument(r.instrument).border,
                textColor: 'white',
              }))
            : maintenances.map(m => ({
                id: m.id,
                title: m.title,
                start: `${m.date}T08:00:00`, // fixed slot for maintenance
                end: `${m.date}T09:00:00`,
                backgroundColor: getColorByInstrument(m.instrument).background,
                borderColor: getColorByInstrument(m.instrument).border,
                textColor: 'white',
              }))
        }
        eventContent={arg => (<div style={{ fontSize: '10px', padding: '0 2px' }}>{arg.event.title}</div>)}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotEventOverlap={false}
      />

      {/* Form sections */}
      {mode === 'reservation' && (selectedInstrument !== 'ALL' || selectInfo) && (
        <div style={{ marginTop: 20 }}>
          <h3>선택한 날짜와 시간: {selectedDate} {startTime} ~ {endTime}</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>월:</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              <option value="">월 선택</option>
              {[...Array(12)].map((_, i) => (<option key={i+1} value={(i+1).toString()}>{i+1}</option>))}
            </select>
            <label style={{ margin: '0 8px' }}>일:</label>
            <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)}>
              <option value="">일 선택</option>
              {[...Array(31)].map((_, i) => (<option key={i+1} value={(i+1).toString()}>{i+1}</option>))}
            </select>
          </div>
          <input type="text" placeholder="이름" value={username} onChange={e => setUsername(e.target.value)} style={{ padding: '6px', marginRight: '8px' }} />
          <input type="text" placeholder="사용 목적" value={purpose} onChange={e => setPurpose(e.target.value)} style={{ padding: '6px', marginRight: '8px' }} />
          <select value={startTime} onChange={e => setStartTime(e.target.value)}>
            <option value="">시작 시간 선택</option>
            {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={endTime} onChange={e => setEndTime(e.target.value)} style={{ marginLeft: '8px' }}>
            <option value="">종료 시간 선택</option>
            {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={handleReservation} style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', marginLeft: '8px' }}>
            {editId ? '수정하기' : '예약하기'}
          </button>
          {editId && (
            <button onClick={() => handleCancel(editId)} style={{ marginLeft: '8px', padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', borderRadius: '4px' }}>
              삭제하기
            </button>
          )}
        </div>
      )}

      {mode === 'maintenance' && selectedInstrument !== 'ALL' && (
        <div style={{ marginTop: 20 }}>
          <h3>수리/점검 내역 작성</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>월:</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              <option value="">월 선택</option>
              {[...Array(12)].map((_, i) => (<option key={i+1} value={(i+1).toString()}>{i+1}</option>))}
            </select>
            <label style={{ margin: '0 8px' }}>일:</label>
            <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)}>
              <option value="">일 선택</option>
              {[...Array(31)].map((_, i) => (<option key={i+1} value={(i+1).toString()}>{i+1}</option>))}
            </select>
          </div>
          <textarea
            placeholder="점검 내역"
            value={maintenanceDetails}
            onChange={e => setMaintenanceDetails(e.target.value)}
            style={{ width: '100%', minHeight: '80px', padding: '6px' }}
          />
          <button onClick={handleMaintenanceSave} style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', marginTop: '8px' }}>
            저장하기
          </button>
        </div>
      )}
    </div>
  );
}