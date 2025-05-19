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
  doc,
  Timestamp,
} from "firebase/firestore";

export default function Scheduler() {
  const [username, setUsername] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState<string>("ALL");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [selectInfo, setSelectInfo] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);

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
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const found = reservations.find(
      (r) => r.start === clickInfo.event.startStr && r.end === clickInfo.event.endStr
    );
    if (found) {
      setUsername(found.user);
      setPurpose(found.purpose);
      setSelectedInstrument(found.instrument);
      setSelectedDevice(found.device);
      setSelectInfo({ startStr: found.start, endStr: found.end });
      setEditId(found.id);
    }
  };

  const isTimeOverlap = (startA: string, endA: string, startB: string, endB: string) => {
    return startA < endB && endA > startB;
  };

  const handleReservation = async () => {
    if (!selectInfo || !username || !purpose || selectedInstrument === "ALL" || selectedDevice === null) return;

    const start = selectInfo.startStr;
    const end = selectInfo.endStr;
    const date = start.split("T")[0];

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

      {selectedInstrument === "HPLC" && (
        <div style={{ marginBottom: 12 }}>
          {hplcDevices.map((num) => (
            <button
              key={num}
              onClick={() => setSelectedDevice(num)}
              style={{
                marginRight: 8,
                padding: "6px 12px",
                backgroundColor: selectedDevice === num ? "#007bff" : "#eee",
                color: selectedDevice === num ? "white" : "black",
                borderRadius: 4,
              }}
            >
              HPLC {num}
            </button>
          ))}
        </div>
      )}

      {selectedInstrument === "GC" && (
        <div style={{ marginBottom: 12 }}>
          {gcDevices.map((id) => (
            <button
              key={id}
              onClick={() => setSelectedDevice(id)}
              style={{
                marginRight: 8,
                padding: "6px 12px",
                backgroundColor: selectedDevice === id ? "#28a745" : "#eee",
                color: selectedDevice === id ? "white" : "black",
                borderRadius: 4,
              }}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      {selectedInstrument === "LCMS" && (
        <div style={{ marginBottom: 12 }}>
          {lcmsDevices.map((id) => (
            <button
              key={id}
              onClick={() => setSelectedDevice(id)}
              style={{
                marginRight: 8,
                padding: "6px 12px",
                backgroundColor: selectedDevice === id ? "#ffc107" : "#eee",
                color: selectedDevice === id ? "black" : "black",
                borderRadius: 4,
              }}
            >
              LC-MS {id}
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
        events={filteredReservations.map((r) => {
          const colors = getColorByInstrument(r.instrument);
          return {
            title: r.title,
            start: r.start,
            end: r.end,
            backgroundColor: colors.background,
            borderColor: colors.border,
            textColor: "white"
          };
        })}
        eventContent={(arg) => (
          <div style={{ fontSize: '10px', padding: '0 2px' }}>{arg.event.title}</div>
        )}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:30:00"
        slotEventOverlap={false}
      />

      {selectInfo && selectedInstrument !== "ALL" && (
        <div style={{ marginTop: 20 }}>
          <h3>선택한 시간: {formatDate(selectInfo.startStr)} {formatTime(selectInfo.startStr)} ~ {formatTime(selectInfo.endStr)}</h3>
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
          <button
            onClick={handleReservation}
            style={{ padding: "6px 12px", backgroundColor: "#007bff", color: "white", borderRadius: "4px" }}
          >
            {editId !== null ? "수정하기" : "예약하기"}
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
                <button
                  onClick={() => handleCancel(r.id)}
                  style={{ marginLeft: "10px", padding: "2px 6px" }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
