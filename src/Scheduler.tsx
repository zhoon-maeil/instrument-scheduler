import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { EventClickArg } from "@fullcalendar/core";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

export default function Scheduler() {
  const [uuid, setUuid] = useState<string>("");
  const [username, setUsername] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<string>("ALL");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [selectInfo, setSelectInfo] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    const storedUuid = localStorage.getItem("user-uuid");
    if (storedUuid) {
      setUuid(storedUuid);
    } else {
      const newUuid = uuidv4();
      localStorage.setItem("user-uuid", newUuid);
      setUuid(newUuid);
    }
  }, []);

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

  const handleSelect = (info: any) => {
    setSelectInfo(info);
    setEditId(null);
    const startDate = info.startStr.split("T")[0];
    setSelectedDate(startDate);
    setStartTime(formatTime(info.startStr));
    setEndTime(formatTime(info.endStr));
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = reservations.find(
      (r) => r.start === clickInfo.event.startStr && r.end === clickInfo.event.endStr
    );
    if (event) {
      setUsername(event.user);
      setPurpose(event.purpose);
      setSelectedInstrument(event.instrument);
      setSelectedDevice(event.device);
      setSelectedDate(event.date);
      setStartTime(formatTime(event.start));
      setEndTime(formatTime(event.end));
      setEditId(event.id);
      setSelectInfo({ startStr: event.start, endStr: event.end });
    }
  };

  const combineDateTime = (date: string, time: string) => `${date}T${time}:00`;

  const isTimeOverlap = (startA: string, endA: string, startB: string, endB: string) => {
    return startA < endB && endA > startB;
  };

  const handleReservation = async () => {
    if (!username || !purpose || selectedInstrument === "ALL" || !selectedDevice || !startTime || !endTime || !selectedDate) return;

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
      title: `${selectedInstrument} ${selectedDevice} - ${username}`,
      date,
      start,
      end,
      instrument: selectedInstrument,
      device: selectedDevice,
      user: username,
      purpose,
      uuid
    };

    if (editId) {
      await updateDoc(doc(db, "reservations", editId), payload);
      alert("예약이 수정되었습니다!");
    } else {
      await addDoc(collection(db, "reservations"), payload);
      alert("예약이 완료되었습니다!");
    }

    setSelectInfo(null);
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

  const getColorByInstrument = (instrument: string) => {
    switch (instrument) {
      case "HPLC": return { background: "#007bff", border: "#0056b3" };
      case "GC": return { background: "#28a745", border: "#1c7c31" };
      case "LCMS": return { background: "#ffc107", border: "#d39e00" };
      default: return { background: "#6c757d", border: "#5a6268" };
    }
  };

  const filteredReservations = selectedInstrument === "ALL"
    ? reservations
    : reservations.filter((r) => r.instrument === selectedInstrument);

  const today = new Date().toISOString().split("T")[0];
  const todayReservations = filteredReservations.filter((r) => r.date === today);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>장비 예약 달력</h1>

      {/* 예약 목록 */}
      {todayReservations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>오늘의 예약 😎</h3>
          <ul>
            {todayReservations.map((r) => (
              <li key={r.id}>
                {r.date} - {r.instrument} {r.device} - {formatTime(r.start)} ~ {formatTime(r.end)} - {r.user} ({r.purpose})
                {r.uuid === uuid && (
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
