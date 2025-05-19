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

  const instruments = ["ALL", "HPLC", "GC", "GC-MS", "LC-MS", "IC", "ICP-MS", "ICP-OES"];
  const hplcDevices = ["Agilent 1", "Agilent 2", "Agilent 3", "Shiseido 1", "Shiseido 2"];
  const gcDevices = ["Agilent 1", "Agilent 2"];
  const gcmsDevices: Record<string, string[]> = {
    "Agilent 1": [],
    "Agilent 2": ["MSD", "전자코"],
    "Thermo": []
  };
  const lcmsDevices = ["Sciex 1", "Sciex 2"];
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
    setEditId(null);
  };

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

  const handleReservation = async () => {
    if (!username || !purpose || selectedInstrument === "ALL" || !selectedDevice || !startTime || !endTime || !selectedDate)
      return;

    const start = combineDateTime(selectedDate, startTime);
    const end = combineDateTime(selectedDate, endTime);
    const date = selectedDate;

    const isDuplicate = reservations.some(
      (r) =>
        r.id !== editId &&
        r.date === date &&
        r.instrument === selectedInstrument &&
        r.device === (selectedSubDevice ? `${selectedDevice} - ${selectedSubDevice}` : selectedDevice) &&
        start < r.end && end > r.start
    );
    if (isDuplicate) {
      alert("해당 기기의 예약 시간이 겹칩니다!");
      return;
    }

    const payload = {
      id: editId ?? uuidv4(),
      title: `${selectedInstrument} ${selectedSubDevice ? `${selectedDevice} - ${selectedSubDevice}` : selectedDevice} - ${username}`,
      date,
      start,
      end,
      instrument: selectedInstrument,
      device: selectedSubDevice ? `${selectedDevice} - ${selectedSubDevice}` : selectedDevice,
      user: username,
      purpose,
      userUUID,
    };

    if (editId) {
      const confirmEdit = window.confirm("예약을 수정하시겠습니까?");
      if (!confirmEdit) return;
      await updateDoc(doc(db, "reservations", editId), payload);
      alert("예약이 수정되었습니다!");
    } else {
      await setDoc(doc(db, "reservations", payload.id), payload);
      alert("예약이 완료되었습니다!");
    }

    setUsername("");
    setPurpose("");
    setSelectedInstrument("ALL");
    setSelectedDevice(null);
    setSelectedSubDevice(null);
    setEditId(null);
    setStartTime("");
    setEndTime("");
    setSelectedDate("");
  };

  const handleCancel = async (id: string) => {
    const confirmDelete = window.confirm("예약을 삭제하시겠습니까?");
    if (!confirmDelete) return;
    await deleteDoc(doc(db, "reservations", id));
    alert("예약이 삭제되었습니다.");
  };

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
              setSelectedSubDevice(null);
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

      {selectedInstrument === "GC-MS" && (
        <>
          <div style={{ marginBottom: 12 }}>
            {Object.keys(gcmsDevices).map((device) => (
              <button
                key={device}
                onClick={() => {
                  setSelectedDevice(device);
                  setSelectedSubDevice(null);
                }}
                style={{
                  marginRight: 8,
                  padding: "6px 12px",
                  backgroundColor: selectedDevice === device ? "#aaa" : "#eee",
                  color: selectedDevice === device ? "white" : "black",
                  borderRadius: 4,
                }}
              >
                {device}
              </button>
            ))}
          </div>
          {selectedDevice && gcmsDevices[selectedDevice]?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <select
                value={selectedSubDevice || ""}
                onChange={(e) => setSelectedSubDevice(e.target.value)}
                style={{ padding: "6px" }}
              >
                <option value="">서브 디바이스 선택</option>
                {gcmsDevices[selectedDevice].map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {selectedInstrument !== "ALL" && selectedInstrument !== "GC-MS" && (
        <div style={{ marginBottom: 12 }}>
          {getDevices(selectedInstrument).map((id) => (
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
              {id}
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
        events={reservations.map((r) => {
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
          <div style={{ fontSize: "10px", padding: "0 2px" }}>{arg.event.title}</div>
        )}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotEventOverlap={false}
      />
    </div>
  );
}
