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
  // 예약 관련 상태
  const [username, setUsername] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<string>("ALL");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedSubDevice, setSelectedSubDevice] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>("");

  // 수리/점검 관련 상태
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintMonth, setMaintMonth] = useState<string>("");
  const [maintDay, setMaintDay] = useState<string>("");
  const [maintInstrument, setMaintInstrument] = useState<string>("ALL");
  const [maintDevice, setMaintDevice] = useState<string | null>(null);
  const [maintenanceDetails, setMaintenanceDetails] = useState<string>("");

  // 기기 목록
  const instruments = ["ALL", "HPLC", "GC", "GC-MS", "LC-MS", "IC", "ICP-MS", "ICP-OES"];
  const hplcDevices = ["Agilent 1", "Agilent 2", "Agilent 3", "Agilent Bio", "Shiseido 1", "Shiseido 2"];
  const gcDevices = ["Agilent 1", "Agilent 2"];
  const gcmsDevices: Record<string, string[]> = {
    "GC-MS": [],
    "GC-MSMS(Agilent)": ["MSD", "전자코"],
    "GC-MSMS(Thermo)": []
  };
  const lcmsDevices = ["Sciex 5500", "Sciex 4500"];
  const icDevices = ["Thermo"];
  const icpmsDevices = ["Agilent"];
  const icpoesDevices = ["Perkin"];

  const formatTime = (datetimeStr: string) => new Date(datetimeStr).toTimeString().slice(0, 5);
  const formatDate = (datetimeStr: string) => new Date(datetimeStr).toISOString().split("T")[0];
  const combineDateTime = (date: string, time: string) => `${date}T${time}:00`;

  const generateTimeOptions = () => {
    const times = [];
    for (let h = 8; h < 18; h++) {
      times.push(`${h.toString().padStart(2, "0")}:00`);
      times.push(`${h.toString().padStart(2, "0")}:30`);
    }
    times.push("18:00");
    return times;
  };
  const timeOptions = generateTimeOptions();

  // Firestore snapshot: reservations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "reservations"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReservations(data);
    });
    return () => unsub();
  }, []);

  // 날짜 자동 설정
  useEffect(() => {
    if (selectedMonth && selectedDay) {
      const year = new Date().getFullYear();
      const date = `${year}-${selectedMonth.padStart(2, "0")}-${selectedDay.padStart(2, "0")}`;
      setSelectedDate(date);
    }
  }, [selectedMonth, selectedDay]);

  // 예약 선택
  const handleSelect = (info: DateSelectArg) => {
    const dateObj = new Date(info.startStr);
    setSelectedDate(info.startStr.split("T")[0]);
    setSelectedMonth((dateObj.getMonth() + 1).toString());
    setSelectedDay(dateObj.getDate().toString());
    setStartTime(formatTime(info.startStr));
    setEndTime(formatTime(info.endStr));
    setEditId(null);
    setSelectInfo(info);
  };

  // 이벤트 클릭
  const handleEventClick = (clickInfo: EventClickArg) => {
    const matched = reservations.find((r) => r.id === clickInfo.event.id);
    if (!matched) return;
    if (matched.userUUID !== userUUID) {
      alert("본인의 예약만 수정할 수 있습니다.");
      return;
    }
    setEditId(matched.id);
    setSelectedInstrument(matched.instrument);
    const [main, sub] = matched.device.split(" - ");
    setSelectedDevice(main);
    setSelectedSubDevice(sub || null);
    setUsername(matched.user);
    setPurpose(matched.purpose);
    setSelectedDate(formatDate(matched.start));
    setStartTime(formatTime(matched.start));
    setEndTime(formatTime(matched.end));
  };

  // 예약 등록/수정
  const handleReservation = async () => {
    if (!username || !purpose || selectedInstrument === "ALL" || !selectedDevice || !startTime || !endTime || !selectedDate) {
      alert("모든 필드를 정확히 입력해 주세요.");
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
      alert("해당 기기의 예약 시간이 겹칩니다!");
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
      const confirmEdit = window.confirm("예약을 수정하시겠습니까?");
      if (!confirmEdit) return;
      await updateDoc(doc(db, "reservations", editId!), payload);
      alert("예약이 수정되었습니다!");
    } else {
      await setDoc(doc(db, "reservations", payload.id), payload);
      alert("예약이 완료되었습니다!");
    }

    // 초기화
    setUsername("");
    setPurpose("");
    setSelectedInstrument("ALL");
    setSelectedDevice(null);
    setSelectedSubDevice(null);
    setEditId(null);
    setStartTime("");
    setEndTime("");
    setSelectedDate("");
    setSelectInfo(null);
  };

  // 예약 삭제
  const handleCancel = async (id: string) => {
    const confirmDelete = window.confirm("예약을 삭제하시겠습니까?");
    if (!confirmDelete) return;
    await deleteDoc(doc(db, "reservations", id));
    alert("예약이 삭제되었습니다.");
  };

  // 수리/점검 저장
  const handleMaintenanceSave = async () => {
    if (maintInstrument === "ALL" || !maintDevice || !maintMonth || !maintDay || !maintenanceDetails) {
      alert("모든 필드를 입력해 주세요.");
      return;
    }
    const year = new Date().getFullYear();
    const date = `${year}-${maintMonth.padStart(2, "0")}-${maintDay.padStart(2, "0")}`;
    const payload = {
      id: uuidv4(),
      date,
      instrument: maintInstrument,
      device: maintDevice,
      details: maintenanceDetails,
    };
    await setDoc(doc(db, "maintenance", payload.id), payload);
    alert("수리/점검 내역이 저장되었습니다.");
    // 초기화
    setMaintMonth("");
    setMaintDay("");
    setMaintInstrument("ALL");
    setMaintDevice(null);
    setMaintenanceDetails("");
    setMaintenanceMode(false);
  };

  // 색상
  const getColorByInstrument = (instrument: string) => {
    switch (instrument) {
      case "HPLC": return { background: "#007bff", border: "#0056b3" };
      case "GC": return { background: "#28a745", border: "#1c7c31" };
      case "GC-MS": return { background: "#17a2b8", border: "#117a8b" };
      case "LC-MS": return { background: "#ffc107", border: "#d39e00" };
      case "IC": return { background: "#6610f2", border: "#520dc2" };
      case "ICP-MS": return { background: "#fd7e14", border: "#e8590c" };
      case "ICP-OES": return { background: "#6f42c1", border: "#5936a2" };
      default: return { background: "#6c757d", border: "#5a6268" };
    }
  };

  const getDevices = (instrument: string): string[] => {
    switch (instrument) {
      case "HPLC": return hplcDevices;
      case "GC": return gcDevices;
      case "LC-MS": return lcmsDevices;
      case "IC": return icDevices;
      case "ICP-MS": return icpmsDevices;
      case "ICP-OES": return icpoesDevices;
      default: return [];
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const filteredReservations = selectedInstrument === "ALL"
    ? reservations
    : reservations.filter((r) => r.instrument === selectedInstrument);
  const todayReservations = reservations.filter((r) => r.date === today);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: "bold" }}>장비 예약 달력</h1>
        <button
          onClick={() => setMaintenanceMode((prev) => !prev)}
          style={{ padding: "6px 12px", backgroundColor: maintenanceMode ? "#6c757d" : "#28a745", color: "white", borderRadius: 4 }}
        >
          {maintenanceMode ? "예약 모드로" : "수리/점검"}
        </button>
      </div>

      {/* 캘린더 */}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable={!maintenanceMode}
        select={handleSelect}
        eventClick={handleEventClick}
        allDaySlot={false}
        events={filteredReservations.map((r) => {
          const colors = getColorByInstrument(r.instrument);
          return {
            id: r.id,
            title: r.title,
            start: r.start,
            end: r.end,
            backgroundColor: colors.background,
            borderColor: colors.border,
            textColor: "white",
          };
        })}
        eventContent={(arg) => (
          <div style={{ fontSize: "10px", padding: "0 2px" }}>
            {arg.event.title}
          </div>
        )}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotEventOverlap={false}
      />

      {/* 수리/점검 폼 */}
      {maintenanceMode && (
        <div style={{ marginTop: 20 }}>
          <h3>수리/점검 내역 입력</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>월:</label>
            <select value={maintMonth} onChange={(e) => setMaintMonth(e.target.value)}>
              <option value="">월 선택</option>
              {[...Array(12)].map((_, i) => (
                <option key={i+1} value={(i+1).toString()}>{i+1}</option>
              ))}
            </select>
            <label style={{ margin: '0 8px' }}>일:</label>
            <select value={maintDay} onChange={(e) => setMaintDay(e.target.value)}>
              <option value="">일 선택</option>
              {[...Array(31)].map((_, i) => (
                <option key={i+1} value={(i+1).toString()}>{i+1}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>기기:</label>
            {instruments.filter(inst => inst!="ALL").map((inst) => (
              <button key={inst} onClick={() => { setMaintInstrument(inst); setMaintDevice(null); }} style={{ marginRight: 8, padding: "6px 12px", backgroundColor: maintInstrument===inst?"#343a40":"#eee", color: maintInstrument===inst?"white":"black", borderRadius:4 }}>
                {inst}
              </button>
            ))}
          </div>
          {maintInstrument === "GC-MS" && (
            <>
              <div style={{ marginBottom: 12 }}>
                {Object.keys(gcmsDevices).map((dev) => (
                  <button key={dev} onClick={() => { setMaintDevice(dev); }} style={{ marginRight: 8, padding: "6px 12px", backgroundColor: maintDevice===dev?"#aaa":"#eee", color: maintDevice===dev?"white":"black", borderRadius:4 }}>
                    {dev}
                  </button>
                ))}
              </div>
              {maintDevice && gcmsDevices[maintDevice]?.length>0 && (
                <div style={{ marginBottom:12 }}>
                  <select value={maintDevice} onChange={(e)=>setMaintDevice(e.target.value)}>
                    <option value="">서브 디바이스 선택</option>
                    {gcmsDevices[maintDevice].map((sub)=> (<option key={sub} value={sub}>{sub}</option>))}
                  </select>
                </div>
              )}
            </>
          )}
          {maintInstrument!="ALL" && maintInstrument!="GC-MS" && (
            <div style={{ marginBottom:12 }}>
              {getDevices(maintInstrument).map((dev)=>(
                <button key={dev} onClick={()=>setMaintDevice(dev)} style={{ marginRight:8, padding:"6px 12px", backgroundColor:maintDevice===dev?"#aaa":"#eee", color:maintDevice===dev?"white":"black", borderRadius:4 }}>
                  {dev}
                </button>
              ))}
            </div>
          )}
          <textarea
            placeholder="점검 내역을 입력하세요"
            value={maintenanceDetails}
            onChange={(e)=>setMaintenanceDetails(e.target.value)}
            style={{ width: '100%', padding: 8, height: 100, marginBottom: 12 }}
          />
          <button onClick={handleMaintenanceSave} style={{ padding: "6px 12px", backgroundColor: "#007bff", color: "white", borderRadius: "4px" }}>
            저장
          </button>
        </div>
      )}

      {/* 예약 폼 */}
      {!maintenanceMode && (selectedInstrument !== "ALL" || selectInfo !== null) && (
        <div style={{ marginTop: 20 }}>
          <h3>선택한 날짜와 시간: {selectedDate} {startTime} ~ {endTime}</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>월:</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              <option value="">월 선택</option>
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>{i + 1}</option>
              ))}
            </select>
            <label style={{ margin: "0 8px" }}>일:</label>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              <option value="">일 선택</option>
              {[...Array(31)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>{i + 1}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="이름"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: "6px", marginRight: "8px" }}
          />
          <input
            type="text"
            placeholder="사용 목적"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            style={{ padding: "6px", marginRight: "8px" }}
          />
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            <option value="">시작 시간 선택</option>
            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ marginLeft: "8px" }}>
            <option value="">종료 시간 선택</option>
            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={handleReservation}
            style={{ padding: "6px 12px", backgroundColor: "#007bff", color: "white", borderRadius: "4px", marginLeft: "8px" }}
          >
            {editId ? "수정하기" : "예약하기"}
          </button>
          {editId && (
            <button
              onClick={() => handleCancel(editId)}
              style={{ marginLeft: "8px", padding: "6px 12px", backgroundColor: "#dc3545", color: "white", borderRadius: "4px" }}
            >
              삭제하기
            </button>
          )}
        </div>
      )}

      {/* 오늘의 예약 */}
      {(todayReservations.length > 0) && (
        <div style={{ marginTop: 20 }}>
          <h3>오늘의 예약 😎</h3>
          <ul>
            {todayReservations.map((r) => (
              <li key={r.id}>
                {r.date} - {r.instrument} {r.device} - {formatTime(r.start)} ~ {formatTime(r.end)} - {r.user} ({r.purpose})
                {r.userUUID === userUUID && (
                  <button
                    type="button"
                    onClick={() => handleCancel(r.id)}
                    style={{ marginLeft: "10px", padding: "2px 6px" }}
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
