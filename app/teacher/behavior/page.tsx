"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const CLASS_ID = "flory-2026-2027";

const BEHAVIORS = [
  "Shouting Out",
  "Arguing",
  "Off Task",
  "Disrespect",
  "Unsafe",
  "Talking",
  "Refusal",
  "Other",
];

const CONSEQUENCES = [
  "Warning",
  "1 Lap at Recess",
  "2 Laps at Recess",
  "Ready for Next Time Sheet",
];

type Student = {
  id: string;
  displayName: string;
};

type BehaviorLog = {
  id: string;
  studentId: string;
  behavior: string;
  customBehavior: string;
  note: string;
  dateKey: string;
  weekKey: string;
  timeLabel: string;
  minutesOfDay: number;
  scheduleBlock: string;
};

type ConsequenceRecord = {
  id: string;
  studentId: string;
  dateKey: string;
  countAtAssignment: number;
  consequence: string;
  completed: boolean;
};

type ScheduleBlock = {
  day: number;
  start: number;
  end: number;
  label: string;
};

export default function BehaviorPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<BehaviorLog[]>([]);
  const [consequences, setConsequences] =
    useState<ConsequenceRecord[]>([]);

  const [studentMode, setStudentMode] =
    useState<"single" | "multiple">("single");

  const [singleStudentId, setSingleStudentId] =
    useState("");

  const [selectedStudentIds, setSelectedStudentIds] =
    useState<string[]>([]);

  const [behavior, setBehavior] =
    useState("Shouting Out");

  const [customBehavior, setCustomBehavior] =
    useState("");

  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [overrideStudentId, setOverrideStudentId] =
    useState<string | null>(null);

  const [overrideConsequence, setOverrideConsequence] =
    useState("Warning");

  const [editingLogId, setEditingLogId] =
    useState<string | null>(null);
  const [editBehavior, setEditBehavior] =
    useState("Shouting Out");
  const [editCustomBehavior, setEditCustomBehavior] =
    useState("");
  const [editNote, setEditNote] = useState("");
  const [deletingLogId, setDeletingLogId] =
    useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.push("/teacher/login");
          return;
        }

        try {
          const teacherSnapshot = await getDoc(
            doc(db, "teachers", user.uid)
          );

          if (
            !teacherSnapshot.exists() ||
            teacherSnapshot.data().active !== true ||
            teacherSnapshot.data().role !== "teacher"
          ) {
            await signOut(auth);
            router.push("/teacher/login");
            return;
          }

          await loadData();
        } catch (error) {
          console.error(error);
          setMessage(
            "HawkTrack couldn't load behavior tracking."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadData() {
    const studentSnapshot = await getDocs(
      query(
        collection(db, "students"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedStudents: Student[] =
      studentSnapshot.docs
        .filter(
          (studentDoc) =>
            studentDoc.data().active !== false
        )
        .map((studentDoc) => ({
          id: studentDoc.id,
          displayName:
            studentDoc.data().displayName || "Student",
        }))
        .sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );

    const logSnapshot = await getDocs(
      query(
        collection(db, "behaviorLogs"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedLogs: BehaviorLog[] =
      logSnapshot.docs.map((logDoc) => {
        const data = logDoc.data();

        return {
          id: logDoc.id,
          studentId: data.studentId || "",
          behavior: data.behavior || "",
          customBehavior: data.customBehavior || "",
          note: data.note || "",
          dateKey: data.dateKey || "",
          weekKey: data.weekKey || "",
          timeLabel: data.timeLabel || "",
          minutesOfDay:
            Number(data.minutesOfDay) || 0,
          scheduleBlock:
            data.scheduleBlock || "Unknown",
        };
      });

    const consequenceSnapshot = await getDocs(
      query(
        collection(db, "behaviorConsequences"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedConsequences: ConsequenceRecord[] =
      consequenceSnapshot.docs.map(
        (consequenceDoc) => {
          const data = consequenceDoc.data();

          return {
            id: consequenceDoc.id,
            studentId: data.studentId || "",
            dateKey: data.dateKey || "",
            countAtAssignment:
              Number(data.countAtAssignment) || 0,
            consequence: data.consequence || "",
            completed: data.completed === true,
          };
        }
      );

    setStudents(loadedStudents);
    setLogs(loadedLogs);
    setConsequences(loadedConsequences);
  }

  const todayKey = useMemo(
    () => formatDateForInput(new Date()),
    []
  );

  const currentWeekKey = useMemo(
    () =>
      formatDateForInput(
        getMonday(new Date())
      ),
    []
  );

  const todayLogs = useMemo(
    () =>
      logs.filter(
        (log) => log.dateKey === todayKey
      ),
    [logs, todayKey]
  );

  const weekLogs = useMemo(
    () =>
      logs.filter(
        (log) => log.weekKey === currentWeekKey
      ),
    [logs, currentWeekKey]
  );

  const todayByStudent = useMemo(() => {
    return students
      .map((student) => {
        const studentLogs = todayLogs.filter(
          (log) =>
            log.studentId === student.id
        );

        const studentConsequences =
          consequences.filter(
            (item) =>
              item.studentId === student.id &&
              item.dateKey === todayKey
          );

        return {
          student,
          count: studentLogs.length,
          logs: studentLogs,
          consequences: studentConsequences,
        };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.student.displayName.localeCompare(
          b.student.displayName
        );
      });
  }, [
    students,
    todayLogs,
    consequences,
    todayKey,
  ]);

  function toggleSelectedStudent(id: string) {
    setSelectedStudentIds((current) =>
      current.includes(id)
        ? current.filter(
            (studentId) =>
              studentId !== id
          )
        : [...current, id]
    );
  }

  function selectAllStudents() {
    setSelectedStudentIds(
      students.map(
        (student) => student.id
      )
    );
  }

  function clearStudents() {
    setSelectedStudentIds([]);
  }

  function getSelectedIds() {
    if (studentMode === "single") {
      return singleStudentId
        ? [singleStudentId]
        : [];
    }

    return selectedStudentIds;
  }

  async function logBehavior() {
    setMessage("");

    const targetStudentIds = getSelectedIds();

    if (targetStudentIds.length === 0) {
      setMessage(
        studentMode === "single"
          ? "Choose a student."
          : "Choose at least one student."
      );
      return;
    }

    if (behavior === "Other" && !customBehavior.trim()) {
      setMessage("Type the behavior.");
      return;
    }

    try {
      setSaving(true);

      const now = new Date();
      const dateKey = formatDateForInput(now);
      const weekKey = formatDateForInput(getMonday(now));
      const minutesOfDay = now.getHours() * 60 + now.getMinutes();
      const timeLabel = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      const scheduleBlock = getScheduleBlock(
        now.getDay(),
        minutesOfDay
      );

      const batch = writeBatch(db);
      const newLogs: BehaviorLog[] = [];
      const newConsequences: ConsequenceRecord[] = [];
      const resultMessages: string[] = [];

      for (const targetStudentId of targetStudentIds) {
        const previousCount = logs.filter(
          (log) =>
            log.studentId === targetStudentId &&
            log.dateKey === dateKey
        ).length;

        const newCount = previousCount + 1;
        const automaticConsequence =
          getSuggestedConsequence(newCount);

        // Create a separate behavior record for this student.
        const logRef = doc(collection(db, "behaviorLogs"));

        batch.set(logRef, {
          classId: CLASS_ID,
          studentId: targetStudentId,
          behavior,
          customBehavior:
            behavior === "Other"
              ? customBehavior.trim()
              : "",
          note: note.trim(),
          dateKey,
          weekKey,
          timeLabel,
          minutesOfDay,
          scheduleBlock,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || "",
        });

        newLogs.push({
          id: logRef.id,
          studentId: targetStudentId,
          behavior,
          customBehavior:
            behavior === "Other"
              ? customBehavior.trim()
              : "",
          note: note.trim(),
          dateKey,
          weekKey,
          timeLabel,
          minutesOfDay,
          scheduleBlock,
        });

        // Automatically create the consequence for this exact incident.
        const consequenceRef = doc(
          collection(db, "behaviorConsequences")
        );

        batch.set(consequenceRef, {
          classId: CLASS_ID,
          studentId: targetStudentId,
          dateKey,
          countAtAssignment: newCount,
          consequence: automaticConsequence,
          completed: false,
          automatic: true,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || "",
        });

        newConsequences.push({
          id: consequenceRef.id,
          studentId: targetStudentId,
          dateKey,
          countAtAssignment: newCount,
          consequence: automaticConsequence,
          completed: false,
        });

        resultMessages.push(
          `${getStudentName(
            targetStudentId
          )}: ${newCount} today → ${automaticConsequence}`
        );
      }

      // The behavior logs and consequences save together.
      await batch.commit();

      setLogs((current) => [
        ...current,
        ...newLogs,
      ]);

      setConsequences((current) => [
        ...current,
        ...newConsequences,
      ]);

      setNote("");
      setCustomBehavior("");

      if (studentMode === "single") {
        setMessage(
          `${resultMessages[0]} — consequence applied automatically.`
        );
      } else {
        setMessage(
          `${targetStudentIds.length} separate behavior records created and consequences applied automatically. ${resultMessages.join(
            " • "
          )}`
        );
      }
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't log that behavior and consequence."
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditingLog(log: BehaviorLog) {
    setEditingLogId(log.id);
    setEditBehavior(log.behavior || "Shouting Out");
    setEditCustomBehavior(log.customBehavior || "");
    setEditNote(log.note || "");
    setMessage("");
  }

  function cancelEditingLog() {
    setEditingLogId(null);
    setEditBehavior("Shouting Out");
    setEditCustomBehavior("");
    setEditNote("");
  }

  async function saveBehaviorEdit(log: BehaviorLog) {
    if (editBehavior === "Other" && !editCustomBehavior.trim()) {
      setMessage("Type the behavior before saving.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const updatedCustomBehavior =
        editBehavior === "Other" ? editCustomBehavior.trim() : "";

      await updateDoc(doc(db, "behaviorLogs", log.id), {
        behavior: editBehavior,
        customBehavior: updatedCustomBehavior,
        note: editNote.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "",
      });

      setLogs((current) =>
        current.map((item) =>
          item.id === log.id
            ? {
                ...item,
                behavior: editBehavior,
                customBehavior: updatedCustomBehavior,
                note: editNote.trim(),
              }
            : item
        )
      );

      cancelEditingLog();
      setMessage(
        `Behavior updated for ${getStudentName(log.studentId)}.`
      );
    } catch (error) {
      console.error(error);
      setMessage("HawkTrack couldn't update that behavior.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBehaviorLog(log: BehaviorLog) {
    const confirmed = window.confirm(
      `Delete this behavior for ${getStudentName(log.studentId)}? The day's consequence ladder will be recalculated automatically.`
    );

    if (!confirmed) return;

    try {
      setDeletingLogId(log.id);
      setMessage("");

      const studentDayLogs = logs.filter(
        (item) =>
          item.studentId === log.studentId &&
          item.dateKey === log.dateKey
      );

      const oldCount = studentDayLogs.length;
      const newCount = Math.max(0, oldCount - 1);

      const studentDayConsequences = consequences
        .filter(
          (item) =>
            item.studentId === log.studentId &&
            item.dateKey === log.dateKey
        )
        .sort((a, b) => a.countAtAssignment - b.countAtAssignment);

      const batch = writeBatch(db);
      batch.delete(doc(db, "behaviorLogs", log.id));

      // After removing one incident, the valid consequence chain is #1 through #newCount.
      // Remove any consequence records that now sit beyond that count. Existing overrides
      // and completion states for the remaining counts are preserved.
      const consequencesToDelete = studentDayConsequences.filter(
        (item) => item.countAtAssignment > newCount
      );

      consequencesToDelete.forEach((item) => {
        batch.delete(doc(db, "behaviorConsequences", item.id));
      });

      // Repair any missing consequence records in the remaining chain.
      const existingCounts = new Set(
        studentDayConsequences
          .filter((item) => item.countAtAssignment <= newCount)
          .map((item) => item.countAtAssignment)
      );

      const repairedConsequences: ConsequenceRecord[] = [];

      for (let count = 1; count <= newCount; count += 1) {
        if (existingCounts.has(count)) continue;

        const consequenceRef = doc(
          collection(db, "behaviorConsequences")
        );
        const automaticConsequence = getSuggestedConsequence(count);

        batch.set(consequenceRef, {
          classId: CLASS_ID,
          studentId: log.studentId,
          dateKey: log.dateKey,
          countAtAssignment: count,
          consequence: automaticConsequence,
          completed: false,
          automatic: true,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || "",
        });

        repairedConsequences.push({
          id: consequenceRef.id,
          studentId: log.studentId,
          dateKey: log.dateKey,
          countAtAssignment: count,
          consequence: automaticConsequence,
          completed: false,
        });
      }

      await batch.commit();

      const deletedConsequenceIds = new Set(
        consequencesToDelete.map((item) => item.id)
      );

      setLogs((current) =>
        current.filter((item) => item.id !== log.id)
      );

      setConsequences((current) => [
        ...current.filter(
          (item) => !deletedConsequenceIds.has(item.id)
        ),
        ...repairedConsequences,
      ]);

      if (editingLogId === log.id) cancelEditingLog();

      setMessage(
        `Behavior deleted for ${getStudentName(log.studentId)}. Their daily count is now ${newCount}, and consequences were recalculated.`
      );
    } catch (error) {
      console.error(error);
      setMessage("HawkTrack couldn't delete that behavior.");
    } finally {
      setDeletingLogId(null);
    }
  }

  async function saveConsequenceOverride(
    selectedStudentId: string,
    countAtAssignment: number,
    consequence: string,
    existingConsequence?: ConsequenceRecord
  ) {
    try {
      setMessage("");

      if (existingConsequence) {
        await updateDoc(
          doc(
            db,
            "behaviorConsequences",
            existingConsequence.id
          ),
          {
            consequence,
            automatic: false,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || "",
          }
        );

        setConsequences((current) =>
          current.map((item) =>
            item.id === existingConsequence.id
              ? {
                  ...item,
                  consequence,
                }
              : item
          )
        );
      } else {
        // This fallback covers an older behavior record created before
        // automatic consequences were turned on.
        const consequenceRef = await addDoc(
          collection(db, "behaviorConsequences"),
          {
            classId: CLASS_ID,
            studentId: selectedStudentId,
            dateKey: todayKey,
            countAtAssignment,
            consequence,
            completed: false,
            automatic: false,
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid || "",
          }
        );

        setConsequences((current) => [
          ...current,
          {
            id: consequenceRef.id,
            studentId: selectedStudentId,
            dateKey: todayKey,
            countAtAssignment,
            consequence,
            completed: false,
          },
        ]);
      }

      setOverrideStudentId(null);

      setMessage(
        `Consequence changed to ${consequence} for ${getStudentName(
          selectedStudentId
        )}.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't change that consequence."
      );
    }
  }

  async function toggleConsequenceComplete(
    consequence: ConsequenceRecord
  ) {
    try {
      const newValue =
        !consequence.completed;

      await updateDoc(
        doc(
          db,
          "behaviorConsequences",
          consequence.id
        ),
        {
          completed: newValue,
        }
      );

      setConsequences(
        (current) =>
          current.map((item) =>
            item.id ===
            consequence.id
              ? {
                  ...item,
                  completed:
                    newValue,
                }
              : item
          )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't update that consequence."
      );
    }
  }

  function getStudentName(
    id: string
  ) {
    return (
      students.find(
        (student) =>
          student.id === id
      )?.displayName ||
      "Student"
    );
  }

  const weeklyBehaviorSummary =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      weekLogs.forEach((log) => {
        const label =
          log.behavior === "Other"
            ? log.customBehavior ||
              "Other"
            : log.behavior;

        counts[label] =
          (counts[label] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([label, count]) => ({
          label,
          count,
        }))
        .sort(
          (a, b) =>
            b.count - a.count
        );
    }, [weekLogs]);

  const weeklyScheduleSummary =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      weekLogs.forEach((log) => {
        counts[
          log.scheduleBlock
        ] =
          (counts[
            log.scheduleBlock
          ] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([label, count]) => ({
          label,
          count,
        }))
        .sort(
          (a, b) =>
            b.count - a.count
        );
    }, [weekLogs]);

  const weeklyStudentSummary =
    useMemo(() => {
      return students
        .map((student) => ({
          id: student.id,
          name:
            student.displayName,
          count: weekLogs.filter(
            (log) =>
              log.studentId ===
              student.id
          ).length,
        }))
        .filter(
          (student) =>
            student.count > 0
        )
        .sort(
          (a, b) =>
            b.count - a.count
        );
    }, [students, weekLogs]);

  async function handleLogout() {
    await signOut(auth);

    router.push(
      "/teacher/login"
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading Behavior Tracker...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-blue-50 p-4 md:p-8">
      <div className="max-w-[1500px] mx-auto">

        {/* NAVIGATION */}
        <nav className="bg-blue-900 rounded-2xl p-2 mb-6">
          <div className="flex flex-wrap items-center gap-2">

            <button
              onClick={() =>
                router.push(
                  "/teacher/dashboard"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              🏠 Dashboard
            </button>

            <button
              onClick={() =>
                router.push(
                  "/teacher"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              📅 Weekly Planner
            </button>

            <button
              onClick={() =>
                router.push(
                  "/teacher/checker"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              ✅ Checker
            </button>

            <button
              onClick={() =>
                router.push(
                  "/teacher/behavior"
                )
              }
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              ⚡ Behavior
            </button>

            <button
              onClick={() =>
                router.push(
                  "/teacher/reports"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              📊 Reports
            </button>

            <div className="hidden md:block flex-1" />

            <p className="text-yellow-300 font-bold px-4">
              HawkTrack
            </p>

          </div>
        </nav>

        {/* HEADER */}
        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl font-bold text-blue-900">
                Behavior Tracker
              </h1>

              <p className="text-gray-600 mt-1">
                Quickly log behavior and track patterns throughout the day.
              </p>
            </div>

            <button
              onClick={
                handleLogout
              }
              className="bg-blue-900 text-white px-5 py-3 rounded-xl font-bold"
            >
              Log Out
            </button>

          </div>
        </header>

        {message && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-6 font-semibold text-blue-950">
            {message}
          </div>
        )}

        {/* QUICK LOG */}
        <section className="bg-white rounded-3xl border-2 border-blue-200 p-6 mb-6">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">

            <div>
              <h2 className="text-2xl font-bold text-blue-900">
                ⚡ Quick Behavior Log
              </h2>

              <p className="text-gray-600 mt-1">
                Each selected student gets their own separate record.
              </p>
            </div>

            <div className="bg-blue-50 rounded-xl px-4 py-2 text-sm font-semibold text-blue-900">
              Time + schedule block recorded automatically
            </div>

          </div>

          {/* SINGLE / MULTIPLE */}
          <div className="mb-5">

            <p className="font-bold text-blue-900 mb-3">
              Students
            </p>

            <div className="flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() => {
                  setStudentMode(
                    "single"
                  );
                  setSelectedStudentIds(
                    []
                  );
                }}
                className={`px-5 py-3 rounded-xl border-2 font-bold ${
                  studentMode ===
                  "single"
                    ? "bg-blue-900 text-white border-blue-900"
                    : "bg-white text-blue-900 border-blue-200"
                }`}
              >
                One Student
              </button>

              <button
                type="button"
                onClick={() => {
                  setStudentMode(
                    "multiple"
                  );
                  setSingleStudentId(
                    ""
                  );
                }}
                className={`px-5 py-3 rounded-xl border-2 font-bold ${
                  studentMode ===
                  "multiple"
                    ? "bg-blue-900 text-white border-blue-900"
                    : "bg-white text-blue-900 border-blue-200"
                }`}
              >
                Multiple Students
              </button>

            </div>
          </div>

          {studentMode ===
          "single" ? (
            <div className="mb-6">

              <select
                value={
                  singleStudentId
                }
                onChange={(e) =>
                  setSingleStudentId(
                    e.target.value
                  )
                }
                className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
              >
                <option value="">
                  Choose a student
                </option>

                {students.map(
                  (student) => (
                    <option
                      key={
                        student.id
                      }
                      value={
                        student.id
                      }
                    >
                      {
                        student.displayName
                      }
                    </option>
                  )
                )}

              </select>

            </div>
          ) : (
            <div className="mb-6">

              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">

                <p className="font-bold text-blue-900">
                  {selectedStudentIds.length} selected
                </p>

                <div className="flex gap-2">

                  <button
                    type="button"
                    onClick={
                      selectAllStudents
                    }
                    className="text-blue-700 font-bold underline"
                  >
                    Select All
                  </button>

                  <button
                    type="button"
                    onClick={
                      clearStudents
                    }
                    className="text-gray-600 font-bold underline"
                  >
                    Clear
                  </button>

                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">

                {students.map(
                  (student) => {
                    const selected =
                      selectedStudentIds.includes(
                        student.id
                      );

                    return (
                      <button
                        type="button"
                        key={
                          student.id
                        }
                        onClick={() =>
                          toggleSelectedStudent(
                            student.id
                          )
                        }
                        className={`min-h-14 rounded-xl border-2 p-3 font-bold text-left ${
                          selected
                            ? "bg-yellow-100 border-yellow-400 text-blue-950"
                            : "bg-white border-blue-200 text-blue-900"
                        }`}
                      >
                        <span className="mr-2">
                          {selected
                            ? "✓"
                            : "○"}
                        </span>

                        {
                          student.displayName
                        }
                      </button>
                    );
                  }
                )}

              </div>

            </div>
          )}

          {/* BEHAVIOR BUTTONS */}
          <div>

            <p className="font-bold text-blue-900 mb-3">
              Behavior
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

              {BEHAVIORS.map(
                (item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() =>
                      setBehavior(item)
                    }
                    className={`min-h-14 rounded-xl border-2 p-3 font-bold ${
                      behavior ===
                      item
                        ? "bg-yellow-400 border-yellow-400 text-blue-950"
                        : "bg-white border-blue-200 text-blue-900"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

            </div>
          </div>

          {behavior === "Other" && (
            <div className="mt-5">

              <label className="block font-bold text-blue-900 mb-2">
                Other Behavior
              </label>

              <input
                value={
                  customBehavior
                }
                onChange={(e) =>
                  setCustomBehavior(
                    e.target.value
                  )
                }
                className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                placeholder="Type what happened"
              />

            </div>
          )}

          <div className="mt-5">

            <label className="block font-bold text-blue-900 mb-2">
              Note{" "}
              <span className="font-normal text-gray-500">
                — optional
              </span>
            </label>

            <textarea
              value={note}
              onChange={(e) =>
                setNote(
                  e.target.value
                )
              }
              className="w-full border-2 border-blue-200 rounded-xl p-3 text-black min-h-20"
              placeholder="Add context, location, what happened, etc."
            />

          </div>

          <button
            onClick={
              logBehavior
            }
            disabled={saving}
            className="mt-5 bg-yellow-400 text-blue-950 px-7 py-4 rounded-xl font-bold text-lg disabled:opacity-50"
          >
            {saving
              ? "Logging..."
              : studentMode ===
                "multiple"
              ? `Log for ${
                  selectedStudentIds.length ||
                  ""
                } Student${
                  selectedStudentIds.length ===
                  1
                    ? ""
                    : "s"
                }`
              : "Log Behavior"}
          </button>

        </section>

        {/* TODAY */}
        <section className="bg-white rounded-3xl border border-yellow-200 p-6 mb-6">

          <h2 className="text-2xl font-bold text-blue-900">
            Today
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            Each student&apos;s count and consequence are calculated separately.
          </p>

          {todayByStudent.length ===
          0 ? (
            <div className="border-2 border-dashed border-green-200 rounded-2xl p-8 text-center">

              <p className="font-bold text-green-800">
                No unfavorable behaviors logged today.
              </p>

            </div>
          ) : (
            <div className="space-y-4">

              {todayByStudent.map(
                (item) => {
                  const suggested =
                    getSuggestedConsequence(
                      item.count
                    );

                  const currentConsequence =
                    item.consequences.find(
                      (consequence) =>
                        consequence.countAtAssignment ===
                        item.count
                    );

                  const displayedConsequence =
                    currentConsequence?.consequence ||
                    suggested;

                  return (
                    <div
                      key={
                        item.student.id
                      }
                      className="border-2 border-yellow-100 rounded-2xl p-5"
                    >

                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">

                        <div>

                          <button
                            onClick={() =>
                              router.push(
                                `/teacher/students/${item.student.id}`
                              )
                            }
                            className="text-xl font-bold text-blue-950 underline"
                          >
                            {
                              item.student.displayName
                            }
                          </button>

                          <div className="flex items-end gap-2 mt-2">

                            <p className="text-4xl font-bold text-red-600">
                              {
                                item.count
                              }
                            </p>

                            <p className="text-gray-600 pb-1">
                              behavior
                              {item.count ===
                              1
                                ? ""
                                : "s"}{" "}
                              today
                            </p>

                          </div>

                        </div>

                        <div className="w-full lg:max-w-sm">

                          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">

                            <p className="text-xs font-bold uppercase text-yellow-700">
                              Automatic Consequence
                            </p>

                            <p className="font-bold text-blue-950 text-lg mt-1">
                              {displayedConsequence}
                            </p>

                            <p className="text-sm text-gray-600 mt-1">
                              Applied automatically from today&apos;s behavior count.
                            </p>

                            <div className="flex flex-wrap gap-2 mt-3">

                              <button
                                onClick={() => {
                                  setOverrideStudentId(
                                    item.student.id
                                  );

                                  setOverrideConsequence(
                                    displayedConsequence
                                  );
                                }}
                                className="bg-white border-2 border-blue-200 text-blue-900 rounded-xl px-4 py-2 font-bold"
                              >
                                Change
                              </button>

                            </div>

                            {overrideStudentId ===
                              item.student.id && (
                              <div className="mt-4">

                                <select
                                  value={
                                    overrideConsequence
                                  }
                                  onChange={(e) =>
                                    setOverrideConsequence(
                                      e.target.value
                                    )
                                  }
                                  className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                                >
                                  {CONSEQUENCES.map(
                                    (
                                      option
                                    ) => (
                                      <option
                                        key={
                                          option
                                        }
                                        value={
                                          option
                                        }
                                      >
                                        {
                                          option
                                        }
                                      </option>
                                    )
                                  )}
                                </select>

                                <div className="flex flex-wrap gap-2 mt-2">
                                  <button
                                    onClick={() =>
                                      saveConsequenceOverride(
                                        item.student.id,
                                        item.count,
                                        overrideConsequence,
                                        currentConsequence
                                      )
                                    }
                                    className="bg-yellow-400 text-blue-950 rounded-xl px-4 py-2 font-bold"
                                  >
                                    Save Change
                                  </button>

                                  <button
                                    onClick={() =>
                                      setOverrideStudentId(null)
                                    }
                                    className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl px-4 py-2 font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>

                              </div>
                            )}

                          </div>

                        </div>
                      </div>

                      {/* INCIDENTS */}
                      <div className="mt-5">

                        <h3 className="font-bold text-blue-900 mb-2">
                          Incidents Today
                        </h3>

                        <div className="space-y-2">

                          {item.logs
                            .slice()
                            .sort(
                              (
                                a,
                                b
                              ) =>
                                b.minutesOfDay -
                                a.minutesOfDay
                            )
                            .map(
                              (log) => (
                                <div
                                  key={log.id}
                                  className="bg-blue-50 rounded-xl p-3"
                                >
                                  {editingLogId === log.id ? (
                                    <div className="space-y-3">
                                      <div>
                                        <label className="block text-sm font-bold text-blue-900 mb-2">
                                          Behavior
                                        </label>
                                        <select
                                          value={editBehavior}
                                          onChange={(e) =>
                                            setEditBehavior(e.target.value)
                                          }
                                          className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                                        >
                                          {BEHAVIORS.map((option) => (
                                            <option key={option} value={option}>
                                              {option}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      {editBehavior === "Other" && (
                                        <div>
                                          <label className="block text-sm font-bold text-blue-900 mb-2">
                                            Other Behavior
                                          </label>
                                          <input
                                            value={editCustomBehavior}
                                            onChange={(e) =>
                                              setEditCustomBehavior(e.target.value)
                                            }
                                            className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                                            placeholder="Type what happened"
                                          />
                                        </div>
                                      )}

                                      <div>
                                        <label className="block text-sm font-bold text-blue-900 mb-2">
                                          Note
                                        </label>
                                        <textarea
                                          value={editNote}
                                          onChange={(e) =>
                                            setEditNote(e.target.value)
                                          }
                                          className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black min-h-20"
                                          placeholder="Add context or leave blank"
                                        />
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => saveBehaviorEdit(log)}
                                          disabled={saving}
                                          className="bg-yellow-400 text-blue-950 rounded-xl px-4 py-2 font-bold disabled:opacity-50"
                                        >
                                          Save Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelEditingLog}
                                          disabled={saving}
                                          className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl px-4 py-2 font-bold disabled:opacity-50"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                        <div>
                                          <p className="font-bold text-blue-950">
                                            {log.behavior === "Other"
                                              ? log.customBehavior
                                              : log.behavior}
                                          </p>

                                          <p className="text-sm text-gray-600 mt-1">
                                            {log.timeLabel} • {log.scheduleBlock}
                                          </p>

                                          {log.note && (
                                            <p className="text-sm text-gray-700 mt-1">
                                              {log.note}
                                            </p>
                                          )}
                                        </div>

                                        <div className="flex gap-2 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => startEditingLog(log)}
                                            className="bg-white border-2 border-blue-200 text-blue-900 rounded-lg px-3 py-2 text-sm font-bold"
                                          >
                                            ✏️ Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => deleteBehaviorLog(log)}
                                            disabled={deletingLogId === log.id}
                                            className="bg-white border-2 border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50"
                                          >
                                            {deletingLogId === log.id
                                              ? "Deleting..."
                                              : "🗑️ Delete"}
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )
                            )}

                        </div>
                      </div>

                      {/* CONSEQUENCES */}
                      {item.consequences.length >
                        0 && (
                        <div className="mt-5">

                          <h3 className="font-bold text-blue-900 mb-2">
                            Consequences
                          </h3>

                          <div className="space-y-2">

                            {item.consequences.map(
                              (
                                consequence
                              ) => (
                                <label
                                  key={
                                    consequence.id
                                  }
                                  className="flex items-center gap-3 bg-amber-50 rounded-xl p-3 cursor-pointer"
                                >

                                  <input
                                    type="checkbox"
                                    checked={
                                      consequence.completed
                                    }
                                    onChange={() =>
                                      toggleConsequenceComplete(
                                        consequence
                                      )
                                    }
                                  />

                                  <div>

                                    <span
                                      className={
                                        consequence.completed
                                          ? "line-through text-gray-500"
                                          : "font-bold text-blue-950"
                                      }
                                    >
                                      {
                                        consequence.consequence
                                      }
                                    </span>

                                    <p className="text-xs text-gray-500">
                                      Assigned at behavior #
                                      {
                                        consequence.countAtAssignment
                                      }
                                    </p>

                                  </div>

                                </label>
                              )
                            )}

                          </div>
                        </div>
                      )}

                    </div>
                  );
                }
              )}

            </div>
          )}

        </section>

        {/* WEEKLY REPORT */}
        <section className="mb-6">

          <div className="mb-4">
            <h2 className="text-2xl font-bold text-blue-900">
              Weekly Report
            </h2>

            <p className="text-gray-600">
              Week of{" "}
              {formatDateLabel(
                currentWeekKey
              )}
            </p>
          </div>

          <div className="grid xl:grid-cols-3 gap-6">

            <div className="bg-white rounded-3xl border border-blue-200 p-6">

              <h3 className="text-xl font-bold text-blue-900">
                By Student
              </h3>

              <p className="text-sm text-gray-600 mt-1 mb-5">
                Total unfavorable behaviors this week.
              </p>

              {weeklyStudentSummary.length ===
              0 ? (
                <p className="text-gray-500">
                  No behavior data yet.
                </p>
              ) : (
                <div className="space-y-3">

                  {weeklyStudentSummary.map(
                    (item) => (
                      <button
                        key={
                          item.id
                        }
                        onClick={() =>
                          router.push(
                            `/teacher/students/${item.id}`
                          )
                        }
                        className="w-full flex justify-between items-center border-b border-blue-50 pb-2 text-left"
                      >

                        <span className="font-semibold text-blue-950 underline">
                          {
                            item.name
                          }
                        </span>

                        <span className="bg-blue-100 text-blue-900 rounded-full px-3 py-1 font-bold">
                          {
                            item.count
                          }
                        </span>

                      </button>
                    )
                  )}

                </div>
              )}

            </div>

            <div className="bg-white rounded-3xl border border-yellow-200 p-6">

              <h3 className="text-xl font-bold text-blue-900">
                By Behavior
              </h3>

              <p className="text-sm text-gray-600 mt-1 mb-5">
                Most common behaviors this week.
              </p>

              {weeklyBehaviorSummary.length ===
              0 ? (
                <p className="text-gray-500">
                  No behavior data yet.
                </p>
              ) : (
                <div className="space-y-3">

                  {weeklyBehaviorSummary.map(
                    (item) => (
                      <div
                        key={
                          item.label
                        }
                        className="flex justify-between items-center border-b border-yellow-50 pb-2"
                      >

                        <span className="font-semibold text-blue-950">
                          {
                            item.label
                          }
                        </span>

                        <span className="bg-yellow-100 text-yellow-900 rounded-full px-3 py-1 font-bold">
                          {
                            item.count
                          }
                        </span>

                      </div>
                    )
                  )}

                </div>
              )}

            </div>

            <div className="bg-white rounded-3xl border border-amber-200 p-6">

              <h3 className="text-xl font-bold text-blue-900">
                By Schedule Block
              </h3>

              <p className="text-sm text-gray-600 mt-1 mb-5">
                What the class was doing when incidents happened.
              </p>

              {weeklyScheduleSummary.length ===
              0 ? (
                <p className="text-gray-500">
                  No behavior data yet.
                </p>
              ) : (
                <div className="space-y-3">

                  {weeklyScheduleSummary.map(
                    (item) => (
                      <div
                        key={
                          item.label
                        }
                        className="flex justify-between items-center border-b border-amber-50 pb-2 gap-3"
                      >

                        <span className="font-semibold text-blue-950">
                          {
                            item.label
                          }
                        </span>

                        <span className="bg-amber-100 text-amber-900 rounded-full px-3 py-1 font-bold shrink-0">
                          {
                            item.count
                          }
                        </span>

                      </div>
                    )
                  )}

                </div>
              )}

            </div>

          </div>
        </section>

      </div>
    </main>
  );
}

function getSuggestedConsequence(
  count: number
) {
  if (count <= 1) {
    return "Warning";
  }

  if (count === 2) {
    return "1 Lap at Recess";
  }

  if (count === 3) {
    return "2 Laps at Recess";
  }

  return "Ready for Next Time Sheet";
}

function getScheduleBlock(
  day: number,
  minutes: number
) {
  const block = SCHEDULE.find(
    (item) =>
      item.day === day &&
      minutes >= item.start &&
      minutes < item.end
  );

  return (
    block?.label ||
    "Outside Scheduled Block"
  );
}

function timeToMinutes(
  hour: number,
  minute: number
) {
  return hour * 60 + minute;
}

function getMonday(
  date: Date
) {
  const copy =
    new Date(date);

  copy.setHours(
    12,
    0,
    0,
    0
  );

  const day =
    copy.getDay();

  copy.setDate(
    copy.getDate() +
      (day === 0
        ? -6
        : 1 - day)
  );

  return copy;
}

function formatDateForInput(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateLabel(
  dateString: string
) {
  if (!dateString) {
    return "—";
  }

  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    12
  ).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

const SCHEDULE: ScheduleBlock[] = [
  // MONDAY
  { day: 1, start: timeToMinutes(8, 30), end: timeToMinutes(8, 50), label: "Soft Start" },
  { day: 1, start: timeToMinutes(8, 50), end: timeToMinutes(9, 20), label: "Morning Meeting" },
  { day: 1, start: timeToMinutes(9, 20), end: timeToMinutes(9, 25), label: "Fill Out Planners" },
  { day: 1, start: timeToMinutes(9, 25), end: timeToMinutes(9, 30), label: "Transition" },
  { day: 1, start: timeToMinutes(9, 30), end: timeToMinutes(10, 15), label: "Discovery (PPT)" },
  { day: 1, start: timeToMinutes(10, 15), end: timeToMinutes(10, 20), label: "Transition" },
  { day: 1, start: timeToMinutes(10, 20), end: timeToMinutes(11, 25), label: "ELA Block 1 + Working Snack" },
  { day: 1, start: timeToMinutes(11, 25), end: timeToMinutes(11, 30), label: "Transition" },
  { day: 1, start: timeToMinutes(11, 30), end: timeToMinutes(11, 45), label: "Recess" },
  { day: 1, start: timeToMinutes(11, 45), end: timeToMinutes(11, 50), label: "Transition" },
  { day: 1, start: timeToMinutes(11, 50), end: timeToMinutes(12, 35), label: "Math Block" },
  { day: 1, start: timeToMinutes(12, 35), end: timeToMinutes(12, 40), label: "Transition" },
  { day: 1, start: timeToMinutes(12, 40), end: timeToMinutes(13, 10), label: "Lunch" },
  { day: 1, start: timeToMinutes(13, 10), end: timeToMinutes(13, 55), label: "Specials (IPT)" },
  { day: 1, start: timeToMinutes(13, 55), end: timeToMinutes(14, 10), label: "Recess" },
  { day: 1, start: timeToMinutes(14, 10), end: timeToMinutes(14, 15), label: "Transition" },
  { day: 1, start: timeToMinutes(14, 15), end: timeToMinutes(15, 0), label: "WIN Time" },
  { day: 1, start: timeToMinutes(15, 0), end: timeToMinutes(15, 5), label: "Transition" },
  { day: 1, start: timeToMinutes(15, 5), end: timeToMinutes(15, 35), label: "ELA Block 2" },
  { day: 1, start: timeToMinutes(15, 35), end: timeToMinutes(15, 40), label: "Clean Up" },
  { day: 1, start: timeToMinutes(15, 40), end: timeToMinutes(15, 50), label: "Closing Meeting" },
  { day: 1, start: timeToMinutes(15, 50), end: timeToMinutes(15, 55), label: "Transition" },
  { day: 1, start: timeToMinutes(15, 55), end: timeToMinutes(16, 15), label: "Dismissal" },

  // TUESDAY
  { day: 2, start: timeToMinutes(8, 30), end: timeToMinutes(8, 50), label: "Soft Start" },
  { day: 2, start: timeToMinutes(8, 50), end: timeToMinutes(9, 20), label: "Morning Meeting" },
  { day: 2, start: timeToMinutes(9, 20), end: timeToMinutes(9, 25), label: "Fill Out Planners" },
  { day: 2, start: timeToMinutes(9, 25), end: timeToMinutes(9, 30), label: "Transition" },
  { day: 2, start: timeToMinutes(9, 30), end: timeToMinutes(10, 15), label: "Discovery (PPT)" },
  { day: 2, start: timeToMinutes(10, 15), end: timeToMinutes(10, 20), label: "Transition" },
  { day: 2, start: timeToMinutes(10, 20), end: timeToMinutes(11, 25), label: "ELA Block 1 + Working Snack" },
  { day: 2, start: timeToMinutes(11, 25), end: timeToMinutes(11, 30), label: "Transition" },
  { day: 2, start: timeToMinutes(11, 30), end: timeToMinutes(11, 45), label: "Recess" },
  { day: 2, start: timeToMinutes(11, 45), end: timeToMinutes(11, 50), label: "Transition" },
  { day: 2, start: timeToMinutes(11, 50), end: timeToMinutes(12, 35), label: "Math Block" },
  { day: 2, start: timeToMinutes(12, 35), end: timeToMinutes(12, 40), label: "Transition" },
  { day: 2, start: timeToMinutes(12, 40), end: timeToMinutes(13, 10), label: "Lunch" },
  { day: 2, start: timeToMinutes(13, 10), end: timeToMinutes(13, 55), label: "Specials (IPT)" },
  { day: 2, start: timeToMinutes(13, 55), end: timeToMinutes(14, 10), label: "Recess" },
  { day: 2, start: timeToMinutes(14, 10), end: timeToMinutes(14, 15), label: "Transition" },
  { day: 2, start: timeToMinutes(14, 15), end: timeToMinutes(15, 0), label: "WIN Time" },
  { day: 2, start: timeToMinutes(15, 0), end: timeToMinutes(15, 5), label: "Transition" },
  { day: 2, start: timeToMinutes(15, 5), end: timeToMinutes(15, 35), label: "ELA Block 2" },
  { day: 2, start: timeToMinutes(15, 35), end: timeToMinutes(15, 40), label: "Clean Up" },
  { day: 2, start: timeToMinutes(15, 40), end: timeToMinutes(15, 50), label: "Closing Meeting" },
  { day: 2, start: timeToMinutes(15, 50), end: timeToMinutes(15, 55), label: "Transition" },
  { day: 2, start: timeToMinutes(15, 55), end: timeToMinutes(16, 15), label: "Dismissal" },

  // WEDNESDAY
  { day: 3, start: timeToMinutes(8, 30), end: timeToMinutes(8, 50), label: "Soft Start" },
  { day: 3, start: timeToMinutes(8, 50), end: timeToMinutes(9, 10), label: "Morning Meeting" },
  { day: 3, start: timeToMinutes(9, 10), end: timeToMinutes(9, 15), label: "Fill Out Planners" },
  { day: 3, start: timeToMinutes(9, 15), end: timeToMinutes(9, 20), label: "Transition" },
  { day: 3, start: timeToMinutes(9, 20), end: timeToMinutes(9, 55), label: "Specials (IPT)" },
  { day: 3, start: timeToMinutes(9, 55), end: timeToMinutes(10, 0), label: "Transition" },
  { day: 3, start: timeToMinutes(10, 0), end: timeToMinutes(10, 35), label: "Social Studies + Working Snack" },
  { day: 3, start: timeToMinutes(10, 35), end: timeToMinutes(11, 25), label: "ELA Block" },
  { day: 3, start: timeToMinutes(11, 25), end: timeToMinutes(11, 30), label: "Transition" },
  { day: 3, start: timeToMinutes(11, 30), end: timeToMinutes(11, 50), label: "Recess" },
  { day: 3, start: timeToMinutes(11, 50), end: timeToMinutes(11, 55), label: "Transition" },
  { day: 3, start: timeToMinutes(11, 55), end: timeToMinutes(12, 35), label: "Math Block" },
  { day: 3, start: timeToMinutes(12, 35), end: timeToMinutes(12, 40), label: "Transition" },
  { day: 3, start: timeToMinutes(12, 40), end: timeToMinutes(13, 10), label: "Lunch" },
  { day: 3, start: timeToMinutes(13, 10), end: timeToMinutes(13, 35), label: "Flex Time" },
  { day: 3, start: timeToMinutes(13, 35), end: timeToMinutes(13, 40), label: "Clean Up / Transition" },
  { day: 3, start: timeToMinutes(13, 40), end: timeToMinutes(14, 15), label: "School Families / Book Buddies / Flex Time" },
  { day: 3, start: timeToMinutes(14, 15), end: timeToMinutes(14, 20), label: "Transition" },
  { day: 3, start: timeToMinutes(14, 20), end: timeToMinutes(14, 35), label: "Dismissal" },

  // THURSDAY
  { day: 4, start: timeToMinutes(8, 30), end: timeToMinutes(8, 50), label: "Soft Start" },
  { day: 4, start: timeToMinutes(8, 50), end: timeToMinutes(9, 20), label: "Morning Meeting" },
  { day: 4, start: timeToMinutes(9, 20), end: timeToMinutes(9, 25), label: "Fill Out Planners" },
  { day: 4, start: timeToMinutes(9, 25), end: timeToMinutes(9, 30), label: "Transition" },
  { day: 4, start: timeToMinutes(9, 30), end: timeToMinutes(10, 15), label: "Discovery (PPT)" },
  { day: 4, start: timeToMinutes(10, 15), end: timeToMinutes(10, 20), label: "Transition" },
  { day: 4, start: timeToMinutes(10, 20), end: timeToMinutes(11, 25), label: "ELA Block 1 + Working Snack" },
  { day: 4, start: timeToMinutes(11, 25), end: timeToMinutes(11, 30), label: "Transition" },
  { day: 4, start: timeToMinutes(11, 30), end: timeToMinutes(11, 50), label: "Recess" },
  { day: 4, start: timeToMinutes(11, 50), end: timeToMinutes(11, 55), label: "Transition" },
  { day: 4, start: timeToMinutes(11, 55), end: timeToMinutes(12, 40), label: "Math Block" },
  { day: 4, start: timeToMinutes(12, 40), end: timeToMinutes(12, 45), label: "Transition" },
  { day: 4, start: timeToMinutes(12, 45), end: timeToMinutes(13, 15), label: "Lunch" },
  { day: 4, start: timeToMinutes(13, 15), end: timeToMinutes(14, 0), label: "Specials (IPT)" },
  { day: 4, start: timeToMinutes(14, 0), end: timeToMinutes(14, 15), label: "Recess" },
  { day: 4, start: timeToMinutes(14, 15), end: timeToMinutes(14, 20), label: "Transition" },
  { day: 4, start: timeToMinutes(14, 20), end: timeToMinutes(15, 5), label: "WIN Time" },
  { day: 4, start: timeToMinutes(15, 5), end: timeToMinutes(15, 10), label: "Transition" },
  { day: 4, start: timeToMinutes(15, 10), end: timeToMinutes(15, 40), label: "ELA Block 2" },
  { day: 4, start: timeToMinutes(15, 40), end: timeToMinutes(15, 45), label: "Clean Up" },
  { day: 4, start: timeToMinutes(15, 45), end: timeToMinutes(15, 55), label: "Closing Meeting" },
  { day: 4, start: timeToMinutes(15, 55), end: timeToMinutes(16, 0), label: "Transition" },
  { day: 4, start: timeToMinutes(16, 0), end: timeToMinutes(16, 15), label: "Dismissal" },

  // FRIDAY
  { day: 5, start: timeToMinutes(8, 30), end: timeToMinutes(8, 50), label: "Soft Start" },
  { day: 5, start: timeToMinutes(8, 50), end: timeToMinutes(9, 20), label: "Morning Meeting" },
  { day: 5, start: timeToMinutes(9, 20), end: timeToMinutes(9, 25), label: "Fill Out Planners" },
  { day: 5, start: timeToMinutes(9, 25), end: timeToMinutes(9, 30), label: "Transition" },
  { day: 5, start: timeToMinutes(9, 30), end: timeToMinutes(10, 15), label: "Discovery (PPT)" },
  { day: 5, start: timeToMinutes(10, 15), end: timeToMinutes(10, 20), label: "Transition" },
  { day: 5, start: timeToMinutes(10, 20), end: timeToMinutes(11, 25), label: "ELA Block 1 + Working Snack" },
  { day: 5, start: timeToMinutes(11, 25), end: timeToMinutes(11, 30), label: "Transition" },
  { day: 5, start: timeToMinutes(11, 30), end: timeToMinutes(11, 50), label: "Recess" },
  { day: 5, start: timeToMinutes(11, 50), end: timeToMinutes(11, 55), label: "Transition" },
  { day: 5, start: timeToMinutes(11, 55), end: timeToMinutes(12, 40), label: "Math Block" },
  { day: 5, start: timeToMinutes(12, 40), end: timeToMinutes(12, 45), label: "Transition" },
  { day: 5, start: timeToMinutes(12, 45), end: timeToMinutes(13, 15), label: "Lunch" },
  { day: 5, start: timeToMinutes(13, 15), end: timeToMinutes(14, 0), label: "Specials (IPT)" },
  { day: 5, start: timeToMinutes(14, 0), end: timeToMinutes(14, 15), label: "Recess" },
  { day: 5, start: timeToMinutes(14, 15), end: timeToMinutes(14, 20), label: "Transition" },
  { day: 5, start: timeToMinutes(14, 20), end: timeToMinutes(15, 5), label: "WIN Time" },
  { day: 5, start: timeToMinutes(15, 5), end: timeToMinutes(15, 15), label: "Student Work Time" },
  { day: 5, start: timeToMinutes(15, 15), end: timeToMinutes(15, 35), label: "Fun Friday + Shop" },
  { day: 5, start: timeToMinutes(15, 35), end: timeToMinutes(15, 40), label: "Clean Up" },
  { day: 5, start: timeToMinutes(15, 40), end: timeToMinutes(15, 50), label: "Closing Meeting" },
  { day: 5, start: timeToMinutes(15, 50), end: timeToMinutes(15, 55), label: "Transition" },
  { day: 5, start: timeToMinutes(15, 55), end: timeToMinutes(16, 15), label: "Dismissal" },
];