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
  where,
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
  id: string;
  studentId: string;
  assignmentId: string;
  status: "todo" | "turnedIn" | "verified" | "excused";
};

export default function GradebookPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [subjectFilter, setSubjectFilter] =
    useState("All Subjects");

  const [showOnlyIncomplete, setShowOnlyIncomplete] =
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

          await loadGradebook();
        } catch (error) {
          console.error(error);
          setMessage(
            "HawkTrack couldn't load the gradebook."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadGradebook() {
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
            a.showDate.localeCompare(b.showDate);

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
      statusSnapshot.docs.map((statusDoc) => {
        const data = statusDoc.data();

        return {
          id: statusDoc.id,
          studentId: data.studentId || "",
          assignmentId:
            data.assignmentId || "",
          status:
            data.status || "todo",
        };
      });

    setStudents(loadedStudents);
    setAssignments(loadedAssignments);
    setStatuses(loadedStatuses);
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

  const filteredAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          subjectFilter === "All Subjects" ||
          assignment.subject === subjectFilter
      ),
    [assignments, subjectFilter]
  );

  const statusMap = useMemo(() => {
    const map: Record<
      string,
      StatusRecord
    > = {};

    statuses.forEach((status) => {
      map[
        `${status.studentId}|||${status.assignmentId}`
      ] = status;
    });

    return map;
  }, [statuses]);

  const visibleStudents = useMemo(() => {
    if (!showOnlyIncomplete) {
      return students;
    }

    return students.filter((student) =>
      filteredAssignments.some((assignment) => {
        const status =
          statusMap[
            `${student.id}|||${assignment.id}`
          ];

        return (
          status &&
          status.status !== "verified" &&
          status.status !== "excused"
        );
      })
    );
  }, [
    students,
    filteredAssignments,
    statusMap,
    showOnlyIncomplete,
  ]);

  const classTotals = useMemo(() => {
    const countable = statuses.filter(
      (status) =>
        filteredAssignments.some(
          (assignment) =>
            assignment.id ===
            status.assignmentId
        )
    );

    const finished = countable.filter(
      (status) =>
        status.status === "verified" ||
        status.status === "excused"
    );

    return {
      total: countable.length,
      finished: finished.length,
      percentage:
        countable.length === 0
          ? 0
          : Math.round(
              (finished.length /
                countable.length) *
                100
            ),
    };
  }, [statuses, filteredAssignments]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/teacher/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading Gradebook...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-blue-50 p-4 md:p-8">
      <div className="max-w-[1800px] mx-auto">
        <TeacherNav />

        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl font-bold text-blue-900">
                Gradebook
              </h1>

              <p className="text-gray-600 mt-1">
                See every student and assignment in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-green-100 text-green-800 rounded-2xl px-5 py-3 font-bold">
                {classTotals.percentage}% complete
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push("/teacher/checker")
                }
                className="bg-white border-2 border-blue-300 text-blue-900 px-5 py-3 rounded-xl font-bold"
              >
                ✅ Open Checker
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
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6 text-red-700 font-semibold">
            {message}
          </div>
        )}

        <section className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border-2 border-blue-200 rounded-2xl p-5">
            <p className="text-sm font-bold uppercase text-blue-700">
              Assignments
            </p>
            <p className="text-3xl font-bold text-blue-950 mt-2">
              {filteredAssignments.length}
            </p>
          </div>

          <div className="bg-white border-2 border-green-200 rounded-2xl p-5">
            <p className="text-sm font-bold uppercase text-green-700">
              Finished
            </p>
            <p className="text-3xl font-bold text-blue-950 mt-2">
              {classTotals.finished}
            </p>
          </div>

          <div className="bg-white border-2 border-yellow-200 rounded-2xl p-5">
            <p className="text-sm font-bold uppercase text-yellow-700">
              Assigned
            </p>
            <p className="text-3xl font-bold text-blue-950 mt-2">
              {classTotals.total}
            </p>
          </div>
        </section>

        <section className="bg-white border border-blue-200 rounded-3xl p-5 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
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

            <label className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyIncomplete}
                onChange={(e) =>
                  setShowOnlyIncomplete(
                    e.target.checked
                  )
                }
              />
              <span className="font-bold text-blue-900">
                Show only students with incomplete work
              </span>
            </label>
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-blue-200 overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="border-collapse min-w-max w-full">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 bg-blue-900 text-white border border-blue-700 px-4 py-3 text-left min-w-[190px]">
                    Student
                  </th>

                  <th className="sticky left-[190px] z-30 bg-blue-900 text-white border border-blue-700 px-4 py-3 min-w-[110px]">
                    Complete
                  </th>

                  {filteredAssignments.map(
                    (assignment) => (
                      <th
                        key={assignment.id}
                        className="bg-blue-900 text-white border border-blue-700 px-3 py-3 min-w-[150px] max-w-[180px]"
                      >
                        <p className="text-xs text-yellow-300 uppercase">
                          {assignment.subject}
                        </p>
                        <p className="font-bold mt-1">
                          {assignment.title}
                        </p>
                        <p className="text-xs font-normal mt-1">
                          Due{" "}
                          {formatDateLabel(
                            assignment.dueDate
                          )}
                        </p>
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {visibleStudents.map(
                  (student) => {
                    const assignedStatuses =
                      filteredAssignments
                        .map(
                          (assignment) =>
                            statusMap[
                              `${student.id}|||${assignment.id}`
                            ]
                        )
                        .filter(
                          (
                            status
                          ): status is StatusRecord =>
                            Boolean(status)
                        );

                    const finished =
                      assignedStatuses.filter(
                        (status) =>
                          status.status ===
                            "verified" ||
                          status.status ===
                            "excused"
                      ).length;

                    const percentage =
                      assignedStatuses.length === 0
                        ? 0
                        : Math.round(
                            (finished /
                              assignedStatuses.length) *
                              100
                          );

                    return (
                      <tr key={student.id}>
                        <td className="sticky left-0 z-10 bg-white border border-blue-100 px-4 py-3 min-w-[190px]">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/teacher/students/${student.id}`
                              )
                            }
                            className="font-bold text-blue-900 underline"
                          >
                            {student.displayName}
                          </button>
                        </td>

                        <td className="sticky left-[190px] z-10 bg-white border border-blue-100 px-4 py-3 text-center font-bold">
                          {finished}/
                          {assignedStatuses.length}
                          <div className="text-xs text-gray-500">
                            {percentage}%
                          </div>
                        </td>

                        {filteredAssignments.map(
                          (assignment) => {
                            const status =
                              statusMap[
                                `${student.id}|||${assignment.id}`
                              ];

                            return (
                              <td
                                key={
                                  assignment.id
                                }
                                className="border border-blue-100 px-3 py-3 text-center"
                              >
                                {!status ? (
                                  <span className="text-gray-300">
                                    —
                                  </span>
                                ) : (
                                  <GradebookStatus
                                    status={
                                      status.status
                                    }
                                    dueDate={
                                      assignment.dueDate
                                    }
                                  />
                                )}
                              </td>
                            );
                          }
                        )}
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 font-bold">
            ✓ Verified
          </span>
          <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 font-bold">
            Waiting
          </span>
          <span className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 font-bold">
            To Do
          </span>
          <span className="bg-red-100 text-red-700 rounded-full px-3 py-1 font-bold">
            Overdue
          </span>
          <span className="bg-gray-200 text-gray-700 rounded-full px-3 py-1 font-bold">
            Excused
          </span>
          <span className="text-gray-500 px-2 py-1">
            — Not assigned
          </span>
        </div>
      </div>
    </main>
  );
}

function GradebookStatus({
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
      <span className="inline-block bg-green-100 text-green-800 rounded-lg px-2 py-1 text-xs font-bold">
        ✓
      </span>
    );
  }

  if (status === "turnedIn") {
    return (
      <span className="inline-block bg-yellow-100 text-yellow-800 rounded-lg px-2 py-1 text-xs font-bold">
        Waiting
      </span>
    );
  }

  if (status === "excused") {
    return (
      <span className="inline-block bg-gray-200 text-gray-700 rounded-lg px-2 py-1 text-xs font-bold">
        Excused
      </span>
    );
  }

  if (overdue) {
    return (
      <span className="inline-block bg-red-100 text-red-700 rounded-lg px-2 py-1 text-xs font-bold">
        Overdue
      </span>
    );
  }

  return (
    <span className="inline-block bg-blue-100 text-blue-800 rounded-lg px-2 py-1 text-xs font-bold">
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
    }
  );
}