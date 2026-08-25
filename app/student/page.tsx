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
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type StudentProfile = {
  displayName: string;
  classId: string;
  weeklyGoalsEnabled: boolean;
};

type SchoolworkItem = {
  statusId: string;
  assignmentId: string;
  title: string;
  subject: string;
  description: string;
  showDate: string;
  dueDate: string;
  status: "todo" | "turnedIn" | "verified" | "excused";
  feedback: string;
};

type WeeklyGoal = {
  id: string;
  studentId: string;
  classId: string;
  weekStart: string;
  goalText: string;
  target: number;
  progress: number;
  active: boolean;
};

type Support = {
  id: string;
  studentId: string;
  name: string;
  type: "dailyAllowance" | "weeklyGoal";
  description: string;
  target: number;
  reward: string;
  studentCanTrack: boolean;
  active: boolean;
};

type SupportProgress = {
  id: string;
  studentId: string;
  supportId: string;
  periodKey: string;
  count: number;
};

export default function StudentPage() {
  const router = useRouter();

  const [student, setStudent] =
    useState<StudentProfile | null>(null);

  const [studentId, setStudentId] =
    useState("");

  const [schoolwork, setSchoolwork] =
    useState<SchoolworkItem[]>([]);

  const [weeklyGoal, setWeeklyGoal] =
    useState<WeeklyGoal | null>(null);

  const [supports, setSupports] =
    useState<Support[]>([]);

  const [supportProgress, setSupportProgress] =
    useState<SupportProgress[]>([]);

  const [supportUpdatingId, setSupportUpdatingId] =
    useState<string | null>(null);

  const [goalText, setGoalText] =
    useState("");

  const [goalTarget, setGoalTarget] =
    useState(5);

  const [loading, setLoading] =
    useState(true);

  const [goalSaving, setGoalSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.push("/");
          return;
        }

        try {
          setStudentId(user.uid);

          const studentSnapshot =
            await getDoc(
              doc(
                db,
                "students",
                user.uid
              )
            );

          if (
            !studentSnapshot.exists()
          ) {
            await signOut(auth);
            router.push("/");
            return;
          }

          const data =
            studentSnapshot.data();

          setStudent({
            displayName:
              data.displayName,
            classId:
              data.classId,
            weeklyGoalsEnabled:
              data.weeklyGoalsEnabled !==
              false,
          });

          await loadSchoolwork(
            user.uid
          );

          await loadWeeklyGoal(
            user.uid,
            data.classId
          );

          await loadSupportsAndProgress(
            user.uid
          );
        } catch (error) {
          console.error(error);

          setMessage(
            "HawkTrack couldn't load your page."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () =>
      unsubscribe();
  }, [router]);

  async function loadSchoolwork(
    currentStudentId: string
  ) {
    const statusQuery = query(
      collection(
        db,
        "studentAssignmentStatus"
      ),
      where(
        "studentId",
        "==",
        currentStudentId
      )
    );

    const statusSnapshot =
      await getDocs(statusQuery);

    const today =
      formatDateForInput(
        new Date()
      );

    const currentWeekStart =
      getWeekStartString();

    const items: SchoolworkItem[] =
      [];

    for (
      const statusDoc
      of statusSnapshot.docs
    ) {
      const statusData =
        statusDoc.data();

      const assignmentSnapshot =
        await getDoc(
          doc(
            db,
            "assignments",
            statusData.assignmentId
          )
        );

      if (
        !assignmentSnapshot.exists()
      ) {
        continue;
      }

      const assignmentData =
        assignmentSnapshot.data();

      if (
        assignmentData.showDate >
        today
      ) {
        continue;
      }

      if (
        assignmentData.archived ===
        true
      ) {
        continue;
      }

      const status =
        statusData.status ||
        "todo";

      // Weekly rollover behavior:
      // - To do / overdue work stays until it is finished.
      // - Turned-in work stays until a checker handles it.
      // - Verified / excused work stays visible for the week it was
      //   completed, then drops off the active student screen.
      if (
        status === "verified" ||
        status === "excused"
      ) {
        const completedDate =
          getStatusCompletedDate(
            statusData,
            assignmentData.showDate || ""
          );

        if (
          completedDate <
          currentWeekStart
        ) {
          continue;
        }
      }

      items.push({
        statusId:
          statusDoc.id,
        assignmentId:
          assignmentSnapshot.id,
        title:
          assignmentData.title,
        subject:
          assignmentData.subject,
        description:
          assignmentData.description ||
          "",
        showDate:
          assignmentData.showDate,
        dueDate:
          assignmentData.dueDate,
        status,
        feedback:
          statusData.feedback ||
          "",
      });
    }

    items.sort((a, b) => {
      const aOverdue =
        a.status === "todo" &&
        a.dueDate < today;

      const bOverdue =
        b.status === "todo" &&
        b.dueDate < today;

      if (aOverdue && !bOverdue) {
        return -1;
      }

      if (!aOverdue && bOverdue) {
        return 1;
      }

      const statusOrder = {
        todo: 0,
        turnedIn: 1,
        verified: 2,
        excused: 3,
      } as const;

      const statusDifference =
        statusOrder[a.status] -
        statusOrder[b.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return a.dueDate.localeCompare(
        b.dueDate
      );
    });

    setSchoolwork(items);
  }

  async function loadWeeklyGoal(
    currentStudentId: string,
    classId: string
  ) {
    const weekStart =
      getWeekStartString();

    const goalQuery = query(
      collection(
        db,
        "weeklyGoals"
      ),
      where(
        "studentId",
        "==",
        currentStudentId
      ),
      where(
        "weekStart",
        "==",
        weekStart
      )
    );

    const snapshot =
      await getDocs(goalQuery);

    if (snapshot.empty) {
      setWeeklyGoal(null);
      return;
    }

    const goalDoc =
      snapshot.docs[0];

    const data =
      goalDoc.data();

    setWeeklyGoal({
      id: goalDoc.id,
      studentId:
        data.studentId,
      classId:
        data.classId ||
        classId,
      weekStart:
        data.weekStart,
      goalText:
        data.goalText ||
        "",
      target:
        data.target || 1,
      progress:
        data.progress || 0,
      active:
        data.active !==
        false,
    });
  }

  async function loadSupportsAndProgress(
    currentStudentId: string
  ) {
    const supportSnapshot = await getDocs(
      query(
        collection(db, "supports"),
        where("studentId", "==", currentStudentId)
      )
    );

    const loadedSupports: Support[] = supportSnapshot.docs
      .map((supportDoc) => {
        const data = supportDoc.data();

        return {
          id: supportDoc.id,
          studentId: data.studentId,
          name: data.name || "Support",
          type:
            data.type === "weeklyGoal"
              ? "weeklyGoal"
              : "dailyAllowance",
          description: data.description || "",
          target: Number(data.target) || 1,
          reward: data.reward || "",
          studentCanTrack: data.studentCanTrack !== false,
          active: data.active !== false,
        } as Support;
      })
      .filter((support) => support.active)
      .sort((a, b) => a.name.localeCompare(b.name));

    setSupports(loadedSupports);

    const progressSnapshot = await getDocs(
      query(
        collection(db, "supportProgress"),
        where("studentId", "==", currentStudentId)
      )
    );

    const loadedProgress: SupportProgress[] =
      progressSnapshot.docs.map((progressDoc) => {
        const data = progressDoc.data();

        return {
          id: progressDoc.id,
          studentId: data.studentId,
          supportId: data.supportId,
          periodKey: data.periodKey,
          count: Number(data.count) || 0,
        };
      });

    setSupportProgress(loadedProgress);
  }

  function getSupportPeriodKey(support: Support) {
    return support.type === "dailyAllowance"
      ? formatDateForInput(new Date())
      : getWeekStartString();
  }

  function getCurrentSupportProgress(support: Support) {
    const periodKey = getSupportPeriodKey(support);

    return (
      supportProgress.find(
        (progress) =>
          progress.supportId === support.id &&
          progress.periodKey === periodKey
      ) || null
    );
  }

  async function changeSupportProgress(
    support: Support,
    amount: number
  ) {
    if (!student || !support.studentCanTrack) {
      return;
    }

    const current = getCurrentSupportProgress(support);
    const currentCount = current?.count || 0;
    const newCount = Math.max(
      0,
      Math.min(support.target, currentCount + amount)
    );

    if (newCount === currentCount) {
      return;
    }

    try {
      setSupportUpdatingId(support.id);

      if (current) {
        await updateDoc(
          doc(db, "supportProgress", current.id),
          {
            count: newCount,
            updatedAt: serverTimestamp(),
          }
        );

        setSupportProgress((items) =>
          items.map((item) =>
            item.id === current.id
              ? { ...item, count: newCount }
              : item
          )
        );
      } else {
        const periodKey = getSupportPeriodKey(support);

        const progressRef = await addDoc(
          collection(db, "supportProgress"),
          {
            studentId,
            classId: student.classId,
            supportId: support.id,
            supportType: support.type,
            periodKey,
            count: newCount,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );

        setSupportProgress((items) => [
          ...items,
          {
            id: progressRef.id,
            studentId,
            supportId: support.id,
            periodKey,
            count: newCount,
          },
        ]);
      }
    } catch (error) {
      console.error(error);
      setMessage("HawkTrack couldn't update that tracker.");
    } finally {
      setSupportUpdatingId(null);
    }
  }

  async function createWeeklyGoal() {
    setMessage("");

    if (!student) {
      return;
    }

    if (!goalText.trim()) {
      setMessage(
        "Type your goal first."
      );
      return;
    }

    if (
      goalTarget < 1 ||
      goalTarget > 10
    ) {
      setMessage(
        "Choose a target from 1 to 10."
      );
      return;
    }

    try {
      setGoalSaving(true);

      const weekStart =
        getWeekStartString();

      const goalRef =
        await addDoc(
          collection(
            db,
            "weeklyGoals"
          ),
          {
            studentId,
            classId:
              student.classId,
            weekStart,
            goalText:
              goalText.trim(),
            target:
              goalTarget,
            progress: 0,
            active: true,
            createdAt:
              serverTimestamp(),
          }
        );

      setWeeklyGoal({
        id: goalRef.id,
        studentId,
        classId:
          student.classId,
        weekStart,
        goalText:
          goalText.trim(),
        target:
          goalTarget,
        progress: 0,
        active: true,
      });

      setGoalText("");
      setGoalTarget(5);
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't save your goal."
      );
    } finally {
      setGoalSaving(false);
    }
  }

  async function changeGoalProgress(
    amount: number
  ) {
    if (!weeklyGoal) {
      return;
    }

    const newProgress =
      Math.max(
        0,
        Math.min(
          weeklyGoal.target,
          weeklyGoal.progress +
            amount
        )
      );

    if (
      newProgress ===
      weeklyGoal.progress
    ) {
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          "weeklyGoals",
          weeklyGoal.id
        ),
        {
          progress:
            newProgress,
        }
      );

      setWeeklyGoal({
        ...weeklyGoal,
        progress:
          newProgress,
      });
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't update your goal."
      );
    }
  }

  async function markTurnedIn(
    item: SchoolworkItem
  ) {
    try {
      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          item.statusId
        ),
        {
          status:
            "turnedIn",
          feedback: "",
        }
      );

      setSchoolwork(
        (current) =>
          current.map(
            (assignment) =>
              assignment.statusId ===
              item.statusId
                ? {
                    ...assignment,
                    status:
                      "turnedIn",
                    feedback: "",
                  }
                : assignment
          )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't update that assignment."
      );
    }
  }

  async function undoTurnedIn(
    item: SchoolworkItem
  ) {
    try {
      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          item.statusId
        ),
        {
          status: "todo",
        }
      );

      setSchoolwork(
        (current) =>
          current.map(
            (assignment) =>
              assignment.statusId ===
              item.statusId
                ? {
                    ...assignment,
                    status:
                      "todo",
                  }
                : assignment
          )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't update that assignment."
      );
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  const completion =
    useMemo(() => {
      const countable =
        schoolwork.filter(
          (item) =>
            item.status !==
            "excused"
        );

      if (
        countable.length === 0
      ) {
        return 100;
      }

      const completed =
        countable.filter(
          (item) =>
            item.status ===
            "verified"
        ).length;

      return Math.round(
        (completed /
          countable.length) *
          100
      );
    }, [schoolwork]);

  function isOverdue(
    item: SchoolworkItem
  ) {
    if (
      item.status !== "todo"
    ) {
      return false;
    }

    const today =
      formatDateForInput(
        new Date()
      );

    return (
      item.dueDate < today
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">
        <p className="text-xl font-bold text-blue-900">
          Loading HawkTrack...
        </p>
      </main>
    );
  }

  if (!student) {
    return null;
  }

  const goalPercent =
    weeklyGoal
      ? Math.round(
          (weeklyGoal.progress /
            weeklyGoal.target) *
            100
        )
      : 0;

  const goalComplete =
    weeklyGoal &&
    weeklyGoal.progress >=
      weeklyGoal.target;

  return (
    <main className="min-h-screen bg-blue-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl md:text-4xl font-bold text-blue-900">
                Hi,{" "}
                {student.displayName}!
              </h1>

              <p className="text-gray-600 mt-2">
                Let&apos;s see what you&apos;ve got today.
              </p>
            </div>

            <button
              onClick={
                handleLogout
              }
              className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold"
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

        <section className="bg-white rounded-3xl border border-blue-100 p-6 mb-6">

          <div className="flex items-center justify-between gap-4 mb-5">

            <div>
              <h2 className="text-2xl font-bold text-blue-900">
                My Schoolwork
              </h2>

              <p className="text-gray-600 mt-1">
                This week&apos;s work plus anything you still owe.
              </p>
            </div>

            <div className="bg-yellow-100 text-yellow-900 rounded-full px-4 py-2 font-bold text-lg">
              {completion}%
            </div>

          </div>

          {schoolwork.length ===
          0 ? (
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-8 text-center">

              <p className="text-xl font-semibold text-blue-900">
                You&apos;re all caught up! 🎉
              </p>

              <p className="text-gray-500 mt-2">
                No schoolwork is showing right now.
              </p>

            </div>
          ) : (
            <div className="space-y-4">

              {schoolwork.map(
                (item) => {
                  const overdue =
                    isOverdue(
                      item
                    );

                  return (
                    <div
                      key={
                        item.statusId
                      }
                      className={`rounded-2xl border-2 p-5 ${
                        item.status ===
                        "verified"
                          ? "bg-green-50 border-green-300"
                          : item.status ===
                            "turnedIn"
                          ? "bg-yellow-50 border-yellow-300"
                          : item.status ===
                            "excused"
                          ? "bg-gray-100 border-gray-300"
                          : overdue
                          ? "bg-red-50 border-red-300"
                          : "bg-white border-blue-200"
                      }`}
                    >

                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                        <div>
                          <div className="flex flex-wrap items-center gap-2">

                            <span className="text-sm font-bold uppercase text-blue-700">
                              {
                                item.subject
                              }
                            </span>

                            {overdue && (
                              <span className="bg-red-600 text-white text-xs font-bold rounded-full px-3 py-1">
                                OVERDUE
                              </span>
                            )}

                          </div>

                          <h3 className="text-xl font-bold text-blue-950 mt-1">
                            {
                              item.title
                            }
                          </h3>

                          {item.description && (
                            <p className="text-gray-600 mt-2">
                              {
                                item.description
                              }
                            </p>
                          )}

                          <p className="text-sm text-gray-500 mt-3">
                            Due:{" "}
                            {item.dueDate}
                          </p>

                          {item.feedback && (
                            <div className="mt-4 bg-red-100 border border-red-200 rounded-xl p-3">

                              <p className="font-bold text-red-800">
                                Please fix:
                              </p>

                              <p className="text-red-700">
                                {
                                  item.feedback
                                }
                              </p>

                            </div>
                          )}

                        </div>

                        <div className="shrink-0">

                          {item.status ===
                            "todo" && (
                            <button
                              onClick={() =>
                                markTurnedIn(
                                  item
                                )
                              }
                              className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold"
                            >
                              I Turned This In
                            </button>
                          )}

                          {item.status ===
                            "turnedIn" && (
                            <div className="text-center">

                              <p className="font-bold text-yellow-800">
                                ⏳ Waiting for a Checker
                              </p>

                              <button
                                onClick={() =>
                                  undoTurnedIn(
                                    item
                                  )
                                }
                                className="mt-2 text-sm underline text-gray-600"
                              >
                                Undo
                              </button>

                            </div>
                          )}

                          {item.status ===
                            "verified" && (
                            <p className="font-bold text-green-700 text-lg">
                              ✓ Verified
                            </p>
                          )}

                          {item.status ===
                            "excused" && (
                            <p className="font-bold text-gray-600">
                              Excused
                            </p>
                          )}

                        </div>
                      </div>
                    </div>
                  );
                }
              )}

            </div>
          )}

        </section>

        {student.weeklyGoalsEnabled && (
          <section className="bg-white rounded-3xl border border-yellow-200 p-6 mb-6">

            <h2 className="text-2xl font-bold text-blue-900">
              My Weekly Goal
            </h2>

            <p className="text-gray-600 mt-1 mb-5">
              Pick something you want to work on this week and track your progress.
            </p>

            {!weeklyGoal ? (
              <div className="bg-yellow-50 rounded-2xl p-5">

                <label className="block font-bold text-blue-900 mb-2">
                  My Goal
                </label>

                <input
                  value={goalText}
                  onChange={(e) =>
                    setGoalText(
                      e.target.value
                    )
                  }
                  placeholder="Example: Bring my planner every day"
                  className="w-full border-2 border-yellow-200 bg-white rounded-xl p-3 text-black"
                />

                <label className="block font-bold text-blue-900 mt-5 mb-2">
                  How many times do you want to do it?
                </label>

                <select
                  value={goalTarget}
                  onChange={(e) =>
                    setGoalTarget(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-full border-2 border-yellow-200 bg-white rounded-xl p-3 text-black"
                >
                  {Array.from({
                    length: 10,
                  }).map(
                    (_, index) => {
                      const value =
                        index + 1;

                      return (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {value} time
                          {value ===
                          1
                            ? ""
                            : "s"}
                        </option>
                      );
                    }
                  )}
                </select>

                <button
                  onClick={
                    createWeeklyGoal
                  }
                  disabled={
                    goalSaving
                  }
                  className="mt-5 bg-yellow-400 text-blue-950 rounded-xl px-6 py-3 font-bold disabled:opacity-50"
                >
                  {goalSaving
                    ? "Saving..."
                    : "Start My Goal"}
                </button>

              </div>
            ) : (
              <div
                className={`rounded-2xl p-5 border-2 ${
                  goalComplete
                    ? "bg-green-50 border-green-300"
                    : "bg-yellow-50 border-yellow-200"
                }`}
              >

                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

                  <div>
                    <p className="text-sm font-bold uppercase text-yellow-800">
                      This Week
                    </p>

                    <h3 className="text-xl font-bold text-blue-950 mt-1">
                      {
                        weeklyGoal.goalText
                      }
                    </h3>

                    <p className="text-gray-600 mt-2">
                      {
                        weeklyGoal.progress
                      }{" "}
                      of{" "}
                      {
                        weeklyGoal.target
                      }{" "}
                      complete
                    </p>
                  </div>

                  <div className="bg-white rounded-full px-4 py-2 font-bold text-blue-900">
                    {goalPercent}%
                  </div>

                </div>

                <div className="mt-5 h-4 bg-white rounded-full overflow-hidden border border-yellow-200">

                  <div
                    className="h-full bg-yellow-400"
                    style={{
                      width: `${goalPercent}%`,
                    }}
                  />

                </div>

                <div className="flex flex-wrap gap-3 mt-5">

                  <button
                    onClick={() =>
                      changeGoalProgress(
                        1
                      )
                    }
                    disabled={
                      weeklyGoal.progress >=
                      weeklyGoal.target
                    }
                    className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-40"
                  >
                    + I Did It
                  </button>

                  <button
                    onClick={() =>
                      changeGoalProgress(
                        -1
                      )
                    }
                    disabled={
                      weeklyGoal.progress <=
                      0
                    }
                    className="bg-white border-2 border-blue-200 text-blue-900 rounded-xl px-5 py-3 font-bold disabled:opacity-40"
                  >
                    Undo One
                  </button>

                </div>

                {goalComplete && (
                  <div className="mt-5 bg-green-100 rounded-xl p-4 text-green-800 font-bold text-center">
                    🎉 Goal complete! Way to go, Hawk!
                  </div>
                )}

              </div>
            )}

          </section>
        )}

        <section className="bg-white rounded-3xl border border-amber-200 p-6">

          <h2 className="text-2xl font-bold text-blue-900">
            My Supports & Rewards
          </h2>

          <p className="text-gray-600 mt-1 mb-5">
            Track the supports and rewards Ms. Flory has set up for you.
          </p>

          {supports.length === 0 ? (
            <div className="bg-amber-50 rounded-2xl p-5 text-center">
              <p className="font-semibold text-amber-900">
                Nothing to track right now.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {supports.map((support) => {
                const progress = getCurrentSupportProgress(support);
                const count = progress?.count || 0;
                const complete = count >= support.target;
                const remaining = Math.max(0, support.target - count);
                const percent = Math.min(
                  100,
                  Math.round((count / support.target) * 100)
                );

                if (support.type === "dailyAllowance") {
                  return (
                    <div
                      key={support.id}
                      className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                            Daily Support
                          </p>

                          <h3 className="text-xl font-bold text-blue-950 mt-1">
                            {support.name}
                          </h3>

                          {support.description && (
                            <p className="text-gray-600 mt-2">
                              {support.description}
                            </p>
                          )}
                        </div>

                        <div className="bg-white rounded-2xl px-4 py-3 text-center border border-amber-200">
                          <p className="text-2xl font-bold text-blue-900">
                            {remaining}
                          </p>
                          <p className="text-xs font-semibold text-gray-500">
                            of {support.target} left today
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 font-semibold text-gray-700">
                        {count} used today
                      </p>

                      {support.studentCanTrack ? (
                        <div className="flex flex-wrap gap-3 mt-4">
                          <button
                            onClick={() =>
                              changeSupportProgress(support, 1)
                            }
                            disabled={
                              remaining === 0 ||
                              supportUpdatingId === support.id
                            }
                            className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-40"
                          >
                            {supportUpdatingId === support.id
                              ? "Saving..."
                              : "Use One"}
                          </button>

                          <button
                            onClick={() =>
                              changeSupportProgress(support, -1)
                            }
                            disabled={
                              count === 0 ||
                              supportUpdatingId === support.id
                            }
                            className="bg-white border-2 border-amber-300 text-blue-900 rounded-xl px-5 py-3 font-bold disabled:opacity-40"
                          >
                            Undo One
                          </button>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm font-semibold text-gray-500">
                          Ms. Flory is tracking this one for you.
                        </p>
                      )}

                      {remaining === 0 && (
                        <div className="mt-4 bg-white border border-amber-300 rounded-xl p-3 text-amber-800 font-bold text-center">
                          You&apos;ve used all {support.target} for today.
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={support.id}
                    className={`border-2 rounded-2xl p-5 ${
                      complete
                        ? "bg-green-50 border-green-300"
                        : "bg-amber-50 border-amber-200"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                          Weekly Reward Goal
                        </p>

                        <h3 className="text-xl font-bold text-blue-950 mt-1">
                          {support.name}
                        </h3>

                        {support.description && (
                          <p className="text-gray-600 mt-2">
                            {support.description}
                          </p>
                        )}

                        {support.reward && (
                          <div className="mt-3 bg-white rounded-xl p-3 border border-amber-200">
                            <p className="text-xs font-bold uppercase text-amber-700">
                              Reward
                            </p>
                            <p className="font-semibold text-blue-950 mt-1">
                              {support.reward}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="bg-white rounded-full px-4 py-2 font-bold text-blue-900">
                        {count} / {support.target}
                      </div>
                    </div>

                    <div className="mt-5 h-4 bg-white rounded-full overflow-hidden border border-amber-200">
                      <div
                        className={
                          complete
                            ? "h-full bg-green-500"
                            : "h-full bg-yellow-400"
                        }
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {support.studentCanTrack ? (
                      <div className="flex flex-wrap gap-3 mt-4">
                        <button
                          onClick={() =>
                            changeSupportProgress(support, 1)
                          }
                          disabled={
                            complete ||
                            supportUpdatingId === support.id
                          }
                          className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-40"
                        >
                          {supportUpdatingId === support.id
                            ? "Saving..."
                            : "+ I Did It"}
                        </button>

                        <button
                          onClick={() =>
                            changeSupportProgress(support, -1)
                          }
                          disabled={
                            count === 0 ||
                            supportUpdatingId === support.id
                          }
                          className="bg-white border-2 border-amber-300 text-blue-900 rounded-xl px-5 py-3 font-bold disabled:opacity-40"
                        >
                          Undo One
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm font-semibold text-gray-500">
                        Ms. Flory is tracking this one for you.
                      </p>
                    )}

                    {complete && (
                      <div className="mt-5 bg-green-100 rounded-xl p-4 text-green-800 font-bold text-center">
                        🎉 You reached your goal this week!
                        {support.reward
                          ? ` Reward: ${support.reward}`
                          : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </section>

      </div>
    </main>
  );
}

function getStatusCompletedDate(
  statusData: {
    verifiedAt?: { toDate?: () => Date } | null;
    excusedAt?: { toDate?: () => Date } | null;
    updatedAt?: { toDate?: () => Date } | null;
  },
  fallbackDate: string
) {
  const timestamp =
    statusData.verifiedAt ||
    statusData.excusedAt ||
    statusData.updatedAt ||
    null;

  if (
    timestamp &&
    typeof timestamp.toDate ===
      "function"
  ) {
    return formatDateForInput(
      timestamp.toDate()
    );
  }

  return fallbackDate;
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

function getWeekStartString() {
  const today = new Date();

  today.setHours(
    12,
    0,
    0,
    0
  );

  const day =
    today.getDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  today.setDate(
    today.getDate() +
      difference
  );

  return formatDateForInput(
    today
  );
}