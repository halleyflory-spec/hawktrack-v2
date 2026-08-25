"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  status: "todo" | "turnedIn" | "verified" | "excused";
  feedback: string;
};

type WeeklyGoal = {
  id: string;
  weekStart: string;
  goalText: string;
  target: number;
  progress: number;
};

type Support = {
  id: string;
  name: string;
  type: "dailyAllowance" | "weeklyGoal";
  reward: string;
  active: boolean;
};

type SupportProgress = {
  id: string;
  supportId: string;
  periodKey: string;
  count: number;
};

type SubjectSummary = {
  subject: string;
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

export default function StudentHistoryPage() {
  const router = useRouter();
  const params = useParams();

  const studentId = params.studentId as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>([]);
  const [supports, setSupports] = useState<Support[]>([]);
  const [supportProgress, setSupportProgress] =
    useState<SupportProgress[]>([]);

  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [consequences, setConsequences] =
    useState<ConsequenceRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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

        await loadStudentHistory();
      } catch (error) {
        console.error(error);
        setMessage("HawkTrack couldn't load this student.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, studentId]);

  async function loadStudentHistory() {
    const studentSnapshot = await getDoc(
      doc(db, "students", studentId)
    );

    if (!studentSnapshot.exists()) {
      setMessage("That student could not be found.");
      return;
    }

    const studentData = studentSnapshot.data();

    setStudent({
      id: studentSnapshot.id,
      displayName: studentData.displayName || "Student",
    });

    // ASSIGNMENT STATUS
    const statusSnapshot = await getDocs(
      query(
        collection(db, "studentAssignmentStatus"),
        where("studentId", "==", studentId)
      )
    );

    const loadedStatuses: StatusRecord[] =
      statusSnapshot.docs.map((statusDoc) => {
        const data = statusDoc.data();

        return {
          id: statusDoc.id,
          assignmentId: data.assignmentId,
          status: data.status || "todo",
          feedback: data.feedback || "",
        };
      });

    const assignmentIds = Array.from(
      new Set(
        loadedStatuses.map(
          (status) => status.assignmentId
        )
      )
    );

    const loadedAssignments: Assignment[] = [];

    for (const assignmentId of assignmentIds) {
      const assignmentSnapshot = await getDoc(
        doc(db, "assignments", assignmentId)
      );

      if (!assignmentSnapshot.exists()) {
        continue;
      }

      const data = assignmentSnapshot.data();

      loadedAssignments.push({
        id: assignmentSnapshot.id,
        title: data.title || "Assignment",
        subject: data.subject || "",
        showDate: data.showDate || "",
        dueDate: data.dueDate || "",
        archived: data.archived === true,
      });
    }

    // WEEKLY GOALS
    const goalSnapshot = await getDocs(
      query(
        collection(db, "weeklyGoals"),
        where("studentId", "==", studentId)
      )
    );

    const loadedGoals: WeeklyGoal[] =
      goalSnapshot.docs
        .map((goalDoc) => {
          const data = goalDoc.data();

          return {
            id: goalDoc.id,
            weekStart: data.weekStart || "",
            goalText: data.goalText || "",
            target: Number(data.target) || 1,
            progress: Number(data.progress) || 0,
          };
        })
        .sort((a, b) =>
          b.weekStart.localeCompare(a.weekStart)
        );

    // SUPPORTS
    const supportSnapshot = await getDocs(
      query(
        collection(db, "supports"),
        where("studentId", "==", studentId)
      )
    );

    const loadedSupports: Support[] =
      supportSnapshot.docs.map((supportDoc) => {
        const data = supportDoc.data();

        return {
          id: supportDoc.id,
          name: data.name || "Support",
          type:
            data.type === "weeklyGoal"
              ? "weeklyGoal"
              : "dailyAllowance",
          reward: data.reward || "",
          active: data.active !== false,
        };
      });

    // SUPPORT PROGRESS
    const progressSnapshot = await getDocs(
      query(
        collection(db, "supportProgress"),
        where("studentId", "==", studentId)
      )
    );

    const loadedProgress: SupportProgress[] =
      progressSnapshot.docs.map((progressDoc) => {
        const data = progressDoc.data();

        return {
          id: progressDoc.id,
          supportId: data.supportId || "",
          periodKey: data.periodKey || "",
          count: Number(data.count) || 0,
        };
      });

    // BEHAVIOR LOGS
    const behaviorSnapshot = await getDocs(
      query(
        collection(db, "behaviorLogs"),
        where("studentId", "==", studentId)
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

    // CONSEQUENCES
    const consequenceSnapshot = await getDocs(
      query(
        collection(db, "behaviorConsequences"),
        where("studentId", "==", studentId)
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

    setStatuses(loadedStatuses);
    setAssignments(loadedAssignments);
    setWeeklyGoals(loadedGoals);
    setSupports(loadedSupports);
    setSupportProgress(loadedProgress);
    setBehaviorLogs(loadedBehaviorLogs);
    setConsequences(loadedConsequences);
  }

  // -------------------------------------------------------
  // ASSIGNMENT DATA
  // -------------------------------------------------------

  const assignmentMap = useMemo(() => {
    const result: Record<string, Assignment> = {};

    assignments.forEach((assignment) => {
      result[assignment.id] = assignment;
    });

    return result;
  }, [assignments]);

  const todayString = useMemo(
    () => formatDateForInput(new Date()),
    []
  );

  const currentWeekKey = useMemo(
    () => formatDateForInput(getMonday(new Date())),
    []
  );

  const countableStatuses = useMemo(
    () =>
      statuses.filter(
        (status) => status.status !== "excused"
      ),
    [statuses]
  );

  const verifiedCount = useMemo(
    () =>
      countableStatuses.filter(
        (status) => status.status === "verified"
      ).length,
    [countableStatuses]
  );

  const waitingCount = useMemo(
    () =>
      countableStatuses.filter(
        (status) => status.status === "turnedIn"
      ).length,
    [countableStatuses]
  );

  const todoCount = useMemo(
    () =>
      countableStatuses.filter(
        (status) => status.status === "todo"
      ).length,
    [countableStatuses]
  );

  const overdueCount = useMemo(
    () =>
      countableStatuses.filter((status) => {
        if (status.status !== "todo") {
          return false;
        }

        const assignment =
          assignmentMap[status.assignmentId];

        return Boolean(
          assignment?.dueDate &&
            assignment.dueDate < todayString
        );
      }).length,
    [countableStatuses, assignmentMap, todayString]
  );

  const overallPercentage =
    countableStatuses.length === 0
      ? 100
      : Math.round(
          (verifiedCount /
            countableStatuses.length) *
            100
        );

  const subjectSummaries = useMemo<SubjectSummary[]>(() => {
    const subjects = [
      "AVID",
      "ELA",
      "Math",
      "Social Studies",
      "Writing",
    ];

    return subjects.map((subject) => {
      const subjectStatuses =
        countableStatuses.filter((status) => {
          const assignment =
            assignmentMap[status.assignmentId];

          return assignment?.subject === subject;
        });

      const verified =
        subjectStatuses.filter(
          (status) => status.status === "verified"
        ).length;

      const waiting =
        subjectStatuses.filter(
          (status) => status.status === "turnedIn"
        ).length;

      const todo =
        subjectStatuses.filter(
          (status) => status.status === "todo"
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
              assignment.dueDate < todayString
          );
        }).length;

      const total = subjectStatuses.length;

      return {
        subject,
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
    });
  }, [
    countableStatuses,
    assignmentMap,
    todayString,
  ]);

  const assignmentHistory = useMemo(() => {
    return statuses
      .map((status) => {
        const assignment =
          assignmentMap[status.assignmentId];

        if (!assignment) {
          return null;
        }

        return {
          ...status,
          assignment,
          overdue:
            status.status === "todo" &&
            Boolean(
              assignment.dueDate &&
                assignment.dueDate < todayString
            ),
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        (b?.assignment.showDate || "").localeCompare(
          a?.assignment.showDate || ""
        )
      );
  }, [statuses, assignmentMap, todayString]);

  // -------------------------------------------------------
  // BEHAVIOR DATA
  // -------------------------------------------------------

  const todayBehaviorLogs = useMemo(
    () =>
      behaviorLogs.filter(
        (log) => log.dateKey === todayString
      ),
    [behaviorLogs, todayString]
  );

  const weekBehaviorLogs = useMemo(
    () =>
      behaviorLogs.filter(
        (log) => log.weekKey === currentWeekKey
      ),
    [behaviorLogs, currentWeekKey]
  );

  const behaviorCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    behaviorLogs.forEach((log) => {
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
  }, [behaviorLogs]);

  const scheduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    behaviorLogs.forEach((log) => {
      const label =
        log.scheduleBlock || "Unknown";

      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [behaviorLogs]);

  const consequenceCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    consequences.forEach((item) => {
      counts[item.consequence] =
        (counts[item.consequence] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [consequences]);

  const mostCommonBehavior =
    behaviorCounts.length > 0
      ? behaviorCounts[0].label
      : "None";

  const mostCommonSchedule =
    scheduleCounts.length > 0
      ? scheduleCounts[0].label
      : "None";

  const completedConsequences =
    consequences.filter(
      (item) => item.completed
    ).length;

  const pendingConsequences =
    consequences.filter(
      (item) => !item.completed
    ).length;

  const sortedBehaviorHistory = useMemo(() => {
    return behaviorLogs
      .slice()
      .sort((a, b) => {
        const dateCompare =
          b.dateKey.localeCompare(a.dateKey);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return (
          b.minutesOfDay -
          a.minutesOfDay
        );
      });
  }, [behaviorLogs]);

  const weeklyBehaviorHistory = useMemo(() => {
    const weeks: Record<
      string,
      {
        total: number;
        behaviors: Record<string, number>;
        blocks: Record<string, number>;
      }
    > = {};

    behaviorLogs.forEach((log) => {
      const week =
        log.weekKey || "Unknown";

      if (!weeks[week]) {
        weeks[week] = {
          total: 0,
          behaviors: {},
          blocks: {},
        };
      }

      weeks[week].total += 1;

      const behaviorLabel =
        log.behavior === "Other"
          ? log.customBehavior || "Other"
          : log.behavior;

      weeks[week].behaviors[behaviorLabel] =
        (weeks[week].behaviors[
          behaviorLabel
        ] || 0) + 1;

      const block =
        log.scheduleBlock || "Unknown";

      weeks[week].blocks[block] =
        (weeks[week].blocks[block] || 0) + 1;
    });

    return Object.entries(weeks)
      .map(([weekKey, data]) => {
        const topBehavior =
          Object.entries(data.behaviors).sort(
            (a, b) => b[1] - a[1]
          )[0];

        const topBlock =
          Object.entries(data.blocks).sort(
            (a, b) => b[1] - a[1]
          )[0];

        return {
          weekKey,
          total: data.total,
          topBehavior:
            topBehavior?.[0] || "—",
          topBlock:
            topBlock?.[0] || "—",
        };
      })
      .sort((a, b) =>
        b.weekKey.localeCompare(a.weekKey)
      );
  }, [behaviorLogs]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/teacher/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading Student History...
        </p>
      </main>
    );
  }

  if (!student) {
    return (
      <main className="min-h-screen bg-blue-50 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl p-6">
          <p className="font-bold text-red-700">
            {message || "Student not found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-blue-50 p-4 md:p-8">
      <div className="max-w-[1500px] mx-auto">

        {/* NAV */}
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div>
              <button
                onClick={() =>
                  router.push("/teacher/dashboard")
                }
                className="text-blue-700 font-bold underline mb-3"
              >
                ← Back to Class
              </button>

              <p className="text-sm font-bold uppercase text-yellow-700">
                Student History
              </p>

              <h1 className="text-3xl font-bold text-blue-950">
                {student.displayName}
              </h1>

              <p className="text-gray-600 mt-1">
                Year-long HawkTrack record
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
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-6 text-red-700">
            {message}
          </div>
        )}

        {/* ASSIGNMENT SUMMARY */}
        <section className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">

          <SummaryCard
            label="Overall"
            value={`${overallPercentage}%`}
            detail="verified"
          />

          <SummaryCard
            label="Verified"
            value={verifiedCount}
            detail="assignments"
          />

          <SummaryCard
            label="Waiting"
            value={waitingCount}
            detail="for checker"
          />

          <SummaryCard
            label="To Do"
            value={todoCount}
            detail="assignments"
          />

          <SummaryCard
            label="Overdue"
            value={overdueCount}
            detail="assignments"
            danger={overdueCount > 0}
          />

        </section>

        {/* SUBJECT BREAKDOWN */}
        <section className="bg-white rounded-3xl border border-blue-200 p-6 mb-6">

          <h2 className="text-2xl font-bold text-blue-900">
            Subject Breakdown
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            This makes it easier to spot patterns by subject.
          </p>

          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">

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
                  <p>{summary.todo} to do</p>

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

        {/* ================================================= */}
        {/* BEHAVIOR HISTORY */}
        {/* ================================================= */}

        <section className="bg-white rounded-3xl border-4 border-yellow-300 p-6 mb-6">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">

            <div>
              <p className="text-sm uppercase font-bold text-yellow-700">
                Behavior Data
              </p>

              <h2 className="text-3xl font-bold text-blue-950">
                ⚡ Behavior History
              </h2>

              <p className="text-gray-600 mt-1">
                Individual behavior patterns, consequences, and schedule data.
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

          {/* BEHAVIOR SUMMARY CARDS */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">

            <BehaviorSummaryCard
              label="Today"
              value={todayBehaviorLogs.length}
              detail="incidents"
            />

            <BehaviorSummaryCard
              label="This Week"
              value={weekBehaviorLogs.length}
              detail="incidents"
            />

            <BehaviorSummaryCard
              label="All Time"
              value={behaviorLogs.length}
              detail="incidents"
            />

            <BehaviorSummaryCard
              label="Most Common"
              value={mostCommonBehavior}
              detail="behavior"
              small
            />

            <BehaviorSummaryCard
              label="Most Common Time"
              value={mostCommonSchedule}
              detail="schedule block"
              small
            />

          </div>

          {/* PATTERNS */}
          <div className="grid xl:grid-cols-3 gap-6 mb-8">

            {/* BY BEHAVIOR */}
            <div className="border-2 border-yellow-100 rounded-3xl p-5">

              <h3 className="text-xl font-bold text-blue-900">
                By Behavior
              </h3>

              <p className="text-sm text-gray-500 mt-1 mb-4">
                All recorded incidents.
              </p>

              {behaviorCounts.length === 0 ? (
                <p className="text-gray-500">
                  No behavior data yet.
                </p>
              ) : (
                <div className="space-y-3">

                  {behaviorCounts.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 border-b border-yellow-50 pb-2"
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

            {/* BY SCHEDULE */}
            <div className="border-2 border-blue-100 rounded-3xl p-5">

              <h3 className="text-xl font-bold text-blue-900">
                By Schedule Block
              </h3>

              <p className="text-sm text-gray-500 mt-1 mb-4">
                When behaviors are happening most.
              </p>

              {scheduleCounts.length === 0 ? (
                <p className="text-gray-500">
                  No schedule data yet.
                </p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">

                  {scheduleCounts.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 border-b border-blue-50 pb-2"
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

            {/* CONSEQUENCES */}
            <div className="border-2 border-amber-100 rounded-3xl p-5">

              <h3 className="text-xl font-bold text-blue-900">
                Consequences
              </h3>

              <p className="text-sm text-gray-500 mt-1 mb-4">
                Consequences assigned from behavior records.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-5">

                <div className="bg-green-50 rounded-2xl p-4">
                  <p className="text-xs uppercase font-bold text-green-700">
                    Completed
                  </p>

                  <p className="text-3xl font-bold text-green-800">
                    {completedConsequences}
                  </p>
                </div>

                <div className="bg-red-50 rounded-2xl p-4">
                  <p className="text-xs uppercase font-bold text-red-700">
                    Pending
                  </p>

                  <p className="text-3xl font-bold text-red-800">
                    {pendingConsequences}
                  </p>
                </div>

              </div>

              {consequenceCounts.length === 0 ? (
                <p className="text-gray-500">
                  No consequences recorded.
                </p>
              ) : (
                <div className="space-y-3">

                  {consequenceCounts.map((item) => (
                    <div
                      key={item.label}
                      className="flex justify-between gap-3 border-b border-amber-50 pb-2"
                    >
                      <span className="font-semibold text-blue-950">
                        {item.label}
                      </span>

                      <span className="font-bold text-amber-800">
                        {item.count}
                      </span>
                    </div>
                  ))}

                </div>
              )}

            </div>

          </div>

          {/* WEEK BY WEEK */}
          <div className="border-2 border-purple-100 rounded-3xl p-5 mb-8">

            <h3 className="text-xl font-bold text-blue-900">
              Week-by-Week Behavior
            </h3>

            <p className="text-gray-500 text-sm mt-1 mb-4">
              Use this to see whether behavior is increasing, decreasing, or shifting over time.
            </p>

            {weeklyBehaviorHistory.length === 0 ? (
              <p className="text-gray-500">
                No weekly behavior data yet.
              </p>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[700px]">

                  <thead>
                    <tr className="text-left border-b-2 border-purple-100">
                      <th className="p-3">Week</th>
                      <th className="p-3">Incidents</th>
                      <th className="p-3">Most Common Behavior</th>
                      <th className="p-3">Most Common Block</th>
                    </tr>
                  </thead>

                  <tbody>

                    {weeklyBehaviorHistory.map((week) => (
                      <tr
                        key={week.weekKey}
                        className="border-b border-purple-50"
                      >
                        <td className="p-3 font-bold text-blue-950">
                          {week.weekKey === "Unknown"
                            ? "Unknown"
                            : `Week of ${formatDateLabel(
                                week.weekKey
                              )}`}
                        </td>

                        <td className="p-3">
                          <span className="bg-purple-100 text-purple-800 rounded-full px-3 py-1 font-bold">
                            {week.total}
                          </span>
                        </td>

                        <td className="p-3">
                          {week.topBehavior}
                        </td>

                        <td className="p-3">
                          {week.topBlock}
                        </td>
                      </tr>
                    ))}

                  </tbody>
                </table>

              </div>
            )}

          </div>

          {/* FULL INCIDENT HISTORY */}
          <div>

            <h3 className="text-xl font-bold text-blue-900">
              Full Incident History
            </h3>

            <p className="text-gray-500 text-sm mt-1 mb-4">
              Every unfavorable behavior recorded for this student.
            </p>

            {sortedBehaviorHistory.length === 0 ? (
              <div className="border-2 border-dashed border-green-200 rounded-2xl p-8 text-center">

                <p className="font-bold text-green-800">
                  No unfavorable behavior has been recorded for this student.
                </p>

              </div>
            ) : (
              <div className="space-y-3">

                {sortedBehaviorHistory.map((log) => (
                  <div
                    key={log.id}
                    className="border-2 border-blue-100 rounded-2xl p-4"
                  >

                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">

                      <div>

                        <div className="flex flex-wrap items-center gap-2">

                          <span className="bg-red-100 text-red-800 rounded-full px-3 py-1 text-sm font-bold">
                            {log.behavior === "Other"
                              ? log.customBehavior || "Other"
                              : log.behavior}
                          </span>

                          <span className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-bold">
                            {log.scheduleBlock}
                          </span>

                        </div>

                        {log.note && (
                          <p className="text-gray-700 mt-3">
                            {log.note}
                          </p>
                        )}

                      </div>

                      <div className="md:text-right shrink-0">

                        <p className="font-bold text-blue-950">
                          {formatDateLabel(log.dateKey)}
                        </p>

                        <p className="text-sm text-gray-500">
                          {log.timeLabel || "Time unavailable"}
                        </p>

                      </div>

                    </div>

                  </div>
                ))}

              </div>
            )}

          </div>

        </section>

        {/* WEEKLY GOALS + SUPPORTS */}
        <div className="grid xl:grid-cols-2 gap-6 mb-6">

          <section className="bg-white rounded-3xl border border-yellow-200 p-6">

            <h2 className="text-2xl font-bold text-blue-900">
              Weekly Goals
            </h2>

            <p className="text-gray-600 mt-1 mb-5">
              Goals the student has tracked throughout the year.
            </p>

            {weeklyGoals.length === 0 ? (
              <div className="border-2 border-dashed border-yellow-200 rounded-2xl p-6 text-center text-gray-500">
                No weekly goals recorded yet.
              </div>
            ) : (
              <div className="space-y-3">

                {weeklyGoals.map((goal) => {
                  const percent = Math.min(
                    100,
                    Math.round(
                      (goal.progress / goal.target) * 100
                    )
                  );

                  return (
                    <div
                      key={goal.id}
                      className="border-2 border-yellow-100 rounded-2xl p-4"
                    >
                      <p className="text-xs uppercase font-bold text-yellow-700">
                        Week of{" "}
                        {formatDateLabel(goal.weekStart)}
                      </p>

                      <h3 className="font-bold text-blue-950 mt-1">
                        {goal.goalText}
                      </h3>

                      <p className="text-sm text-gray-600 mt-2">
                        {goal.progress} of {goal.target}
                      </p>

                      <div className="mt-3 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400"
                          style={{
                            width: `${percent}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

          </section>

          <section className="bg-white rounded-3xl border border-amber-200 p-6">

            <h2 className="text-2xl font-bold text-blue-900">
              Supports & Rewards History
            </h2>

            <p className="text-gray-600 mt-1 mb-5">
              Current and past support tracking.
            </p>

            {supports.length === 0 ? (
              <div className="border-2 border-dashed border-amber-200 rounded-2xl p-6 text-center text-gray-500">
                No supports have been assigned.
              </div>
            ) : (
              <div className="space-y-4">

                {supports.map((support) => {
                  const progressRecords =
                    supportProgress
                      .filter(
                        (progress) =>
                          progress.supportId ===
                          support.id
                      )
                      .sort((a, b) =>
                        b.periodKey.localeCompare(
                          a.periodKey
                        )
                      );

                  return (
                    <div
                      key={support.id}
                      className="border-2 border-amber-100 rounded-2xl p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div>
                          <h3 className="font-bold text-blue-950">
                            {support.name}
                          </h3>

                          <p className="text-sm text-gray-500">
                            {support.type ===
                            "dailyAllowance"
                              ? "Daily Allowance"
                              : "Weekly Goal / Reward"}
                          </p>

                          {support.reward && (
                            <p className="text-sm text-amber-800 mt-1">
                              Reward: {support.reward}
                            </p>
                          )}
                        </div>

                        <span
                          className={`text-xs rounded-full px-3 py-1 font-bold ${
                            support.active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {support.active
                            ? "Active"
                            : "Inactive"}
                        </span>

                      </div>

                      {progressRecords.length > 0 && (
                        <div className="mt-4 max-h-48 overflow-y-auto">

                          {progressRecords.map(
                            (progress) => (
                              <div
                                key={progress.id}
                                className="flex justify-between border-t border-amber-100 py-2 text-sm"
                              >
                                <span>
                                  {formatDateLabel(
                                    progress.periodKey
                                  )}
                                </span>

                                <span className="font-bold text-blue-900">
                                  {progress.count}
                                </span>
                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>
                  );
                })}

              </div>
            )}

          </section>

        </div>

        {/* ASSIGNMENT HISTORY */}
        <section className="bg-white rounded-3xl border border-blue-200 p-6">

          <h2 className="text-2xl font-bold text-blue-900">
            Assignment History
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            Every assignment recorded for this student.
          </p>

          {assignmentHistory.length === 0 ? (
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center text-gray-500">
              No assignment history yet.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full min-w-[900px]">

                <thead>
                  <tr className="text-left border-b-2 border-blue-100">
                    <th className="p-3">Date</th>
                    <th className="p-3">Assignment</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Due</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Feedback</th>
                  </tr>
                </thead>

                <tbody>

                  {assignmentHistory.map((record) => {
                    if (!record) {
                      return null;
                    }

                    return (
                      <tr
                        key={record.id}
                        className="border-b border-blue-50"
                      >

                        <td className="p-3 text-gray-600">
                          {formatDateLabel(
                            record.assignment.showDate
                          )}
                        </td>

                        <td className="p-3 font-bold text-blue-950">
                          {record.assignment.title}
                        </td>

                        <td className="p-3">
                          {record.assignment.subject}
                        </td>

                        <td className="p-3">
                          {formatDateLabel(
                            record.assignment.dueDate
                          )}
                        </td>

                        <td className="p-3">
                          <StatusBadge
                            status={record.status}
                            overdue={record.overdue}
                          />
                        </td>

                        <td className="p-3 text-gray-600">
                          {record.feedback || "—"}
                        </td>

                      </tr>
                    );
                  })}

                </tbody>
              </table>

            </div>
          )}

        </section>

      </div>
    </main>
  );
}

function SummaryCard({
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

function BehaviorSummaryCard({
  label,
  value,
  detail,
  small = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  small?: boolean;
}) {
  return (
    <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4">

      <p className="text-xs uppercase font-bold text-yellow-700">
        {label}
      </p>

      <p
        className={`font-bold text-blue-950 mt-2 ${
          small
            ? "text-xl"
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

function StatusBadge({
  status,
  overdue,
}: {
  status: string;
  overdue: boolean;
}) {
  if (overdue) {
    return (
      <span className="bg-red-100 text-red-700 rounded-full px-3 py-1 text-xs font-bold">
        OVERDUE
      </span>
    );
  }

  if (status === "verified") {
    return (
      <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-xs font-bold">
        VERIFIED
      </span>
    );
  }

  if (status === "turnedIn") {
    return (
      <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-xs font-bold">
        WAITING
      </span>
    );
  }

  if (status === "excused") {
    return (
      <span className="bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-xs font-bold">
        EXCUSED
      </span>
    );
  }

  return (
    <span className="bg-blue-50 text-blue-800 rounded-full px-3 py-1 text-xs font-bold">
      TO DO
    </span>
  );
}

function getMonday(date: Date) {
  const copy = new Date(date);

  copy.setHours(12, 0, 0, 0);

  const day = copy.getDay();

  copy.setDate(
    copy.getDate() +
      (day === 0 ? -6 : 1 - day)
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

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}