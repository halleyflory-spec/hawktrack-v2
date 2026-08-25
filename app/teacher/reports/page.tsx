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

const SUBJECTS = [
  "All Subjects",
  "AVID",
  "ELA",
  "Math",
  "Social Studies",
  "Writing",
];

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

type SubjectSummary = {
  subject: string;
  total: number;
  verified: number;
  waiting: number;
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

export default function ReportsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [consequences, setConsequences] =
    useState<ConsequenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [subjectFilter, setSubjectFilter] =
    useState("All Subjects");

  const [timeFilter, setTimeFilter] =
    useState<"all" | "week">("all");

  const [behaviorTimeFilter, setBehaviorTimeFilter] =
    useState<"all" | "week">("week");

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

          await loadReports();
        } catch (error) {
          console.error(error);
          setMessage("HawkTrack couldn't load reports.");
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadReports() {
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

    const assignmentSnapshot = await getDocs(
      query(
        collection(db, "assignments"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedAssignments: Assignment[] =
      assignmentSnapshot.docs.map(
        (assignmentDoc) => {
          const data = assignmentDoc.data();

          return {
            id: assignmentDoc.id,
            title: data.title || "Assignment",
            subject: data.subject || "",
            showDate: data.showDate || "",
            dueDate: data.dueDate || "",
            archived: data.archived === true,
          };
        }
      );

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
          weekKey: data.weekKey || "",
          timeLabel: data.timeLabel || "",
          minutesOfDay: Number(data.minutesOfDay) || 0,
          scheduleBlock:
            data.scheduleBlock || "Outside Scheduled Block",
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
    setConsequences(loadedConsequences);
  }

  const today = useMemo(
    () => formatDateForInput(new Date()),
    []
  );

  const weekStart = useMemo(
    () => formatDateForInput(getMonday(new Date())),
    []
  );

  const weekEnd = useMemo(() => {
    const friday = getMonday(new Date());
    friday.setDate(friday.getDate() + 4);

    return formatDateForInput(friday);
  }, []);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      const subjectMatches =
        subjectFilter === "All Subjects" ||
        assignment.subject === subjectFilter;

      const timeMatches =
        timeFilter === "all" ||
        (
          assignment.showDate >= weekStart &&
          assignment.showDate <= weekEnd
        );

      return subjectMatches && timeMatches;
    });
  }, [
    assignments,
    subjectFilter,
    timeFilter,
    weekStart,
    weekEnd,
  ]);

  const assignmentMap = useMemo(() => {
    const result: Record<string, Assignment> = {};

    filteredAssignments.forEach((assignment) => {
      result[assignment.id] = assignment;
    });

    return result;
  }, [filteredAssignments]);

  const filteredStatuses = useMemo(() => {
    const ids = new Set(
      filteredAssignments.map(
        (assignment) => assignment.id
      )
    );

    return statuses.filter(
      (status) => ids.has(status.assignmentId)
    );
  }, [statuses, filteredAssignments]);

  const countableStatuses = useMemo(
    () =>
      filteredStatuses.filter(
        (status) => status.status !== "excused"
      ),
    [filteredStatuses]
  );

  const verifiedCount = countableStatuses.filter(
    (status) => status.status === "verified"
  ).length;

  const waitingCount = countableStatuses.filter(
    (status) => status.status === "turnedIn"
  ).length;

  const overdueCount = countableStatuses.filter(
    (status) => {
      if (status.status !== "todo") {
        return false;
      }

      const assignment =
        assignmentMap[status.assignmentId];

      return Boolean(
        assignment?.dueDate &&
          assignment.dueDate < today
      );
    }
  ).length;

  const completionPercentage =
    countableStatuses.length === 0
      ? 100
      : Math.round(
          (verifiedCount / countableStatuses.length) *
            100
        );

  const studentSummaries = useMemo<StudentSummary[]>(
    () =>
      students
        .map((student) => {
          const studentStatuses =
            countableStatuses.filter(
              (status) =>
                status.studentId === student.id
            );

          const verified =
            studentStatuses.filter(
              (status) =>
                status.status === "verified"
            ).length;

          const waiting =
            studentStatuses.filter(
              (status) =>
                status.status === "turnedIn"
            ).length;

          const todo =
            studentStatuses.filter(
              (status) =>
                status.status === "todo"
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
                  assignment.dueDate < today
              );
            }).length;

          const total = studentStatuses.length;

          return {
            studentId: student.id,
            name: student.displayName,
            total,
            verified,
            waiting,
            todo,
            overdue,
            percentage:
              total === 0
                ? 100
                : Math.round(
                    (verified / total) * 100
                  ),
          };
        })
        .sort((a, b) => {
          if (a.percentage !== b.percentage) {
            return a.percentage - b.percentage;
          }

          return a.name.localeCompare(b.name);
        }),
    [
      students,
      countableStatuses,
      assignmentMap,
      today,
    ]
  );

  const subjectSummaries = useMemo<SubjectSummary[]>(
    () =>
      SUBJECTS.filter(
        (subject) => subject !== "All Subjects"
      ).map((subject) => {
        const subjectAssignments =
          filteredAssignments.filter(
            (assignment) =>
              assignment.subject === subject
          );

        const ids = new Set(
          subjectAssignments.map(
            (assignment) => assignment.id
          )
        );

        const subjectStatuses =
          countableStatuses.filter((status) =>
            ids.has(status.assignmentId)
          );

        const verified =
          subjectStatuses.filter(
            (status) =>
              status.status === "verified"
          ).length;

        const waiting =
          subjectStatuses.filter(
            (status) =>
              status.status === "turnedIn"
          ).length;

        const overdue =
          subjectStatuses.filter((status) => {
            if (status.status !== "todo") {
              return false;
            }

            const assignment =
              assignmentMap[status.assignmentId];

            return Boolean(
              assignment?.dueDate &&
                assignment.dueDate < today
            );
          }).length;

        const total = subjectStatuses.length;

        return {
          subject,
          total,
          verified,
          waiting,
          overdue,
          percentage:
            total === 0
              ? 100
              : Math.round(
                  (verified / total) * 100
                ),
        };
      }),
    [
      filteredAssignments,
      countableStatuses,
      assignmentMap,
      today,
    ]
  );

  const assignmentRows = useMemo(() => {
    return filteredAssignments
      .map((assignment) => {
        const assignmentStatuses =
          filteredStatuses.filter(
            (status) =>
              status.assignmentId === assignment.id &&
              status.status !== "excused"
          );

        const verified =
          assignmentStatuses.filter(
            (status) =>
              status.status === "verified"
          ).length;

        const waiting =
          assignmentStatuses.filter(
            (status) =>
              status.status === "turnedIn"
          ).length;

        const overdue =
          assignmentStatuses.filter(
            (status) =>
              status.status === "todo" &&
              assignment.dueDate < today
          ).length;

        const total = assignmentStatuses.length;

        return {
          ...assignment,
          total,
          verified,
          waiting,
          overdue,
          percentage:
            total === 0
              ? 100
              : Math.round(
                  (verified / total) * 100
                ),
        };
      })
      .sort((a, b) =>
        b.showDate.localeCompare(a.showDate)
      );
  }, [
    filteredAssignments,
    filteredStatuses,
    today,
  ]);


  // -------------------------------------------------------
  // BEHAVIOR REPORT DATA
  // -------------------------------------------------------

  const filteredBehaviorLogs = useMemo(() => {
    if (behaviorTimeFilter === "all") {
      return behaviorLogs;
    }

    return behaviorLogs.filter(
      (log) => log.weekKey === weekStart
    );
  }, [behaviorLogs, behaviorTimeFilter, weekStart]);

  const filteredConsequences = useMemo(() => {
    if (behaviorTimeFilter === "all") {
      return consequences;
    }

    return consequences.filter(
      (item) =>
        item.dateKey >= weekStart &&
        item.dateKey <= weekEnd
    );
  }, [
    consequences,
    behaviorTimeFilter,
    weekStart,
    weekEnd,
  ]);

  const behaviorByStudent = useMemo(() => {
    return students
      .map((student) => {
        const studentLogs =
          filteredBehaviorLogs.filter(
            (log) => log.studentId === student.id
          );

        const counts: Record<string, number> = {};
        const blockCounts: Record<string, number> = {};

        studentLogs.forEach((log) => {
          const label =
            log.behavior === "Other"
              ? log.customBehavior || "Other"
              : log.behavior;

          counts[label] = (counts[label] || 0) + 1;

          const block =
            log.scheduleBlock ||
            "Outside Scheduled Block";

          blockCounts[block] =
            (blockCounts[block] || 0) + 1;
        });

        const topBehavior =
          Object.entries(counts).sort(
            (a, b) => b[1] - a[1]
          )[0]?.[0] || "—";

        const topBlock =
          Object.entries(blockCounts).sort(
            (a, b) => b[1] - a[1]
          )[0]?.[0] || "—";

        return {
          studentId: student.id,
          name: student.displayName,
          total: studentLogs.length,
          topBehavior,
          topBlock,
        };
      })
      .filter((student) => student.total > 0)
      .sort((a, b) => {
        if (b.total !== a.total) {
          return b.total - a.total;
        }

        return a.name.localeCompare(b.name);
      });
  }, [students, filteredBehaviorLogs]);

  const behaviorTypeSummary = useMemo(() => {
    const counts: Record<string, number> = {};

    filteredBehaviorLogs.forEach((log) => {
      const label =
        log.behavior === "Other"
          ? log.customBehavior || "Other"
          : log.behavior;

      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredBehaviorLogs]);

  const behaviorScheduleSummary = useMemo(() => {
    const counts: Record<string, number> = {};

    filteredBehaviorLogs.forEach((log) => {
      const label =
        log.scheduleBlock ||
        "Outside Scheduled Block";

      counts[label] =
        (counts[label] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredBehaviorLogs]);

  const consequenceSummary = useMemo(() => {
    const counts: Record<string, number> = {};

    filteredConsequences.forEach((item) => {
      counts[item.consequence] =
        (counts[item.consequence] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredConsequences]);

  const behaviorWeeklyTrend = useMemo(() => {
    const weeks: Record<string, number> = {};

    behaviorLogs.forEach((log) => {
      if (!log.weekKey) {
        return;
      }

      weeks[log.weekKey] =
        (weeks[log.weekKey] || 0) + 1;
    });

    return Object.entries(weeks)
      .map(([weekKey, count]) => ({
        weekKey,
        count,
      }))
      .sort((a, b) =>
        a.weekKey.localeCompare(b.weekKey)
      );
  }, [behaviorLogs]);

  const mostCommonBehavior =
    behaviorTypeSummary[0]?.label || "None";

  const mostCommonScheduleBlock =
    behaviorScheduleSummary[0]?.label || "None";

  const behaviorStudentsCount =
    new Set(
      filteredBehaviorLogs.map(
        (log) => log.studentId
      )
    ).size;

  const pendingBehaviorConsequences =
    filteredConsequences.filter(
      (item) => !item.completed
    ).length;

  async function handleLogout() {
    await signOut(auth);
    router.push("/teacher/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading Reports...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-blue-50 p-4 md:p-8">
      <div className="max-w-[1500px] mx-auto">

        <nav className="bg-blue-900 rounded-2xl p-2 mb-6">
          <div className="flex flex-wrap items-center gap-2">

            <button
              onClick={() =>
                router.push("/teacher/dashboard")
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
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
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              📊 Reports
            </button>
            

            <div className="hidden md:block flex-1" />

            <p className="text-yellow-300 font-bold px-4">
              HawkTrack
            </p>

          </div>
        </nav>

        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl font-bold text-blue-900">
                History & Reports
              </h1>

              <p className="text-gray-600 mt-1">
                Look for patterns across students, subjects, and assignments.
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

        <section className="bg-white rounded-3xl border border-blue-200 p-5 mb-6">

          <div className="grid md:grid-cols-2 gap-4">

            <div>
              <label className="block font-bold text-blue-900 mb-2">
                Time
              </label>

              <select
                value={timeFilter}
                onChange={(e) =>
                  setTimeFilter(
                    e.target.value as "all" | "week"
                  )
                }
                className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
              >
                <option value="all">
                  Whole Year
                </option>

                <option value="week">
                  This Week
                </option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-blue-900 mb-2">
                Subject
              </label>

              <select
                value={subjectFilter}
                onChange={(e) =>
                  setSubjectFilter(e.target.value)
                }
                className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
              >
                {SUBJECTS.map((subject) => (
                  <option
                    key={subject}
                    value={subject}
                  >
                    {subject}
                  </option>
                ))}
              </select>
            </div>

          </div>

        </section>

        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">

          <ReportCard
            label="Class Completion"
            value={`${completionPercentage}%`}
            detail={`${verifiedCount} verified`}
          />

          <ReportCard
            label="Assignments"
            value={filteredAssignments.length}
            detail={
              timeFilter === "all"
                ? "in this view"
                : "this week"
            }
          />

          <ReportCard
            label="Waiting"
            value={waitingCount}
            detail="for verification"
          />

          <ReportCard
            label="Overdue"
            value={overdueCount}
            detail="student assignments"
            danger={overdueCount > 0}
          />

        </section>

        <section className="bg-white rounded-3xl border border-blue-200 p-6 mb-6">

          <h2 className="text-2xl font-bold text-blue-900">
            Subject Performance
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            Compare completion patterns by subject.
          </p>

          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">

            {subjectSummaries.map((summary) => (
              <div
                key={summary.subject}
                className="border-2 border-blue-100 rounded-2xl p-4"
              >
                <p className="font-bold text-blue-950">
                  {summary.subject}
                </p>

                <p className="text-3xl font-bold text-blue-900 mt-2">
                  {summary.percentage}%
                </p>

                <div className="mt-3 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400"
                    style={{
                      width: `${summary.percentage}%`,
                    }}
                  />
                </div>

                <div className="text-sm text-gray-600 mt-3 space-y-1">
                  <p>{summary.verified} verified</p>
                  <p>{summary.waiting} waiting</p>

                  {summary.overdue > 0 && (
                    <p className="font-bold text-red-600">
                      {summary.overdue} overdue
                    </p>
                  )}
                </div>
              </div>
            ))}

          </div>

        </section>

        <section className="bg-white rounded-3xl border border-yellow-200 p-6 mb-6">

          <h2 className="text-2xl font-bold text-blue-900">
            Student Comparison
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            Click a name to open that student&apos;s full history.
          </p>

          <div className="overflow-x-auto">

            <table className="w-full min-w-[900px]">

              <thead>
                <tr className="text-left border-b-2 border-yellow-100">

                  <th className="p-3">
                    Student
                  </th>

                  <th className="p-3">
                    Completion
                  </th>

                  <th className="p-3">
                    Verified
                  </th>

                  <th className="p-3">
                    Waiting
                  </th>

                  <th className="p-3">
                    To Do
                  </th>

                  <th className="p-3">
                    Overdue
                  </th>

                </tr>
              </thead>

              <tbody>

                {studentSummaries.map((student) => (
                  <tr
                    key={student.studentId}
                    className="border-b border-yellow-50 hover:bg-yellow-50/50"
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


        {/* BEHAVIOR REPORTS */}
        <section className="bg-white rounded-3xl border-4 border-yellow-300 p-6 mb-6">

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">

            <div>
              <p className="text-sm font-bold uppercase text-yellow-700">
                Behavior Data
              </p>

              <h2 className="text-3xl font-bold text-blue-950">
                ⚡ Behavior Reports
              </h2>

              <p className="text-gray-600 mt-1">
                Look for patterns across students, behaviors, and the school day.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">

              <select
                value={behaviorTimeFilter}
                onChange={(e) =>
                  setBehaviorTimeFilter(
                    e.target.value as "all" | "week"
                  )
                }
                className="border-2 border-yellow-200 rounded-xl p-3 bg-white text-black"
              >
                <option value="week">
                  This Week
                </option>

                <option value="all">
                  Whole Year
                </option>
              </select>

              <button
                onClick={() =>
                  router.push("/teacher/behavior")
                }
                className="bg-yellow-400 text-blue-950 rounded-xl px-5 py-3 font-bold"
              >
                + Log Behavior
              </button>

            </div>

          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-7">

            <BehaviorReportCard
              label="Incidents"
              value={filteredBehaviorLogs.length}
              detail={
                behaviorTimeFilter === "week"
                  ? "this week"
                  : "whole year"
              }
            />

            <BehaviorReportCard
              label="Students"
              value={behaviorStudentsCount}
              detail="with incidents"
            />

            <BehaviorReportCard
              label="Most Common"
              value={mostCommonBehavior}
              detail="behavior"
              small
            />

            <BehaviorReportCard
              label="Most Common Block"
              value={mostCommonScheduleBlock}
              detail="schedule block"
              small
            />

            <BehaviorReportCard
              label="Pending"
              value={pendingBehaviorConsequences}
              detail="consequences"
              danger={pendingBehaviorConsequences > 0}
            />

          </div>

          <div className="grid xl:grid-cols-3 gap-6 mb-7">

            <div className="border-2 border-yellow-100 rounded-3xl p-5">

              <h3 className="text-xl font-bold text-blue-900">
                By Behavior
              </h3>

              <p className="text-sm text-gray-500 mt-1 mb-4">
                Most frequently logged behaviors.
              </p>

              {behaviorTypeSummary.length === 0 ? (
                <p className="text-gray-500">
                  No behavior data in this range.
                </p>
              ) : (
                <div className="space-y-3">

                  {behaviorTypeSummary.map((item) => (
                    <div
                      key={item.label}
                      className="flex justify-between items-center gap-3 border-b border-yellow-50 pb-2"
                    >
                      <span className="font-semibold text-blue-950">
                        {item.label}
                      </span>

                      <span className="bg-yellow-100 text-yellow-900 rounded-full px-3 py-1 font-bold">
                        {item.count}
                      </span>
                    </div>
                  ))}

                </div>
              )}

            </div>

            <div className="border-2 border-blue-100 rounded-3xl p-5">

              <h3 className="text-xl font-bold text-blue-900">
                By Schedule Block
              </h3>

              <p className="text-sm text-gray-500 mt-1 mb-4">
                What the class was doing when incidents happened.
              </p>

              {behaviorScheduleSummary.length === 0 ? (
                <p className="text-gray-500">
                  No schedule data in this range.
                </p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">

                  {behaviorScheduleSummary.map((item) => (
                    <div
                      key={item.label}
                      className="flex justify-between items-center gap-3 border-b border-blue-50 pb-2"
                    >
                      <span className="font-semibold text-blue-950">
                        {item.label}
                      </span>

                      <span className="bg-blue-100 text-blue-900 rounded-full px-3 py-1 font-bold shrink-0">
                        {item.count}
                      </span>
                    </div>
                  ))}

                </div>
              )}

            </div>

            <div className="border-2 border-amber-100 rounded-3xl p-5">

              <h3 className="text-xl font-bold text-blue-900">
                Consequences
              </h3>

              <p className="text-sm text-gray-500 mt-1 mb-4">
                Consequences assigned during this range.
              </p>

              {consequenceSummary.length === 0 ? (
                <p className="text-gray-500">
                  No consequences in this range.
                </p>
              ) : (
                <div className="space-y-3">

                  {consequenceSummary.map((item) => (
                    <div
                      key={item.label}
                      className="flex justify-between items-center gap-3 border-b border-amber-50 pb-2"
                    >
                      <span className="font-semibold text-blue-950">
                        {item.label}
                      </span>

                      <span className="bg-amber-100 text-amber-900 rounded-full px-3 py-1 font-bold">
                        {item.count}
                      </span>
                    </div>
                  ))}

                </div>
              )}

            </div>

          </div>

          <div className="border-2 border-blue-100 rounded-3xl p-5 mb-7">

            <h3 className="text-xl font-bold text-blue-900">
              Student Behavior Comparison
            </h3>

            <p className="text-sm text-gray-500 mt-1 mb-4">
              Click a student to open their full behavior and academic history.
            </p>

            {behaviorByStudent.length === 0 ? (
              <p className="text-gray-500">
                No students have behavior records in this range.
              </p>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[850px]">

                  <thead>
                    <tr className="text-left border-b-2 border-blue-100">
                      <th className="p-3">
                        Student
                      </th>

                      <th className="p-3">
                        Incidents
                      </th>

                      <th className="p-3">
                        Most Common Behavior
                      </th>

                      <th className="p-3">
                        Most Common Block
                      </th>
                    </tr>
                  </thead>

                  <tbody>

                    {behaviorByStudent.map((student) => (
                      <tr
                        key={student.studentId}
                        className="border-b border-blue-50"
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
                          <span className="bg-red-100 text-red-700 rounded-full px-3 py-1 font-bold">
                            {student.total}
                          </span>
                        </td>

                        <td className="p-3">
                          {student.topBehavior}
                        </td>

                        <td className="p-3">
                          {student.topBlock}
                        </td>
                      </tr>
                    ))}

                  </tbody>
                </table>

              </div>
            )}

          </div>

          <div className="border-2 border-purple-100 rounded-3xl p-5">

            <h3 className="text-xl font-bold text-blue-900">
              Weekly Behavior Trend
            </h3>

            <p className="text-sm text-gray-500 mt-1 mb-4">
              Total class incidents by week across the school year.
            </p>

            {behaviorWeeklyTrend.length === 0 ? (
              <p className="text-gray-500">
                No weekly behavior history yet.
              </p>
            ) : (
              <div className="space-y-3">

                {behaviorWeeklyTrend.map((week) => {
                  const maxCount = Math.max(
                    ...behaviorWeeklyTrend.map(
                      (item) => item.count
                    ),
                    1
                  );

                  const width = Math.max(
                    4,
                    Math.round(
                      (week.count / maxCount) * 100
                    )
                  );

                  return (
                    <div
                      key={week.weekKey}
                      className="grid sm:grid-cols-[180px_1fr_60px] gap-3 items-center"
                    >
                      <span className="font-semibold text-blue-950">
                        Week of{" "}
                        {formatDateLabel(
                          week.weekKey
                        )}
                      </span>

                      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400"
                          style={{
                            width: `${width}%`,
                          }}
                        />
                      </div>

                      <span className="font-bold text-blue-900">
                        {week.count}
                      </span>
                    </div>
                  );
                })}

              </div>
            )}

          </div>

        </section>

        <section className="bg-white rounded-3xl border border-blue-200 p-6">

          <h2 className="text-2xl font-bold text-blue-900">
            Assignment History
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            Class-level performance for each assignment.
          </p>

          {assignmentRows.length === 0 ? (
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center text-gray-500">
              No assignments match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full min-w-[950px]">

                <thead>
                  <tr className="text-left border-b-2 border-blue-100">

                    <th className="p-3">
                      Date
                    </th>

                    <th className="p-3">
                      Assignment
                    </th>

                    <th className="p-3">
                      Subject
                    </th>

                    <th className="p-3">
                      Completion
                    </th>

                    <th className="p-3">
                      Verified
                    </th>

                    <th className="p-3">
                      Waiting
                    </th>

                    <th className="p-3">
                      Overdue
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {assignmentRows.map((assignment) => (
                    <tr
                      key={assignment.id}
                      className="border-b border-blue-50"
                    >

                      <td className="p-3 text-gray-600">
                        {formatDateLabel(
                          assignment.showDate
                        )}
                      </td>

                      <td className="p-3 font-bold text-blue-950">
                        {assignment.title}
                      </td>

                      <td className="p-3">
                        {assignment.subject}
                      </td>

                      <td className="p-3">
                        {assignment.percentage}%
                      </td>

                      <td className="p-3">
                        {assignment.verified}
                      </td>

                      <td className="p-3">
                        {assignment.waiting}
                      </td>

                      <td className="p-3">
                        <span
                          className={
                            assignment.overdue > 0
                              ? "font-bold text-red-600"
                              : "text-gray-500"
                          }
                        >
                          {assignment.overdue}
                        </span>
                      </td>

                    </tr>
                  ))}

                </tbody>
              </table>

            </div>
          )}

        </section>

      </div>
    </main>
  );
}

function BehaviorReportCard({
  label,
  value,
  detail,
  small = false,
  danger = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  small?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`border-2 rounded-2xl p-4 ${
        danger
          ? "bg-red-50 border-red-200"
          : "bg-yellow-50 border-yellow-200"
      }`}
    >
      <p
        className={`text-xs uppercase font-bold ${
          danger
            ? "text-red-700"
            : "text-yellow-700"
        }`}
      >
        {label}
      </p>

      <p
        className={`font-bold text-blue-950 mt-2 ${
          small
            ? "text-lg"
            : "text-4xl"
        }`}
      >
        {value}
      </p>

      <p className="text-sm text-gray-500 mt-1">
        {detail}
      </p>
    </div>
  );
}

function ReportCard({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`bg-white border-2 rounded-3xl p-5 ${
        danger
          ? "border-red-200"
          : "border-blue-200"
      }`}
    >
      <p
        className={`text-sm font-bold uppercase ${
          danger
            ? "text-red-700"
            : "text-blue-700"
        }`}
      >
        {label}
      </p>

      <p className="text-4xl font-bold text-blue-950 mt-2">
        {value}
      </p>

      <p className="text-sm text-gray-500 mt-2">
        {detail}
      </p>
    </div>
  );
}

function getMonday(date: Date) {
  const copy = new Date(date);

  copy.setHours(12, 0, 0, 0);

  const day = copy.getDay();

  const difference =
    day === 0 ? -6 : 1 - day;

  copy.setDate(
    copy.getDate() + difference
  );

  return copy;
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

function formatDateLabel(dateString: string) {
  if (!dateString) {
    return "—";
  }

  const [year, month, day] =
    dateString.split("-").map(Number);

  const date = new Date(
    year,
    month - 1,
    day,
    12
  );

  return date.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}