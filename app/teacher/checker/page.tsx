"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import TeacherNav from "@/app/teacher/components/TeacherNav";

const CLASS_ID = "flory-2026-2027";

type Student = {
  id: string;
  displayName: string;
};

type Assignment = {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  showDate: string;
  archived: boolean;
};

type StatusRecord = {
  statusId: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  status: "todo" | "turnedIn" | "verified" | "excused";
  feedback: string;
};

type AssignmentGroup = {
  assignment: Assignment;
  students: StatusRecord[];
};

export default function TeacherCheckerPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [feedbackById, setFeedbackById] =
    useState<Record<string, string>>({});

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  const [selectedStatusIds, setSelectedStatusIds] =
    useState<string[]>([]);

  const [subjectFilter, setSubjectFilter] =
    useState("All Subjects");

  const [showOnlyWaiting, setShowOnlyWaiting] =
    useState(false);

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

          await loadCheckerData();
        } catch (error) {
          console.error(error);
          setMessage(
            "HawkTrack couldn't load the checker page."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadCheckerData() {
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
            studentDoc.data().displayName ||
            "Student",
        }))
        .sort((a, b) =>
          a.displayName.localeCompare(
            b.displayName
          )
        );

    const studentMap: Record<string, string> = {};

    loadedStudents.forEach((student) => {
      studentMap[student.id] = student.displayName;
    });

    const assignmentSnapshot = await getDocs(
      query(
        collection(db, "assignments"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedAssignments: Assignment[] =
      assignmentSnapshot.docs
        .map((assignmentDoc) => {
          const data = assignmentDoc.data();

          return {
            id: assignmentDoc.id,
            title: data.title || "Assignment",
            subject: data.subject || "",
            dueDate: data.dueDate || "",
            showDate: data.showDate || "",
            archived: data.archived === true,
          };
        })
        .filter((assignment) => !assignment.archived)
        .sort((a, b) => {
          const dateCompare =
            b.showDate.localeCompare(a.showDate);

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return a.title.localeCompare(b.title);
        });

    const statusSnapshot = await getDocs(
      query(
        collection(
          db,
          "studentAssignmentStatus"
        ),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedStatuses: StatusRecord[] =
      statusSnapshot.docs
        .map((statusDoc) => {
          const data = statusDoc.data();

          return {
            statusId: statusDoc.id,
            studentId: data.studentId || "",
            studentName:
              studentMap[data.studentId] ||
              "Unknown Student",
            assignmentId:
              data.assignmentId || "",
            status:
              data.status || "todo",
            feedback:
              data.feedback || "",
          };
        })
        .sort((a, b) =>
          a.studentName.localeCompare(
            b.studentName
          )
        );

    const initialFeedback:
      Record<string, string> = {};

    loadedStatuses.forEach((status) => {
      initialFeedback[status.statusId] =
        status.feedback || "";
    });

    setStudents(loadedStudents);
    setAssignments(loadedAssignments);
    setStatuses(loadedStatuses);
    setFeedbackById(initialFeedback);
  }

  const subjects = useMemo(() => {
    return [
      "All Subjects",
      ...Array.from(
        new Set(
          assignments
            .map((assignment) => assignment.subject)
            .filter(Boolean)
        )
      ).sort(),
    ];
  }, [assignments]);

  const assignmentGroups = useMemo<AssignmentGroup[]>(() => {
    return assignments
      .filter(
        (assignment) =>
          subjectFilter === "All Subjects" ||
          assignment.subject === subjectFilter
      )
      .map((assignment) => {
        const assignmentStatuses = statuses
          .filter(
            (status) =>
              status.assignmentId === assignment.id
          )
          .filter(
            (status) =>
              !showOnlyWaiting ||
              status.status === "turnedIn"
          );

        return {
          assignment,
          students: assignmentStatuses,
        };
      })
      .filter(
        (group) =>
          !showOnlyWaiting ||
          group.students.length > 0
      );
  }, [
    assignments,
    statuses,
    subjectFilter,
    showOnlyWaiting,
  ]);

  const waitingStatuses = useMemo(
    () =>
      statuses.filter(
        (status) => status.status === "turnedIn"
      ),
    [statuses]
  );

  const selectedWaitingCount = selectedStatusIds.filter(
    (statusId) =>
      waitingStatuses.some(
        (status) => status.statusId === statusId
      )
  ).length;

  function toggleSelected(statusId: string) {
    setSelectedStatusIds((current) =>
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    );
  }

  function selectAllWaiting() {
    setSelectedStatusIds(
      waitingStatuses.map(
        (status) => status.statusId
      )
    );
  }

  function clearSelection() {
    setSelectedStatusIds([]);
  }

  async function verifyItem(
    item: StatusRecord
  ) {
    try {
      setWorkingId(item.statusId);
      setMessage("");

      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          item.statusId
        ),
        {
          status: "verified",
          feedback: "",
          verifiedAt: serverTimestamp(),
          verifiedBy:
            auth.currentUser?.uid || "",
        }
      );

      setStatuses((current) =>
        current.map((status) =>
          status.statusId === item.statusId
            ? {
                ...status,
                status: "verified",
                feedback: "",
              }
            : status
        )
      );

      setSelectedStatusIds((current) =>
        current.filter(
          (id) => id !== item.statusId
        )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't verify that assignment."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function verifySelected() {
    const selected = waitingStatuses.filter(
      (status) =>
        selectedStatusIds.includes(
          status.statusId
        )
    );

    if (selected.length === 0) {
      setMessage(
        "Select at least one turned-in assignment first."
      );
      return;
    }

    try {
      setWorkingId("bulk");
      setMessage("");

      const batch = writeBatch(db);

      selected.forEach((status) => {
        batch.update(
          doc(
            db,
            "studentAssignmentStatus",
            status.statusId
          ),
          {
            status: "verified",
            feedback: "",
            verifiedAt: serverTimestamp(),
            verifiedBy:
              auth.currentUser?.uid || "",
          }
        );
      });

      await batch.commit();

      const selectedIds = new Set(
        selected.map(
          (status) => status.statusId
        )
      );

      setStatuses((current) =>
        current.map((status) =>
          selectedIds.has(status.statusId)
            ? {
                ...status,
                status: "verified",
                feedback: "",
              }
            : status
        )
      );

      setSelectedStatusIds([]);
      setMessage(
        `${selected.length} assignment${
          selected.length === 1 ? "" : "s"
        } verified.`
      );
    } catch (error) {
      console.error(error);
      setMessage(
        "HawkTrack couldn't verify the selected assignments."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function sendBackItem(
    item: StatusRecord
  ) {
    const feedback =
      feedbackById[item.statusId]?.trim() || "";

    if (!feedback) {
      setMessage(
        `Add a reason before sending ${item.studentName}'s work back.`
      );
      return;
    }

    try {
      setWorkingId(item.statusId);
      setMessage("");

      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          item.statusId
        ),
        {
          status: "todo",
          feedback,
          verifiedAt: null,
          verifiedBy: "",
          returnedAt: serverTimestamp(),
          returnedBy:
            auth.currentUser?.uid || "",
        }
      );

      setStatuses((current) =>
        current.map((status) =>
          status.statusId === item.statusId
            ? {
                ...status,
                status: "todo",
                feedback,
              }
            : status
        )
      );

      setSelectedStatusIds((current) =>
        current.filter(
          (id) => id !== item.statusId
        )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't send that assignment back."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function overrideStatus(
    item: StatusRecord,
    newStatus: "todo" | "turnedIn" | "verified" | "excused"
  ) {
    try {
      setWorkingId(item.statusId);
      setMessage("");

      const updates: Record<string, unknown> = {
        status: newStatus,
        feedback: "",
        teacherOverride: true,
        teacherOverrideAt: serverTimestamp(),
        teacherOverrideBy: auth.currentUser?.uid || "",
      };

      if (newStatus === "verified") {
        updates.verifiedAt = serverTimestamp();
        updates.verifiedBy = auth.currentUser?.uid || "";
      } else {
        updates.verifiedAt = null;
        updates.verifiedBy = "";
      }

      await updateDoc(
        doc(db, "studentAssignmentStatus", item.statusId),
        updates
      );

      setStatuses((current) =>
        current.map((status) =>
          status.statusId === item.statusId
            ? { ...status, status: newStatus, feedback: "" }
            : status
        )
      );

      setFeedbackById((current) => ({
        ...current,
        [item.statusId]: "",
      }));

      setSelectedStatusIds((current) =>
        current.filter((id) => id !== item.statusId)
      );

      setMessage(
        `${item.studentName}'s assignment was changed to ${
          newStatus === "todo"
            ? "To Do"
            : newStatus === "turnedIn"
            ? "Waiting"
            : newStatus === "verified"
            ? "Verified"
            : "Excused"
        }.`
      );
    } catch (error) {
      console.error(error);
      setMessage("HawkTrack couldn't change that assignment status.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/teacher/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading Checker...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-blue-50 p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        <TeacherNav />

        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl font-bold text-blue-900">
                Teacher Checker
              </h1>

              <p className="text-gray-600 mt-1">
                See every assignment and every assigned student. Turned-in work can be checked individually or in a batch.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-yellow-100 text-yellow-900 rounded-2xl px-5 py-3 font-bold">
                {waitingStatuses.length} waiting
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push("/teacher/gradebook")
                }
                className="bg-white border-2 border-blue-300 text-blue-900 px-5 py-3 rounded-xl font-bold"
              >
                📚 Gradebook
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="bg-blue-900 text-white px-5 py-3 rounded-xl font-bold"
              >
                Log Out
              </button>
            </div>
          </div>
        </header>

        {message && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-6 text-blue-950 font-semibold">
            {message}
          </div>
        )}

        <section className="bg-white border border-blue-200 rounded-3xl p-5 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-sm font-bold text-blue-900 mb-2">
                  Subject
                </label>

                <select
                  value={subjectFilter}
                  onChange={(e) =>
                    setSubjectFilter(e.target.value)
                  }
                  className="border-2 border-blue-200 rounded-xl px-4 py-3 bg-white text-black"
                >
                  {subjects.map((subject) => (
                    <option
                      key={subject}
                      value={subject}
                    >
                      {subject}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 mt-auto bg-blue-50 rounded-xl px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyWaiting}
                  onChange={(e) =>
                    setShowOnlyWaiting(
                      e.target.checked
                    )
                  }
                />
                <span className="font-bold text-blue-900">
                  Show only waiting work
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllWaiting}
                className="border-2 border-blue-200 bg-white text-blue-900 rounded-xl px-4 py-3 font-bold"
              >
                Select All Waiting
              </button>

              <button
                type="button"
                onClick={clearSelection}
                className="border-2 border-gray-200 bg-white text-gray-700 rounded-xl px-4 py-3 font-bold"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={verifySelected}
                disabled={
                  selectedWaitingCount === 0 ||
                  workingId === "bulk"
                }
                className="bg-green-600 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-50"
              >
                {workingId === "bulk"
                  ? "Verifying..."
                  : `✓ Verify Selected (${selectedWaitingCount})`}
              </button>
            </div>
          </div>
        </section>

        {assignmentGroups.length === 0 ? (
          <section className="bg-white border-2 border-dashed border-blue-200 rounded-3xl p-10 text-center">
            <h2 className="text-2xl font-bold text-blue-900">
              No assignments found
            </h2>
          </section>
        ) : (
          <div className="space-y-6">
            {assignmentGroups.map((group) => {
              const waitingCount =
                group.students.filter(
                  (student) =>
                    student.status === "turnedIn"
                ).length;

              const verifiedCount =
                group.students.filter(
                  (student) =>
                    student.status === "verified" ||
                    student.status === "excused"
                ).length;

              return (
                <section
                  key={group.assignment.id}
                  className="bg-white border-2 border-blue-200 rounded-3xl p-5 md:p-6"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
                    <div>
                      <p className="text-xs font-bold uppercase text-blue-700">
                        {group.assignment.subject}
                      </p>

                      <h2 className="text-2xl font-bold text-blue-950">
                        {group.assignment.title}
                      </h2>

                      <p className="text-sm text-gray-500 mt-1">
                        Due{" "}
                        {formatDateLabel(
                          group.assignment.dueDate
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="bg-green-100 text-green-800 rounded-full px-3 py-2 text-sm font-bold">
                        {verifiedCount} finished
                      </span>

                      <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-2 text-sm font-bold">
                        {waitingCount} waiting
                      </span>

                      <span className="bg-blue-50 text-blue-800 rounded-full px-3 py-2 text-sm font-bold">
                        {group.students.length} assigned
                      </span>
                    </div>
                  </div>

                  {group.students.length === 0 ? (
                    <div className="border-2 border-dashed border-blue-100 rounded-2xl p-5 text-gray-500">
                      No matching students for this filter.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {group.students.map((item) => {
                        const isWaiting =
                          item.status === "turnedIn";

                        const isWorking =
                          workingId === item.statusId;

                        return (
                          <div
                            key={item.statusId}
                            className={`border-2 rounded-2xl p-4 ${
                              item.status === "verified"
                                ? "border-green-200 bg-green-50"
                                : item.status === "excused"
                                ? "border-gray-200 bg-gray-50"
                                : item.status === "turnedIn"
                                ? "border-yellow-300 bg-yellow-50"
                                : "border-blue-100 bg-white"
                            }`}
                          >
                            <div className="grid xl:grid-cols-[36px_220px_130px_1fr_170px] gap-4 items-start">
                              <div className="pt-1">
                                {isWaiting ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedStatusIds.includes(
                                      item.statusId
                                    )}
                                    onChange={() =>
                                      toggleSelected(
                                        item.statusId
                                      )
                                    }
                                    className="h-5 w-5"
                                  />
                                ) : (
                                  <span className="block h-5 w-5" />
                                )}
                              </div>

                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/teacher/students/${item.studentId}`
                                    )
                                  }
                                  className="font-bold text-blue-950 text-lg underline hover:text-blue-700"
                                >
                                  {item.studentName}
                                </button>
                              </div>

                              <div>
                                <StatusBadge
                                  status={item.status}
                                  dueDate={
                                    group.assignment.dueDate
                                  }
                                />
                              </div>

                              <div>
                                {isWaiting ? (
                                  <>
                                    <label className="block text-sm font-bold text-blue-900 mb-2">
                                      Feedback if sending back
                                    </label>

                                    <textarea
                                      value={
                                        feedbackById[
                                          item.statusId
                                        ] || ""
                                      }
                                      onChange={(e) =>
                                        setFeedbackById(
                                          (current) => ({
                                            ...current,
                                            [item.statusId]:
                                              e.target.value,
                                          })
                                        )
                                      }
                                      placeholder="Example: Finish questions 4–6 and turn it back in."
                                      className="w-full border-2 border-blue-200 rounded-xl p-3 text-black min-h-20 bg-white"
                                    />
                                  </>
                                ) : item.feedback ? (
                                  <p className="text-sm text-red-700">
                                    Note: {item.feedback}
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-400">
                                    —
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold uppercase text-blue-700">
                                  Teacher Override
                                </label>

                                <select
                                  value={item.status}
                                  disabled={isWorking}
                                  onChange={(e) =>
                                    overrideStatus(
                                      item,
                                      e.target.value as
                                        | "todo"
                                        | "turnedIn"
                                        | "verified"
                                        | "excused"
                                    )
                                  }
                                  className="border-2 border-blue-300 bg-white text-blue-950 rounded-xl px-3 py-3 font-bold disabled:opacity-50"
                                >
                                  <option value="todo">To Do</option>
                                  <option value="turnedIn">Waiting</option>
                                  <option value="verified">✓ Verified</option>
                                  <option value="excused">Excused</option>
                                </select>

                                {isWaiting && (
                                  <button
                                    type="button"
                                    onClick={() => sendBackItem(item)}
                                    disabled={isWorking}
                                    className="bg-yellow-400 text-blue-950 rounded-xl px-4 py-3 font-bold disabled:opacity-50"
                                  >
                                    ↩ Send Back With Note
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({
  status,
  dueDate,
}: {
  status:
    | "todo"
    | "turnedIn"
    | "verified"
    | "excused";
  dueDate: string;
}) {
  const overdue =
    status === "todo" &&
    dueDate &&
    dueDate < formatDateForInput(new Date());

  if (status === "verified") {
    return (
      <span className="inline-block bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-bold">
        ✓ Verified
      </span>
    );
  }

  if (status === "excused") {
    return (
      <span className="inline-block bg-gray-200 text-gray-700 rounded-full px-3 py-1 text-sm font-bold">
        Excused
      </span>
    );
  }

  if (status === "turnedIn") {
    return (
      <span className="inline-block bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-sm font-bold">
        Waiting
      </span>
    );
  }

  if (overdue) {
    return (
      <span className="inline-block bg-red-100 text-red-700 rounded-full px-3 py-1 text-sm font-bold">
        Overdue
      </span>
    );
  }

  return (
    <span className="inline-block bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-bold">
      To Do
    </span>
  );
}

function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
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