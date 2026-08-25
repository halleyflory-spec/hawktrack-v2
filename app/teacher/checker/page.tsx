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
  serverTimestamp,
  updateDoc,
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
  dueDate: string;
  showDate: string;
};

type WaitingItem = {
  statusId: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  subject: string;
  dueDate: string;
  showDate: string;
  feedback: string;
};

export default function TeacherCheckerPage() {
  const router = useRouter();

  const [items, setItems] =
    useState<WaitingItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [feedbackById, setFeedbackById] =
    useState<Record<string, string>>({});

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  const [itemMessageById, setItemMessageById] =
    useState<Record<string, string>>({});

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
            doc(
              db,
              "teachers",
              user.uid
            )
          );

          if (
            !teacherSnapshot.exists() ||
            teacherSnapshot.data().active !== true ||
            teacherSnapshot.data().role !== "teacher"
          ) {
            await signOut(auth);

            router.push(
              "/teacher/login"
            );

            return;
          }

          await loadWaitingItems();
        } catch (error) {
          console.error(error);

          setMessage(
            "HawkTrack couldn't load the checker inbox."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadWaitingItems() {
    try {
      const studentSnapshot = await getDocs(
        query(
          collection(
            db,
            "students"
          ),
          where(
            "classId",
            "==",
            CLASS_ID
          )
        )
      );

      const studentMap: Record<
        string,
        Student
      > = {};

      studentSnapshot.docs.forEach(
        (studentDoc) => {
          const data =
            studentDoc.data();

          studentMap[
            studentDoc.id
          ] = {
            id:
              studentDoc.id,

            displayName:
              data.displayName ||
              "Student",
          };
        }
      );

      const assignmentSnapshot =
        await getDocs(
          query(
            collection(
              db,
              "assignments"
            ),
            where(
              "classId",
              "==",
              CLASS_ID
            )
          )
        );

      const assignmentMap: Record<
        string,
        Assignment
      > = {};

      assignmentSnapshot.docs.forEach(
        (assignmentDoc) => {
          const data =
            assignmentDoc.data();

          assignmentMap[
            assignmentDoc.id
          ] = {
            id:
              assignmentDoc.id,

            title:
              data.title ||
              "Assignment",

            subject:
              data.subject ||
              "",

            dueDate:
              data.dueDate ||
              "",

            showDate:
              data.showDate ||
              "",
          };
        }
      );

      const statusSnapshot =
        await getDocs(
          query(
            collection(
              db,
              "studentAssignmentStatus"
            ),
            where(
              "classId",
              "==",
              CLASS_ID
            ),
            where(
              "status",
              "==",
              "turnedIn"
            )
          )
        );

      const loadedItems: WaitingItem[] =
        statusSnapshot.docs
          .map((statusDoc) => {
            const data =
              statusDoc.data();

            const student =
              studentMap[
                data.studentId
              ];

            const assignment =
              assignmentMap[
                data.assignmentId
              ];

            if (
              !student ||
              !assignment
            ) {
              return null;
            }

            return {
              statusId:
                statusDoc.id,

              studentId:
                student.id,

              studentName:
                student.displayName,

              assignmentId:
                assignment.id,

              assignmentTitle:
                assignment.title,

              subject:
                assignment.subject,

              dueDate:
                assignment.dueDate,

              showDate:
                assignment.showDate,

              feedback:
                data.feedback ||
                "",
            };
          })
          .filter(
            (
              item
            ): item is WaitingItem =>
              item !== null
          )
          .sort((a, b) => {
            const subjectCompare =
              a.subject.localeCompare(
                b.subject
              );

            if (
              subjectCompare !==
              0
            ) {
              return subjectCompare;
            }

            const assignmentCompare =
              a.assignmentTitle.localeCompare(
                b.assignmentTitle
              );

            if (
              assignmentCompare !==
              0
            ) {
              return assignmentCompare;
            }

            return a.studentName.localeCompare(
              b.studentName
            );
          });

      setItems(
        loadedItems
      );

      const initialFeedback: Record<
        string,
        string
      > = {};

      loadedItems.forEach(
        (item) => {
          initialFeedback[
            item.statusId
          ] =
            item.feedback ||
            "";
        }
      );

      setFeedbackById(
        initialFeedback
      );
    } catch (error) {
      console.error(
        "LOAD CHECKER ERROR:",
        error
      );

      throw error;
    }
  }

  async function verifyItem(
    item: WaitingItem
  ) {
    try {
      setWorkingId(
        item.statusId
      );

      setItemMessageById(
        (current) => ({
          ...current,
          [item.statusId]:
            "Verifying...",
        })
      );

      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          item.statusId
        ),
        {
          status:
            "verified",

          feedback:
            "",

          verifiedAt:
            serverTimestamp(),

          verifiedBy:
            auth.currentUser
              ?.uid ||
            "",
        }
      );

      setItems(
        (current) =>
          current.filter(
            (currentItem) =>
              currentItem.statusId !==
              item.statusId
          )
      );

      setMessage(
        `${item.studentName}'s assignment was verified.`
      );
    } catch (error) {
      console.error(
        "VERIFY ERROR:",
        error
      );

      setItemMessageById(
        (current) => ({
          ...current,
          [item.statusId]:
            "HawkTrack couldn't verify this assignment.",
        })
      );
    } finally {
      setWorkingId(
        null
      );
    }
  }

  async function sendBackItem(
    item: WaitingItem
  ) {
    const feedback =
      feedbackById[
        item.statusId
      ]?.trim() ||
      "";

    // CLEAR OLD INLINE MESSAGE
    setItemMessageById(
      (current) => ({
        ...current,
        [item.statusId]:
          "",
      })
    );

    // REQUIRE FEEDBACK
    if (!feedback) {
      setItemMessageById(
        (current) => ({
          ...current,
          [item.statusId]:
            "⚠️ Add feedback explaining what needs to be fixed before sending it back.",
        })
      );

      return;
    }

    try {
      setWorkingId(
        item.statusId
      );

      // SHOW IMMEDIATE VISIBLE RESPONSE
      setItemMessageById(
        (current) => ({
          ...current,
          [item.statusId]:
            `Sending ${item.studentName}'s assignment back...`,
        })
      );

      const statusRef =
        doc(
          db,
          "studentAssignmentStatus",
          item.statusId
        );

      await updateDoc(
        statusRef,
        {
          status:
            "todo",

          feedback,

          verifiedAt:
            null,

          verifiedBy:
            "",

          returnedAt:
            serverTimestamp(),

          returnedBy:
            auth.currentUser
              ?.uid ||
            "",
        }
      );

      // REMOVE FROM CHECKER INBOX
      setItems(
        (current) =>
          current.filter(
            (currentItem) =>
              currentItem.statusId !==
              item.statusId
          )
      );

      // CLEAN FEEDBACK STATE
      setFeedbackById(
        (current) => {
          const copy = {
            ...current,
          };

          delete copy[
            item.statusId
          ];

          return copy;
        }
      );

      setItemMessageById(
        (current) => {
          const copy = {
            ...current,
          };

          delete copy[
            item.statusId
          ];

          return copy;
        }
      );

      setMessage(
        `↩ ${item.studentName}'s assignment was sent back.`
      );
    } catch (error) {
      console.error(
        "SEND BACK ERROR:",
        error
      );

      setItemMessageById(
        (current) => ({
          ...current,

          [item.statusId]:
            "❌ HawkTrack couldn't send this assignment back. Check the browser console for the error.",
        })
      );
    } finally {
      setWorkingId(
        null
      );
    }
  }

  const groupedItems =
    useMemo(() => {
      const groups: Record<
        string,
        WaitingItem[]
      > = {};

      items.forEach(
        (item) => {
          const key =
            `${item.subject}|||${item.assignmentTitle}|||${item.assignmentId}`;

          if (
            !groups[key]
          ) {
            groups[key] =
              [];
          }

          groups[
            key
          ].push(
            item
          );
        }
      );

      return Object.entries(
        groups
      ).map(
        (
          [
            key,
            groupItems,
          ]
        ) => {
          const first =
            groupItems[0];

          return {
            key,

            subject:
              first.subject,

            assignmentTitle:
              first.assignmentTitle,

            assignmentId:
              first.assignmentId,

            dueDate:
              first.dueDate,

            students:
              groupItems,
          };
        }
      );
    }, [items]);

  async function handleLogout() {
    await signOut(
      auth
    );

    router.push(
      "/teacher/login"
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-blue-50 flex items-center justify-center">

        <p className="text-xl font-bold text-blue-900">
          Loading Checker
          Inbox...
        </p>

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
              type="button"
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
              type="button"
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
              type="button"
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              ✅ Checker
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/teacher/behavior"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              ⚡ Behavior
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/teacher/reports"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              📊 Reports
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/teacher/classes"
                )
              }
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              🏫 Classes
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
                Checker Inbox
              </h1>

              <p className="text-gray-600 mt-1">
                Verify work or
                send it back
                with feedback.
              </p>

            </div>

            <div className="flex flex-wrap items-center gap-3">

              <div className="bg-yellow-100 text-yellow-900 rounded-2xl px-5 py-3 font-bold">
                {
                  items.length
                }{" "}
                waiting
              </div>

              <button
                type="button"
                onClick={
                  handleLogout
                }
                className="bg-blue-900 text-white px-5 py-3 rounded-xl font-bold"
              >
                Log Out
              </button>

            </div>

          </div>

        </header>

        {/* SUCCESS / GLOBAL MESSAGE */}
        {message && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 mb-6 text-blue-950 font-semibold">

            {
              message
            }

          </div>
        )}

        {/* EMPTY */}
        {items.length ===
        0 ? (
          <section className="bg-white border-2 border-green-200 rounded-3xl p-10 text-center">

            <p className="text-4xl">
              🎉
            </p>

            <h2 className="text-2xl font-bold text-green-800 mt-3">
              Checker inbox
              is empty!
            </h2>

            <p className="text-gray-600 mt-2">
              There&apos;s
              nothing waiting
              for verification
              right now.
            </p>

          </section>
        ) : (
          <div className="space-y-6">

            {groupedItems.map(
              (group) => (
                <section
                  key={
                    group.key
                  }
                  className="bg-white border-2 border-blue-200 rounded-3xl p-5 md:p-6"
                >

                  {/* ASSIGNMENT */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">

                    <div>

                      <p className="text-xs font-bold uppercase text-blue-700">
                        {
                          group.subject
                        }
                      </p>

                      <h2 className="text-2xl font-bold text-blue-950">
                        {
                          group.assignmentTitle
                        }
                      </h2>

                      <p className="text-sm text-gray-500 mt-1">
                        Due{" "}
                        {formatDateLabel(
                          group.dueDate
                        )}
                      </p>

                    </div>

                    <div className="bg-blue-50 text-blue-900 rounded-full px-4 py-2 font-bold">

                      {
                        group.students
                          .length
                      }{" "}
                      waiting

                    </div>

                  </div>

                  {/* STUDENTS */}
                  <div className="space-y-4">

                    {group.students.map(
                      (item) => {
                        const isWorking =
                          workingId ===
                          item.statusId;

                        const itemMessage =
                          itemMessageById[
                            item.statusId
                          ];

                        return (
                          <div
                            key={
                              item.statusId
                            }
                            className="border-2 border-blue-100 rounded-2xl p-4"
                          >

                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

                              {/* STUDENT */}
                              <div className="min-w-[180px]">

                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/teacher/students/${item.studentId}`
                                    )
                                  }
                                  className="font-bold text-blue-950 text-lg underline hover:text-blue-700"
                                >
                                  {
                                    item.studentName
                                  }
                                </button>

                                <p className="text-sm text-gray-500 mt-1">
                                  Submitted
                                  for checking
                                </p>

                              </div>

                              {/* FEEDBACK */}
                              <div className="flex-1">

                                <label className="block text-sm font-bold text-blue-900 mb-2">
                                  Feedback if
                                  sending back
                                </label>

                                <textarea
                                  value={
                                    feedbackById[
                                      item
                                        .statusId
                                    ] ||
                                    ""
                                  }
                                  onChange={(
                                    e
                                  ) => {
                                    setFeedbackById(
                                      (
                                        current
                                      ) => ({
                                        ...current,

                                        [item.statusId]:
                                          e
                                            .target
                                            .value,
                                      })
                                    );

                                    setItemMessageById(
                                      (
                                        current
                                      ) => ({
                                        ...current,

                                        [item.statusId]:
                                          "",
                                      })
                                    );
                                  }}
                                  placeholder="Example: Finish questions 4–6 and turn it back in."
                                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black min-h-20"
                                />

                                {/* INLINE MESSAGE */}
                                {itemMessage && (
                                  <div
                                    className={`mt-2 rounded-xl p-3 text-sm font-bold ${
                                      itemMessage.includes(
                                        "❌"
                                      ) ||
                                      itemMessage.includes(
                                        "⚠️"
                                      )
                                        ? "bg-red-50 text-red-700 border border-red-200"
                                        : "bg-blue-50 text-blue-800 border border-blue-200"
                                    }`}
                                  >
                                    {
                                      itemMessage
                                    }
                                  </div>
                                )}

                              </div>

                              {/* ACTIONS */}
                              <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:min-w-[160px]">

                                <button
                                  type="button"
                                  onClick={() =>
                                    verifyItem(
                                      item
                                    )
                                  }
                                  disabled={
                                    isWorking
                                  }
                                  className="bg-green-600 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                                >
                                  {isWorking
                                    ? "Working..."
                                    : "✓ Verify"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    sendBackItem(
                                      item
                                    )
                                  }
                                  disabled={
                                    isWorking
                                  }
                                  className="bg-yellow-400 text-blue-950 rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                                >
                                  {isWorking
                                    ? "Sending..."
                                    : "↩ Send Back"}
                                </button>

                              </div>

                            </div>

                          </div>
                        );
                      }
                    )}

                  </div>

                </section>
              )
            )}

          </div>
        )}

      </div>

    </main>
  );
}

function formatDateLabel(
  dateString: string
) {
  if (!dateString) {
    return "—";
  }

  const [
    year,
    month,
    day,
  ] =
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
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",
    }
  );
}