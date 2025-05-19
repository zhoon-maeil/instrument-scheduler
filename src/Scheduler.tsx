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

// ✅ UUID 저장 및 재사용
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
  const [selectedInstrument, setSelectedInstrument] = useState<string>("ALL");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const instruments = ["ALL", "HPLC", "GC", "LCMS"];
  const hplcDevices = ["1", "2", "3", "4", "5"];
  const gcDevices = ["GC1", "GC2"];
  const lcmsDevices = ["5500", "4500"];

  const formatTime = (datetimeStr: string) => {
    const date = new Date(datetimeStr);
    return date.toTimeString().slice(0, 5);
  };

  const formatDate = (datetimeStr: string) => {
    const date = new Date(datetimeStr);
    return date.toISOString().split("T")[0];
  };

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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "reservations"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReservations(data);
    });
    return () => unsub();
  }, []);

  const handleSelect = (info: DateSelectArg) => {
    setSelectedDate(info.startStr.split("T")[0]);
    setStartTime(formatTime(info.startStr));
    setEndTime(formatTime(info.endStr));
    setEditId(null); // 새 예약 시 기존 수정 ID 초기화
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event;
    const matched = reservations.find(
      (r) =>
        r.start === event.startStr &&
        r.end === event.endStr &&
        r.title === event.title
    );
    if (!matched) return;

    setEditId(matched.id);
    setSelectedInstrument(matched.instrument);
    setSelectedDevice(matched.device);
    setUsername(matched.user);
    setPurpose(matched.purpose);
    setSelectedDate(formatDate(matched.start));
    setStartTime(formatTime(matched.start));
    setEndTime(formatTime(matched.end));
  };

  const combineDateTime = (date: string, time: string) => {
    return `${date}T${time}:00`;
  };

  const handleReservation = async () => {
    if (
      !username ||
      !purpose ||
      selectedInstrument === "ALL" ||
      !selectedDevice ||
      !startTime ||
      !endTime ||
      !selectedDate
    )
      return;

    const start = combineDateTime(selectedDate, startTime);
    const end = combineDateTime(selectedDate, endTime);
    const date = selectedDate;

    const isDuplicate = reservations.some(
      (r) =>
        r.id !== editId &&
        r.date === date &&
        r.instrument === selectedInstrument &&
        r.device === selectedDevice &&
        isTimeOverlap(start, end, r.start, r.end)
    );
    if (isDuplicate) {
      alert("해당 기기의 예약 시간이 겹칩니다!");
      return;
    }

    const payload = {
      id: editId ?? uuidv4(),
      title: `${selectedInstrument} ${selectedDevice} - ${username}`,
      date,
      start,
      end,
      instrument: selectedInstrument,
      device: selectedDevice,
      user: username,
      purpose,
      userUUID,
    };

    if (editId) {
      await updateDoc(doc(db, "reservations", editId), payload);
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
    setEditId(null);
    setStartTime("");
    setEndTime("");
    setSelectedDate("");
  };

  const handleCancel = async (id: string) => {
    await deleteDoc(doc(db, "reservations", id));
    alert("예약이 삭제되었습니다.");
  };

  const isTimeOverlap = (startA: string, endA: string, startB: string, endB: string) =>
    startA < endB && endA > startB;

  const getColorByInstrument = (instrument: string) => {
    switch (instrument) {
      case "HPLC": return { background: "#007bff", border: "#0056b3" };
      case "GC": return { background: "#28a745", border: "#1c7c31" };
      case "LCMS": return { background: "#ffc107", border: "#d39e00" };
      default: return { background: "#6c757d", border: "#5a6268" };
    }
  };

  const filteredReservations =
    selectedInstrument === "ALL"
      ? reservations
      : reservations.filter((r) => r.instrument === selectedInstrument);

  const today = new Date().toISOString().split("T")[0];
  const todayReservations = filteredReservations.filter((r) => r.date === today);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>장비 예약 달력</h1>

      <div style={{ marginBottom: 12 }}>
        {instruments.map((inst) => (
          <button
            key={inst}
            onClick={() => {
              setSelectedInstrument(inst);
              setSelectedDevice(null);
            }}
            style={{
              marginRight: 8,
              padding: "6px 12px",
              backgroundColor: selectedInstrument === inst ? "#343a40" : "#eee",
              color: selectedInstrument === inst ? "white" : "black",
              borderRadius: 4,
            }}
          >
            {inst === "ALL" ? "전체" : inst}
          </button>
        ))}
      </div>

      {selectedInstrument !== "ALL" && (
        <div style={{ marginBottom: 12 }}>
          {(selectedInstrument === "HPLC" ? hplcDevices :
            selectedInstrument === "GC" ? gcDevices :
              selectedInstrument === "LCMS" ? lcmsDevices : []).map((id) => (
            <button
              key={id}
              onClick={() => setSelectedDevice(id)}
              style={{
                marginRight: 8,
                padding: "6px 12px",
                backgroundColor: selectedDevice === id ? "#aaa" : "#eee",
                color: selectedDevice === id ? "white" : "black",
                borderRadius: 4,
              }}
            >
              {selectedInstrument} {id}
            </button>
          ))}
        </div>
      )}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable={true}
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

      {selectedInstrument !== "ALL" && (
        <div style={{ marginTop: 20 }}>
          <h3>
            선택한 날짜와 시간: {selectedDate} {startTime} ~ {endTime}
          </h3>
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

      {todayReservations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>오늘의 예약 😎</h3>
          <ul>
            {todayReservations.map((r) => (
              <li key={r.id}>
                {r.date} - {r.instrument} {r.device} - {formatTime(r.start)} ~ {formatTime(r.end)} - {r.user} ({r.purpose})
                {r.userUUID === userUUID && (
                  <button
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
