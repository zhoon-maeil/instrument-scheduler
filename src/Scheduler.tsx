import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { DateSelectArg } from "@fullcalendar/core";
import { v4 as uuidv4 } from "uuid";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
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
  const [username, setUsername] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState("ALL");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedSubDevice, setSelectedSubDevice] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [repairs, setRepairs] = useState<any[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [isRepairMode, setIsRepairMode] = useState(false);

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
  const combineDateTime = (date: string, time: string) => `${date}T${time}:00`;
  const today = new Date().toISOString().split("T")[0];

  const timeOptions = Array.from({ length: 21 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2);
    const min = i % 2 === 0 ? "00" : "30";
    return `${hour.toString().padStart(2, "0")}:${min}`;
  });

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, "reservations"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReservations(data);
    });
    const unsub2 = onSnapshot(collection(db, "repairs"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setRepairs(data);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  useEffect(() => {
    if (selectedMonth && selectedDay) {
      const year = new Date().getFullYear();
      setSelectedDate(`${year}-${selectedMonth.padStart(2, "0")}-${selectedDay.padStart(2, "0")}`);
    }
  }, [selectedMonth, selectedDay]);

  const handleSelect = (info: DateSelectArg) => {
    const date = new Date(info.startStr);
    setSelectedDate(info.startStr.split("T")[0]);
    setSelectedMonth((date.getMonth() + 1).toString());
    setSelectedDay(date.getDate().toString());
    setStartTime(formatTime(info.startStr));
    setEndTime(formatTime(info.endStr));
    setEditId(null);
    setSelectInfo(info);
  };

  const handleSave = async () => {
    if (!username || !purpose || selectedInstrument === "ALL" || !selectedDevice || !startTime || !endTime || !selectedDate) {
      alert("모든 필드를 정확히 입력해 주세요.");
      return;
    }
    const start = combineDateTime(selectedDate, startTime);
    const end = combineDateTime(selectedDate, endTime);
    const date = selectedDate;
    const fullDevice = selectedSubDevice ? `${selectedDevice} - ${selectedSubDevice}` : selectedDevice;
    const collectionName = isRepairMode ? "repairs" : "reservations";
    const dataList = isRepairMode ? repairs : reservations;

    const isDuplicate = dataList.some(
      (r) =>
        r.id !== editId &&
        r.date === date &&
        r.instrument === selectedInstrument &&
        r.device === fullDevice &&
        start < r.end && end > r.start
    );
    if (isDuplicate) {
      alert("해당 기기의 시간이 겹칩니다!");
      return;
    }

    const payload = {
      id: editId ?? uuidv4(),
      title: `${isRepairMode ? "수리" : selectedInstrument + " " + fullDevice} - ${username}`,
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
      const confirmEdit = window.confirm("수정하시겠습니까?");
      if (!confirmEdit) return;
      await updateDoc(doc(db, collectionName, editId), payload);
    } else {
      await setDoc(doc(db, collectionName, payload.id), payload);
    }

    alert(isRepairMode ? "수리/점검 완료!" : "예약 완료!");
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

  const allEvents = [
    ...reservations.map((r) => ({ ...r, source: "예약" })),
    ...repairs.map((r) => ({ ...r, source: "수리" })),
  ];

  const getColorByType = (source: string, instrument: string) => {
    if (source === "수리") return { background: "#ffc107", border: "#d39e00" };
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

  const todayReservations = reservations.filter((r) => r.date === today);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>장비 예약 / 수리 기록</h1>
        <button
          onClick={() => setIsRepairMode(!isRepairMode)}
          style={{ padding: "6px 12px", backgroundColor: isRepairMode ? "#ffc107" : "#6c757d", color: "white", borderRadius: 4 }}
        >
          {isRepairMode ? "예약 모드" : "수리/점검"}
        </button>
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable={true}
        select={handleSelect}
        allDaySlot={false}
        events={allEvents.map((e) => {
          const colors = getColorByType(e.source, e.instrument);
          return {
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            backgroundColor: colors.background,
            borderColor: colors.border,
            textColor: "white",
          };
        })}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotEventOverlap={false}
      />

      {selectInfo && (
        <div style={{ marginTop: 20 }}>
          <h3>{isRepairMode ? "수리/점검" : "예약"} 입력</h3>
          <input placeholder="이름" value={username} onChange={(e) => setUsername(e.target.value)} style={{ marginRight: 8 }} />
          <input placeholder="목적/내용" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ marginRight: 8 }} />
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            <option value="">시작 시간</option>
            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">종료 시간</option>
            {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={handleSave} style={{ marginLeft: 8, padding: "6px 12px", backgroundColor: "#007bff", color: "white" }}>
            저장
          </button>
        </div>
      )}

      {(todayReservations.length > 0) && (
        <div style={{ marginTop: 20 }}>
          <h3>오늘의 예약 😎</h3>
          <ul>
            {todayReservations.map((r) => (
              <li key={r.id}>
                {r.date} - {r.instrument} {r.device} - {formatTime(r.start)} ~ {formatTime(r.end)} - {r.user} ({r.purpose})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
