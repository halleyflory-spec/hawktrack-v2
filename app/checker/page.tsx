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

type Assignment = {
  id: string;
  title: string;
  subject: string;
  description: string;
  showDate: string;
  dueDate: string;
};

type StudentStatus = {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  status: "todo" | "turnedIn" | "verified" | "excused";
  feedback: string;
};

type AssignmentWithStatuses = Assignment & {
  statuses: StudentStatus[];
};

export default function CheckerPage() {
  const router = useRouter();

  const [assignments, setAssignments] =
    useState<AssignmentWithStatuses[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedAssignmentId, setSelectedAssignmentId] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  // Which student's inline "Send Back" editor is currently open
  const [sendBackForId, setSendBackForId] =
    useState<string | null>(null);

  // Feedback is stored per status so opening/closing one card
  // never loses another student's text.
  const [feedbackById, setFeedbackById] =
    useState<Record<string, string>>({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.push("/checker/login");
          return;
        }

        try {
          const checkerSnapshot = await getDoc(
            doc(
              db,
              "checkers",
              user.uid
            )
          );

          if (
            !checkerSnapshot.exists() ||
            checkerSnapshot.data().active !== true ||
            checkerSnapshot.data().role !== "checker"
          ) {
            await signOut(auth);

            router.push(
              "/checker/login"
            );

            return;
          }

          await loadAssignments();
        } catch (error) {
          console.error(
            "CHECKER LOAD ERROR:",
            error
          );

          setMessage(
            "HawkTrack couldn't load the checker."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () =>
      unsubscribe();
  }, [router]);

  async function loadAssignments() {
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

    const studentSnapshot =
      await getDocs(
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

    const studentNames: Record<
      string,
      string
    > = {};

    studentSnapshot.docs.forEach(
      (studentDoc) => {
        const data =
          studentDoc.data();

        if (
          data.active !== false
        ) {
          studentNames[
            studentDoc.id
          ] =
            data.displayName ||
            "Student";
        }
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
          )
        )
      );

    const allStatuses: StudentStatus[] =
      statusSnapshot.docs.map(
        (statusDoc) => {
          const data =
            statusDoc.data();

          return {
            id:
              statusDoc.id,

            studentId:
              data.studentId,

            studentName:
              studentNames[
                data.studentId
              ] ||
              "Unknown Student",

            assignmentId:
              data.assignmentId,

            status:
              data.status ||
              "todo",

            feedback:
              data.feedback ||
              "",
          };
        }
      );

    const loadedAssignments: AssignmentWithStatuses[] =
      assignmentSnapshot.docs
        .map(
          (assignmentDoc) => {
            const data =
              assignmentDoc.data();

            return {
              id:
                assignmentDoc.id,

              title:
                data.title ||
                "Assignment",

              subject:
                data.subject ||
                "",

              description:
                data.description ||
                "",

              showDate:
                data.showDate ||
                "",

              dueDate:
                data.dueDate ||
                "",

              archived:
                data.archived ===
                true,
            };
          }
        )
        .filter(
          (assignment) =>
            !assignment.archived
        )
        .map(
          (assignment) => ({
            id:
              assignment.id,

            title:
              assignment.title,

            subject:
              assignment.subject,

            description:
              assignment.description,

            showDate:
              assignment.showDate,

            dueDate:
              assignment.dueDate,

            statuses:
              allStatuses
                .filter(
                  (status) =>
                    status.assignmentId ===
                    assignment.id
                )
                .sort(
                  (a, b) =>
                    a.studentName.localeCompare(
                      b.studentName
                    )
                ),
          })
        )
        .filter(
          (assignment) =>
            assignment.statuses.length >
            0
        );

    loadedAssignments.sort(
      (a, b) =>
        b.showDate.localeCompare(
          a.showDate
        )
    );

    setAssignments(
      loadedAssignments
    );

    const initialFeedback: Record<
      string,
      string
    > = {};

    allStatuses.forEach(
      (status) => {
        initialFeedback[
          status.id
        ] =
          status.feedback ||
          "";
      }
    );

    setFeedbackById(
      initialFeedback
    );
  }

  async function verifyStudent(
    status: StudentStatus
  ) {
    try {
      const user =
        auth.currentUser;

      if (!user) {
        setMessage(
          "Your checker login expired. Please log in again."
        );
        return;
      }

      setWorkingId(
        status.id
      );

      setMessage("");

      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          status.id
        ),
        {
          status:
            "verified",

          feedback:
            "",

          verifiedBy:
            user.uid,

          verifiedAt:
            serverTimestamp(),

          returnedBy:
            "",

          returnedAt:
            null,
        }
      );

      updateLocalStatus(
        status.id,
        "verified",
        ""
      );

      setSendBackForId(
        null
      );

      setMessage(
        `${status.studentName}'s work was verified.`
      );
    } catch (error) {
      console.error(
        "VERIFY ERROR:",
        error
      );

      setMessage(
        "HawkTrack couldn't verify that assignment."
      );
    } finally {
      setWorkingId(
        null
      );
    }
  }

  function openSendBack(
    status: StudentStatus
  ) {
    setMessage("");

    setFeedbackById(
      (current) => ({
        ...current,

        [status.id]:
          current[
            status.id
          ] ??
          status.feedback ??
          "",
      })
    );

    setSendBackForId(
      (current) =>
        current === status.id
          ? null
          : status.id
    );
  }

  function cancelSendBack(
    status: StudentStatus
  ) {
    setSendBackForId(
      null
    );

    setFeedbackById(
      (current) => ({
        ...current,

        [status.id]:
          status.feedback ||
          "",
      })
    );

    setMessage("");
  }

  async function sendBackToStudent(
    status: StudentStatus
  ) {
    const feedback =
      feedbackById[
        status.id
      ]?.trim() ||
      "";

    if (!feedback) {
      setMessage(
        `Enter a reason before sending ${status.studentName}'s work back.`
      );

      return;
    }

    try {
      const user =
        auth.currentUser;

      if (!user) {
        setMessage(
          "Your checker login expired. Please log in again."
        );
        return;
      }

      setWorkingId(
        status.id
      );

      setMessage(
        `Sending ${status.studentName}'s work back...`
      );

      await updateDoc(
        doc(
          db,
          "studentAssignmentStatus",
          status.id
        ),
        {
          status:
            "todo",

          feedback,

          verifiedBy:
            "",

          verifiedAt:
            null,

          returnedBy:
            user.uid,

          returnedAt:
            serverTimestamp(),
        }
      );

      updateLocalStatus(
        status.id,
        "todo",
        feedback
      );

      setSendBackForId(
        null
      );

      setMessage(
        `${status.studentName}'s work was sent back to them.`
      );
    } catch (error) {
      console.error(
        "SEND BACK ERROR:",
        error
      );

      setMessage(
        "HawkTrack couldn't send that work back."
      );
    } finally {
      setWorkingId(
        null
      );
    }
  }

  function updateLocalStatus(
    statusId: string,
    newStatus:
      | "todo"
      | "turnedIn"
      | "verified"
      | "excused",
    feedback: string
  ) {
    setAssignments(
      (current) =>
        current.map(
          (assignment) => ({
            ...assignment,

            statuses:
              assignment.statuses.map(
                (status) =>
                  status.id ===
                  statusId
                    ? {
                        ...status,
                        status:
                          newStatus,
                        feedback,
                      }
                    : status
              ),
          })
        )
    );

    setFeedbackById(
      (current) => ({
        ...current,
        [statusId]:
          feedback,
      })
    );
  }

  function openAssignment(
    assignmentId: string
  ) {
    setSelectedAssignmentId(
      assignmentId
    );

    setSendBackForId(
      null
    );

    setMessage("");
  }

  function goBackToAssignments() {
    setSelectedAssignmentId(
      null
    );

    setSendBackForId(
      null
    );

    setWorkingId(
      null
    );

    setMessage("");
  }

  async function handleLogout() {
    await signOut(
      auth
    );

    router.push(
      "/checker/login"
    );
  }

  const selectedAssignment =
    useMemo(
      () =>
        assignments.find(
          (assignment) =>
            assignment.id ===
            selectedAssignmentId
        ) ||
        null,
      [
        assignments,
        selectedAssignmentId,
      ]
    );

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

      <div className="max-w-5xl mx-auto">

        {/* HEADER */}
        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">

            <div>

              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl font-bold text-blue-900">
                Checker
              </h1>

              <p className="text-gray-600 mt-1">
                Check work by
                assignment.
              </p>

            </div>

            <button
              type="button"
              onClick={
                handleLogout
              }
              className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold"
            >
              Log Out
            </button>

          </div>

        </header>

        {/* MESSAGE */}
        {message && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-6 text-blue-950 font-semibold">

            {
              message
            }

          </div>
        )}

        {!selectedAssignment ? (
          /* ================================================= */
          /* ASSIGNMENT LIST                                   */
          /* ================================================= */

          <section>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">

              <div>

                <h2 className="text-2xl font-bold text-blue-900">
                  Assignments
                </h2>

                <p className="text-gray-600 mt-1">
                  Choose an assignment
                  to check student
                  progress.
                </p>

              </div>

              <div className="bg-blue-100 text-blue-900 rounded-xl px-4 py-2 font-bold">

                {
                  assignments.length
                }{" "}
                assignment
                {
                  assignments.length ===
                  1
                    ? ""
                    : "s"
                }

              </div>

            </div>

            {assignments.length ===
            0 ? (
              <div className="bg-white border-2 border-dashed border-blue-200 rounded-3xl p-10 text-center">

                <p className="text-4xl">
                  ✅
                </p>

                <h3 className="text-xl font-bold text-blue-900 mt-3">
                  Nothing to check
                  yet
                </h3>

                <p className="text-gray-500 mt-2">
                  Assignments will
                  appear here when
                  students have
                  statuses connected
                  to them.
                </p>

              </div>
            ) : (
              <div className="space-y-4">

                {assignments.map(
                  (assignment) => {
                    const verified =
                      assignment.statuses.filter(
                        (status) =>
                          status.status ===
                            "verified" ||
                          status.status ===
                            "excused"
                      ).length;

                    const waiting =
                      assignment.statuses.filter(
                        (status) =>
                          status.status ===
                          "turnedIn"
                      ).length;

                    return (
                      <button
                        type="button"
                        key={
                          assignment.id
                        }
                        onClick={() =>
                          openAssignment(
                            assignment.id
                          )
                        }
                        className="w-full text-left bg-white rounded-2xl border-2 border-blue-200 p-5 hover:border-blue-400 hover:shadow-sm transition"
                      >

                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                          <div>

                            <p className="text-sm font-bold uppercase text-blue-700">
                              {
                                assignment.subject
                              }
                            </p>

                            <h3 className="text-xl font-bold text-blue-950">
                              {
                                assignment.title
                              }
                            </h3>

                            <p className="text-gray-500 mt-1">
                              {
                                verified
                              }{" "}
                              of{" "}
                              {
                                assignment
                                  .statuses
                                  .length
                              }{" "}
                              verified
                            </p>

                          </div>

                          <div className="flex gap-2 flex-wrap">

                            {waiting >
                              0 && (
                              <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-2 font-bold">

                                {
                                  waiting
                                }{" "}
                                waiting

                              </span>
                            )}

                            <span className="bg-blue-900 text-white rounded-xl px-4 py-2 font-bold">
                              Open Assignment
                            </span>

                          </div>

                        </div>

                      </button>
                    );
                  }
                )}

              </div>
            )}

          </section>
        ) : (
          /* ================================================= */
          /* SELECTED ASSIGNMENT                               */
          /* ================================================= */

          <section>

            <button
              type="button"
              onClick={
                goBackToAssignments
              }
              className="mb-5 bg-white border-2 border-blue-200 text-blue-900 rounded-xl px-5 py-3 font-bold hover:bg-blue-50"
            >
              ← Back to Assignments
            </button>

            <div className="bg-white rounded-3xl border border-blue-200 p-6 mb-6">

              <p className="text-sm font-bold uppercase text-blue-700">
                {
                  selectedAssignment.subject
                }
              </p>

              <h2 className="text-3xl font-bold text-blue-950">
                {
                  selectedAssignment.title
                }
              </h2>

              {selectedAssignment.description && (
                <p className="text-gray-600 mt-2">
                  {
                    selectedAssignment.description
                  }
                </p>
              )}

            </div>

            <div className="space-y-3">

              {selectedAssignment.statuses.map(
                (status) => {
                  const isWorking =
                    workingId ===
                    status.id;

                  const isSendBackOpen =
                    sendBackForId ===
                    status.id;

                  return (
                    <div
                      key={
                        status.id
                      }
                      className={`rounded-2xl border-2 p-4 ${
                        status.status ===
                        "verified"
                          ? "bg-green-50 border-green-300"
                          : status.status ===
                            "turnedIn"
                          ? "bg-yellow-50 border-yellow-300"
                          : status.status ===
                            "excused"
                          ? "bg-gray-100 border-gray-300"
                          : "bg-white border-blue-200"
                      }`}
                    >

                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                        <div>

                          <p className="text-xl font-bold text-blue-950">
                            {
                              status.studentName
                            }
                          </p>

                          {status.status ===
                            "turnedIn" && (
                            <p className="text-sm font-bold text-yellow-700 mt-1">
                              Student marked
                              this turned in
                            </p>
                          )}

                          {status.status ===
                            "verified" && (
                            <p className="text-sm font-bold text-green-700 mt-1">
                              ✓ Verified
                            </p>
                          )}

                          {status.status ===
                            "todo" && (
                            <p className="text-sm font-bold text-blue-700 mt-1">
                              To Do
                            </p>
                          )}

                          {status.status ===
                            "excused" && (
                            <p className="text-sm font-bold text-gray-600 mt-1">
                              Excused
                            </p>
                          )}

                          {status.feedback && (
                            <p className="text-sm text-red-700 mt-2">
                              Previous note:{" "}
                              {
                                status.feedback
                              }
                            </p>
                          )}

                        </div>

                        <div className="flex flex-wrap gap-2">

                          {status.status !==
                            "verified" &&
                            status.status !==
                              "excused" && (
                              <>

                                <button
                                  type="button"
                                  onClick={() =>
                                    verifyStudent(
                                      status
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
                                    openSendBack(
                                      status
                                    )
                                  }
                                  disabled={
                                    isWorking
                                  }
                                  className={`rounded-xl px-5 py-3 font-bold border-2 disabled:opacity-50 ${
                                    isSendBackOpen
                                      ? "bg-red-100 border-red-400 text-red-800"
                                      : "bg-white border-red-300 text-red-700"
                                  }`}
                                >
                                  {isSendBackOpen
                                    ? "Close Send Back"
                                    : "↩ Send Back"}
                                </button>

                              </>
                            )}

                        </div>

                      </div>

                      {/* INLINE SEND-BACK FORM */}
                      {isSendBackOpen && (
                        <div className="mt-4 pt-4 border-t-2 border-red-200">

                          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">

                            <h3 className="text-lg font-bold text-red-800">
                              Send Back to{" "}
                              {
                                status.studentName
                              }
                            </h3>

                            <p className="text-gray-600 mt-1">
                              Tell the student
                              what needs to be
                              fixed before they
                              turn it in again.
                            </p>

                            <textarea
                              value={
                                feedbackById[
                                  status.id
                                ] ||
                                ""
                              }
                              onChange={(e) =>
                                setFeedbackById(
                                  (
                                    current
                                  ) => ({
                                    ...current,

                                    [status.id]:
                                      e.target
                                        .value,
                                  })
                                )
                              }
                              placeholder="Example: Please finish questions 5–8 and turn it back in."
                              className="w-full border-2 border-red-200 rounded-xl p-3 mt-4 text-black min-h-28 bg-white"
                            />

                            <div className="flex flex-wrap gap-3 mt-4">

                              <button
                                type="button"
                                onClick={() =>
                                  sendBackToStudent(
                                    status
                                  )
                                }
                                disabled={
                                  isWorking
                                }
                                className="bg-red-600 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                              >
                                {isWorking
                                  ? "Sending..."
                                  : "Send Back to Student"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  cancelSendBack(
                                    status
                                  )
                                }
                                disabled={
                                  isWorking
                                }
                                className="bg-white border-2 border-gray-300 rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                              >
                                Cancel
                              </button>

                            </div>

                          </div>

                        </div>
                      )}

                    </div>
                  );
                }
              )}

            </div>

          </section>
        )}

      </div>

    </main>
  );
}