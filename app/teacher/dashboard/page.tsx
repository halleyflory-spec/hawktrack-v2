"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const CLASS_ID = "flory-2026-2027";

type Student = {
  id: string;
  displayName: string;
};

type Assignment = {
  id: string;
  title: string;
  subject: string;
  showDate: string;
  dueDate: string;
  archived: boolean;
};

type StatusRecord = {
  id: string;
  assignmentId: string;
  studentId: string;
  status: "todo" | "turnedIn" | "verified" | "excused";
  feedback: string;
};

type StudentSummary = {
  studentId: string;
  name: string;
  total: number;
  verified: number;
  waiting: number;
  todo: number;
  overdue: number;
  percentage: number;
};

type BehaviorLog = {
  id: string;
  studentId: string;
  behavior: string;
  customBehavior: string;
  note: string;
  dateKey: string;
  timeLabel: string;
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

type TodayBehaviorStudent = {
  studentId: string;
  name: string;
  count: number;
  currentConsequence: ConsequenceRecord | null;
  pendingCount: number;
};

export default function TeacherDashboardPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [behaviorConsequences, setBehaviorConsequences] =
    useState<ConsequenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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

          await loadDashboard();
        } catch (error) {
          console.error(error);
          setMessage("HawkTrack couldn't load the dashboard.");
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadDashboard() {
    const studentSnapshot = await getDocs(
      query(
        collection(db, "students"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedStudents: Student[] = studentSnapshot.docs
      .filter((studentDoc) => studentDoc.data().active !== false)
      .map((studentDoc) => ({
        id: studentDoc.id,
        displayName:
          studentDoc.data().displayName || "Student",
      }))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
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
            showDate: data.showDate || "",
            dueDate: data.dueDate || "",
            archived: data.archived === true,
          };
        })
        .filter((assignment) => !assignment.archived);

    const statusSnapshot = await getDocs(
      query(
        collection(db, "studentAssignmentStatus"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedStatuses: StatusRecord[] =
      statusSnapshot.docs.map((statusDoc) => {
        const data = statusDoc.data();

        return {
          id: statusDoc.id,
          assignmentId: data.assignmentId,
          studentId: data.studentId,
          status: data.status || "todo",
          feedback: data.feedback || "",
        };
      });

    const behaviorSnapshot = await getDocs(
      query(
        collection(db, "behaviorLogs"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedBehaviorLogs: BehaviorLog[] =
      behaviorSnapshot.docs.map((behaviorDoc) => {
        const data = behaviorDoc.data();

        return {
          id: behaviorDoc.id,
          studentId: data.studentId || "",
          behavior: data.behavior || "",
          customBehavior: data.customBehavior || "",
          note: data.note || "",
          dateKey: data.dateKey || "",
          timeLabel: data.timeLabel || "",
          scheduleBlock: data.scheduleBlock || "Unknown",
        };
      });

    const consequenceSnapshot = await getDocs(
      query(
        collection(db, "behaviorConsequences"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedConsequences: ConsequenceRecord[] =
      consequenceSnapshot.docs.map((consequenceDoc) => {
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
      });

    setStudents(loadedStudents);
    setAssignments(loadedAssignments);
    setStatuses(loadedStatuses);
    setBehaviorLogs(loadedBehaviorLogs);
    setBehaviorConsequences(loadedConsequences);
  }

  const todayString = useMemo(
    () => formatDateForInput(new Date()),
    []
  );

  const visibleAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          assignment.showDate &&
          assignment.showDate <= todayString
      ),
    [assignments, todayString]
  );

  const todayAssignments = useMemo(
    () =>
      assignments
        .filter(
          (assignment) =>
            assignment.showDate === todayString
        )
        .sort((a, b) =>
          a.subject.localeCompare(b.subject)
        ),
    [assignments, todayString]
  );

  const assignmentMap = useMemo(() => {
    const result: Record<string, Assignment> = {};

    assignments.forEach((assignment) => {
      result[assignment.id] = assignment;
    });

    return result;
  }, [assignments]);

  const currentStatuses = useMemo(
    () =>
      statuses.filter((status) =>
        visibleAssignments.some(
          (assignment) =>
            assignment.id === status.assignmentId
        )
      ),
    [statuses, visibleAssignments]
  );

  const totalCountable = useMemo(
    () =>
      currentStatuses.filter(
        (status) => status.status !== "excused"
      ).length,
    [currentStatuses]
  );

  const totalVerified = useMemo(
    () =>
      currentStatuses.filter(
        (status) => status.status === "verified"
      ).length,
    [currentStatuses]
  );

  const classCompletion =
    totalCountable === 0
      ? 100
      : Math.round(
          (totalVerified / totalCountable) * 100
        );

  const waitingStatuses = useMemo(
    () =>
      currentStatuses.filter(
        (status) => status.status === "turnedIn"
      ),
    [currentStatuses]
  );

  const overdueStatuses = useMemo(
    () =>
      currentStatuses.filter((status) => {
        if (status.status !== "todo") {
          return false;
        }

        const assignment =
          assignmentMap[status.assignmentId];

        if (!assignment?.dueDate) {
          return false;
        }

        return assignment.dueDate < todayString;
      }),
    [currentStatuses, assignmentMap, todayString]
  );

  const studentSummaries = useMemo<StudentSummary[]>(
    () =>
      students
        .map((student) => {
          const studentStatuses =
            currentStatuses.filter(
              (status) =>
                status.studentId === student.id &&
                status.status !== "excused"
            );

          const verified =
            studentStatuses.filter(
              (status) => status.status === "verified"
            ).length;

          const waiting =
            studentStatuses.filter(
              (status) => status.status === "turnedIn"
            ).length;

          const todo =
            studentStatuses.filter(
              (status) => status.status === "todo"
            ).length;

          const overdue =
            studentStatuses.filter((status) => {
              if (status.status !== "todo") {
                return false;
              }

              const assignment =
                assignmentMap[status.assignmentId];

              return Boolean(
                assignment?.dueDate &&
                  assignment.dueDate < todayString
              );
            }).length;

          const total = studentStatuses.length;

          const percentage =
            total === 0
              ? 100
              : Math.round(
                  (verified / total) * 100
                );

          return {
            studentId: student.id,
            name: student.displayName,
            total,
            verified,
            waiting,
            todo,
            overdue,
            percentage,
          };
        })
        .sort((a, b) => {
          if (b.overdue !== a.overdue) {
            return b.overdue - a.overdue;
          }

          if (a.percentage !== b.percentage) {
            return a.percentage - b.percentage;
          }

          return a.name.localeCompare(b.name);
        }),
    [
      students,
      currentStatuses,
      assignmentMap,
      todayString,
    ]
  );

  const needsAttention = studentSummaries.filter(
    (student) =>
      student.overdue > 0 ||
      student.waiting > 0 ||
      student.percentage < 80
  );

  const todayBehaviorLogs = useMemo(
    () =>
      behaviorLogs.filter(
        (log) => log.dateKey === todayString
      ),
    [behaviorLogs, todayString]
  );

  const todayBehaviorConsequences = useMemo(
    () =>
      behaviorConsequences.filter(
        (item) => item.dateKey === todayString
      ),
    [behaviorConsequences, todayString]
  );

  const pendingBehaviorConsequences = useMemo(
    () =>
      todayBehaviorConsequences.filter(
        (item) => !item.completed
      ),
    [todayBehaviorConsequences]
  );

  const todayBehaviorStudents = useMemo<TodayBehaviorStudent[]>(() => {
    return students
      .map<TodayBehaviorStudent | null>((student) => {
        const studentLogs = todayBehaviorLogs.filter(
          (log) => log.studentId === student.id
        );

        if (studentLogs.length === 0) {
          return null;
        }

        const studentConsequences = todayBehaviorConsequences
          .filter(
            (item) =>
              item.studentId === student.id
          )
          .sort(
            (a, b) =>
              b.countAtAssignment -
              a.countAtAssignment
          );

        const currentConsequence: ConsequenceRecord | null =
          studentConsequences.length > 0
            ? studentConsequences[0]
            : null;

        return {
          studentId: student.id,
          name: student.displayName,
          count: studentLogs.length,
          currentConsequence,
          pendingCount: studentConsequences.filter(
            (item) => !item.completed
          ).length,
        };
      })
      .filter(
        (item): item is TodayBehaviorStudent =>
          item !== null
      )
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.name.localeCompare(b.name);
      });
  }, [
    students,
    todayBehaviorLogs,
    todayBehaviorConsequences,
  ]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/teacher/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading Dashboard...
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
                router.push("/teacher/dashboard")
              }
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              🏠 Dashboard
            </button>

            <button
              onClick={() =>
                router.push("/teacher")
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              📅 Weekly Planner
            </button>
            <button
  onClick={() =>
    router.push("/teacher/checker")
  }
  className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
>
  ✅ Checker
</button>
<button
  onClick={() =>
    router.push("/teacher/behavior")
  }
  className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
>
  ⚡ Behavior
</button>
            <button
            
  onClick={() =>
    router.push("/teacher/reports")
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
                Teacher Dashboard
              </h1>

              <p className="text-gray-600 mt-1">
                Today&apos;s class snapshot
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="bg-blue-900 text-white px-5 py-3 rounded-xl font-bold"
            >
              Log Out
            </button>

          </div>
        </header>

        {message && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6 text-red-700 font-semibold">
            {message}
          </div>
        )}

        {/* SUMMARY CARDS */}
        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">

          <div className="bg-white border-2 border-blue-200 rounded-3xl p-5">
            <p className="text-sm font-bold uppercase text-blue-700">
              Class Completion
            </p>

            <p className="text-4xl font-bold text-blue-950 mt-2">
              {classCompletion}%
            </p>

            <p className="text-sm text-gray-500 mt-2">
              {totalVerified} verified out of{" "}
              {totalCountable} assigned
            </p>
          </div>

          <div className="bg-white border-2 border-yellow-300 rounded-3xl p-5">
            <p className="text-sm font-bold uppercase text-yellow-700">
              Waiting for Checker
            </p>

            <p className="text-4xl font-bold text-blue-950 mt-2">
              {waitingStatuses.length}
            </p>

            <p className="text-sm text-gray-500 mt-2">
              assignments marked turned in
            </p>
          </div>

          <div className="bg-white border-2 border-red-200 rounded-3xl p-5">
            <p className="text-sm font-bold uppercase text-red-700">
              Overdue
            </p>

            <p className="text-4xl font-bold text-blue-950 mt-2">
              {overdueStatuses.length}
            </p>

            <p className="text-sm text-gray-500 mt-2">
              student assignments overdue
            </p>
          </div>

          <div className="bg-white border-2 border-amber-200 rounded-3xl p-5">
            <p className="text-sm font-bold uppercase text-amber-700">
              Today
            </p>

            <p className="text-4xl font-bold text-blue-950 mt-2">
              {todayAssignments.length}
            </p>

            <p className="text-sm text-gray-500 mt-2">
              assignments appearing today
            </p>
          </div>

        </section>

        {/* TODAY AT A GLANCE — BEHAVIOR */}
        <section className="bg-white rounded-3xl border-4 border-yellow-300 p-6 mb-6">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">

            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                Behavior
              </p>

              <h2 className="text-2xl font-bold text-blue-900">
                ⚡ Today at a Glance
              </h2>

              <p className="text-gray-600 mt-1">
                Behavior incidents and unfinished consequences for today.
              </p>
            </div>

            <button
              onClick={() =>
                router.push("/teacher/behavior")
              }
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              + Log Behavior
            </button>

          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-6">

            <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase text-blue-700">
                Incidents Today
              </p>

              <p className="text-4xl font-bold text-blue-950 mt-2">
                {todayBehaviorLogs.length}
              </p>
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase text-yellow-700">
                Students
              </p>

              <p className="text-4xl font-bold text-blue-950 mt-2">
                {todayBehaviorStudents.length}
              </p>

              <p className="text-sm text-gray-500 mt-1">
                with incidents today
              </p>
            </div>

            <div
              className={`border-2 rounded-2xl p-4 ${
                pendingBehaviorConsequences.length > 0
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <p
                className={`text-xs font-bold uppercase ${
                  pendingBehaviorConsequences.length > 0
                    ? "text-red-700"
                    : "text-green-700"
                }`}
              >
                Pending Consequences
              </p>

              <p className="text-4xl font-bold text-blue-950 mt-2">
                {pendingBehaviorConsequences.length}
              </p>

              <p className="text-sm text-gray-500 mt-1">
                not marked completed
              </p>
            </div>

          </div>

          {todayBehaviorStudents.length === 0 ? (
            <div className="border-2 border-dashed border-green-200 rounded-2xl p-6 text-center">
              <p className="font-bold text-green-800">
                No unfavorable behaviors logged today.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">

              {todayBehaviorStudents.map((item) => (
                <button
                  key={item.studentId}
                  onClick={() =>
                    router.push(
                      `/teacher/students/${item.studentId}`
                    )
                  }
                  className="text-left border-2 border-yellow-100 rounded-2xl p-4 hover:border-yellow-300 hover:bg-yellow-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">

                    <div className="min-w-0">
                      <h3 className="font-bold text-blue-950 text-lg underline">
                        {item.name}
                      </h3>

                      <p className="text-sm text-gray-600 mt-1">
                        {item.currentConsequence
                          ? `Current consequence: ${item.currentConsequence.consequence}`
                          : "No consequence recorded"}
                      </p>
                    </div>

                    <span className="bg-red-100 text-red-700 rounded-full px-3 py-1 font-bold shrink-0">
                      {item.count}
                    </span>

                  </div>

                  {item.pendingCount > 0 && (
                    <p className="text-sm font-bold text-red-600 mt-3">
                      {item.pendingCount} consequence
                      {item.pendingCount === 1 ? "" : "s"} pending
                    </p>
                  )}
                </button>
              ))}

            </div>
          )}

        </section>

        <div className="grid xl:grid-cols-2 gap-6 mb-6">

          {/* TODAY'S ASSIGNMENTS */}
          <section className="bg-white rounded-3xl border border-blue-200 p-6">

            <h2 className="text-2xl font-bold text-blue-900">
              Today&apos;s Assignments
            </h2>

            <p className="text-gray-600 mt-1 mb-5">
              Everything students are receiving today.
            </p>

            {todayAssignments.length === 0 ? (
              <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center text-gray-500">
                No assignments are scheduled to appear today.
              </div>
            ) : (
              <div className="space-y-3">

                {todayAssignments.map((assignment) => {
                  const assignmentStatuses =
                    statuses.filter(
                      (status) =>
                        status.assignmentId ===
                        assignment.id
                    );

                  const verified =
                    assignmentStatuses.filter(
                      (status) =>
                        status.status === "verified" ||
                        status.status === "excused"
                    ).length;

                  const waiting =
                    assignmentStatuses.filter(
                      (status) =>
                        status.status === "turnedIn"
                    ).length;

                  return (
                    <div
                      key={assignment.id}
                      className="border-2 border-blue-100 rounded-2xl p-4"
                    >
                      <p className="text-xs font-bold uppercase text-blue-700">
                        {assignment.subject}
                      </p>

                      <h3 className="font-bold text-blue-950 text-lg">
                        {assignment.title}
                      </h3>

                      <div className="flex flex-wrap gap-2 mt-3">

                        <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-bold">
                          {verified} verified
                        </span>

                        {waiting > 0 && (
                          <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-sm font-bold">
                            {waiting} waiting
                          </span>
                        )}

                        <span className="bg-blue-50 text-blue-800 rounded-full px-3 py-1 text-sm font-bold">
                          {assignmentStatuses.length} students
                        </span>

                      </div>
                    </div>
                  );
                })}

              </div>
            )}

          </section>

          {/* NEEDS ATTENTION */}
          <section className="bg-white rounded-3xl border border-yellow-200 p-6">

            <h2 className="text-2xl font-bold text-blue-900">
              Needs Attention
            </h2>

            <p className="text-gray-600 mt-1 mb-5">
              Students with overdue work, waiting work, or low completion.
            </p>

            {needsAttention.length === 0 ? (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 text-center">
                <p className="font-bold text-green-800">
                  🎉 Nothing urgent right now!
                </p>
              </div>
            ) : (
              <div className="space-y-3">

                {needsAttention.map((student) => (
                  <button
                    key={student.studentId}
                    onClick={() =>
                      router.push(
                        `/teacher/students/${student.studentId}`
                      )
                    }
                    className="w-full text-left border-2 border-yellow-100 rounded-2xl p-4 hover:border-yellow-300 hover:bg-yellow-50 transition"
                  >
                    <div className="flex items-center justify-between gap-3">

                      <div>
                        <h3 className="font-bold text-blue-950 text-lg underline">
                          {student.name}
                        </h3>

                        <p className="text-sm text-gray-500 mt-1">
                          {student.percentage}% verified
                        </p>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">

                        {student.overdue > 0 && (
                          <span className="bg-red-100 text-red-700 rounded-full px-3 py-1 text-sm font-bold">
                            {student.overdue} overdue
                          </span>
                        )}

                        {student.waiting > 0 && (
                          <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-sm font-bold">
                            {student.waiting} waiting
                          </span>
                        )}

                        {student.todo > 0 && (
                          <span className="bg-blue-50 text-blue-800 rounded-full px-3 py-1 text-sm font-bold">
                            {student.todo} to do
                          </span>
                        )}

                      </div>
                    </div>
                  </button>
                ))}

              </div>
            )}

          </section>

        </div>

        {/* WHOLE CLASS */}
        <section className="bg-white rounded-3xl border border-blue-200 p-6">

          <div className="mb-5">
            <h2 className="text-2xl font-bold text-blue-900">
              Whole Class
            </h2>

            <p className="text-gray-600 mt-1">
              Click a student&apos;s name to view their full history.
            </p>
          </div>

          <div className="overflow-x-auto">

            <table className="w-full min-w-[800px]">

              <thead>
                <tr className="text-left border-b-2 border-blue-100">

                  <th className="p-3 text-blue-900">
                    Student
                  </th>

                  <th className="p-3 text-blue-900">
                    Completion
                  </th>

                  <th className="p-3 text-blue-900">
                    Verified
                  </th>

                  <th className="p-3 text-blue-900">
                    Waiting
                  </th>

                  <th className="p-3 text-blue-900">
                    To Do
                  </th>

                  <th className="p-3 text-blue-900">
                    Overdue
                  </th>

                </tr>
              </thead>

              <tbody>

                {studentSummaries.map((student) => (
                  <tr
                    key={student.studentId}
                    className="border-b border-blue-50 hover:bg-blue-50/50"
                  >

                    <td className="p-3">
                      <button
                        onClick={() =>
                          router.push(
                            `/teacher/students/${student.studentId}`
                          )
                        }
                        className="font-bold text-blue-950 underline hover:text-blue-700"
                      >
                        {student.name}
                      </button>
                    </td>

                    <td className="p-3">

                      <div className="flex items-center gap-3">

                        <div className="w-28 h-3 bg-gray-100 rounded-full overflow-hidden">

                          <div
                            className="h-full bg-yellow-400"
                            style={{
                              width: `${student.percentage}%`,
                            }}
                          />

                        </div>

                        <span className="font-bold text-blue-900">
                          {student.percentage}%
                        </span>

                      </div>
                    </td>

                    <td className="p-3">
                      {student.verified}
                    </td>

                    <td className="p-3">
                      {student.waiting}
                    </td>

                    <td className="p-3">
                      {student.todo}
                    </td>

                    <td className="p-3">

                      <span
                        className={
                          student.overdue > 0
                            ? "font-bold text-red-600"
                            : "text-gray-500"
                        }
                      >
                        {student.overdue}
                      </span>

                    </td>

                  </tr>
                ))}

              </tbody>
            </table>

          </div>

        </section>

      </div>
    </main>
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