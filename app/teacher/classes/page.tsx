"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type TeacherProfile = {
  id: string;
  displayName: string;
  classIds: string[];
  defaultClassId: string;
};

type ClassRecord = {
  id: string;
  name: string;
  schoolYear: string;
  ownerTeacherId: string;
  teacherIds: string[];
  active: boolean;
  weeklyGoalsEnabled: boolean;
};

type Student = {
  id: string;
  displayName: string;
  studentNumber: string;
  classId: string;
  authUid: string;
  active: boolean;
  weeklyGoalsEnabled: boolean;
};

type StudentForm = {
  displayName: string;
  studentNumber: string;
  classId: string;
  active: boolean;
  weeklyGoalsEnabled: boolean;
};

const EMPTY_STUDENT_FORM: StudentForm = {
  displayName: "",
  studentNumber: "",
  classId: "",
  active: true,
  weeklyGoalsEnabled: true,
};

export default function ClassManagerPage() {
  const router = useRouter();

  const [teacher, setTeacher] =
    useState<TeacherProfile | null>(null);

  const [classes, setClasses] =
    useState<ClassRecord[]>([]);

  const [students, setStudents] =
    useState<Student[]>([]);

  const [selectedClassId, setSelectedClassId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [showCreateClass, setShowCreateClass] =
    useState(false);

  const [newClassName, setNewClassName] =
    useState("");

  const [newSchoolYear, setNewSchoolYear] =
    useState("2026-2027");

  const [showStudentForm, setShowStudentForm] =
    useState(false);

  const [editingStudentId, setEditingStudentId] =
    useState<string | null>(null);

  const [studentForm, setStudentForm] =
    useState<StudentForm>(EMPTY_STUDENT_FORM);

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

          const data = teacherSnapshot.data();

          const loadedTeacher: TeacherProfile = {
            id: teacherSnapshot.id,
            displayName:
              data.displayName || "Teacher",
            classIds: Array.isArray(
              data.classIds
            )
              ? data.classIds
              : data.classId
              ? [data.classId]
              : [],
            defaultClassId:
              data.defaultClassId ||
              data.classId ||
              "",
          };

          setTeacher(loadedTeacher);

          await loadClassesAndStudents(
            loadedTeacher
          );
        } catch (error) {
          console.error(error);

          setMessage(
            "HawkTrack couldn't load class management."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadClassesAndStudents(
    teacherProfile: TeacherProfile
  ) {
    const loadedClasses: ClassRecord[] = [];
    const loadedStudents: Student[] = [];

    for (const classId of teacherProfile.classIds) {
      const classSnapshot = await getDoc(
        doc(db, "classes", classId)
      );

      if (!classSnapshot.exists()) {
        continue;
      }

      const data = classSnapshot.data();

      loadedClasses.push({
        id: classSnapshot.id,
        name:
          data.name ||
          classSnapshot.id,
        schoolYear:
          data.schoolYear || "",
        ownerTeacherId:
          data.ownerTeacherId || "",
        teacherIds: Array.isArray(
          data.teacherIds
        )
          ? data.teacherIds
          : [],
        active:
          data.active !== false,
        weeklyGoalsEnabled:
          data.weeklyGoalsEnabled !== false,
      });

      const studentSnapshot = await getDocs(
        query(
          collection(db, "students"),
          where("classId", "==", classId)
        )
      );

      studentSnapshot.docs.forEach(
        (studentDoc) => {
          const studentData =
            studentDoc.data();

          loadedStudents.push({
            id: studentDoc.id,
            displayName:
              studentData.displayName ||
              "Student",
            studentNumber:
              studentData.studentNumber ||
              "",
            classId:
              studentData.classId || "",
            authUid:
              studentData.authUid || "",
            active:
              studentData.active !== false,
            weeklyGoalsEnabled:
              studentData.weeklyGoalsEnabled !==
              false,
          });
        }
      );
    }

    loadedClasses.sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    loadedStudents.sort((a, b) =>
      a.displayName.localeCompare(
        b.displayName
      )
    );

    setClasses(loadedClasses);
    setStudents(loadedStudents);

    const preferredClass =
      teacherProfile.defaultClassId &&
      teacherProfile.classIds.includes(
        teacherProfile.defaultClassId
      )
        ? teacherProfile.defaultClassId
        : loadedClasses[0]?.id || "";

    setSelectedClassId(
      preferredClass
    );
  }

  const selectedClass = useMemo(
    () =>
      classes.find(
        (classItem) =>
          classItem.id ===
          selectedClassId
      ) || null,
    [classes, selectedClassId]
  );

  const roster = useMemo(
    () =>
      students
        .filter(
          (student) =>
            student.classId ===
            selectedClassId
        )
        .sort((a, b) =>
          a.displayName.localeCompare(
            b.displayName
          )
        ),
    [students, selectedClassId]
  );

  const activeRoster = roster.filter(
    (student) => student.active
  );

  const inactiveRoster = roster.filter(
    (student) => !student.active
  );

  async function selectClass(
    classId: string
  ) {
    setSelectedClassId(classId);

    if (!teacher) {
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          "teachers",
          teacher.id
        ),
        {
          defaultClassId: classId,
        }
      );

      setTeacher((current) =>
        current
          ? {
              ...current,
              defaultClassId:
                classId,
            }
          : current
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't save your default class."
      );
    }
  }

  async function createClass() {
    if (!teacher) {
      return;
    }

    if (!newClassName.trim()) {
      setMessage(
        "Enter a class name."
      );
      return;
    }

    if (!newSchoolYear.trim()) {
      setMessage(
        "Enter a school year."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const baseSlug = slugify(
        newClassName
      );

      const classId =
        `${baseSlug}-${Date.now()}`;

      await setDoc(
        doc(db, "classes", classId),
        {
          name:
            newClassName.trim(),
          schoolYear:
            newSchoolYear.trim(),
          ownerTeacherId:
            teacher.id,
          teacherIds: [
            teacher.id,
          ],
          active: true,
          weeklyGoalsEnabled:
            true,
          createdAt:
            serverTimestamp(),
        }
      );

      await updateDoc(
        doc(
          db,
          "teachers",
          teacher.id
        ),
        {
          classIds:
            arrayUnion(classId),
          defaultClassId:
            classId,
        }
      );

      const newClass: ClassRecord = {
        id: classId,
        name:
          newClassName.trim(),
        schoolYear:
          newSchoolYear.trim(),
        ownerTeacherId:
          teacher.id,
        teacherIds: [
          teacher.id,
        ],
        active: true,
        weeklyGoalsEnabled:
          true,
      };

      setClasses((current) =>
        [...current, newClass].sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        )
      );

      setTeacher((current) =>
        current
          ? {
              ...current,
              classIds: [
                ...current.classIds,
                classId,
              ],
              defaultClassId:
                classId,
            }
          : current
      );

      setSelectedClassId(
        classId
      );

      setNewClassName("");
      setShowCreateClass(false);

      setMessage(
        "New class created."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't create that class."
      );
    } finally {
      setSaving(false);
    }
  }

  function openAddStudent() {
    if (!selectedClassId) {
      setMessage(
        "Choose a class first."
      );
      return;
    }

    setEditingStudentId(null);

    setStudentForm({
      ...EMPTY_STUDENT_FORM,
      classId:
        selectedClassId,
    });

    setShowStudentForm(true);
  }

  function openEditStudent(
    student: Student
  ) {
    setEditingStudentId(
      student.id
    );

    setStudentForm({
      displayName:
        student.displayName,
      studentNumber:
        student.studentNumber,
      classId:
        student.classId,
      active:
        student.active,
      weeklyGoalsEnabled:
        student.weeklyGoalsEnabled,
    });

    setShowStudentForm(true);
  }

  async function saveStudent() {
    if (!teacher) {
      return;
    }

    if (
      !studentForm.displayName.trim()
    ) {
      setMessage(
        "Enter the student's name."
      );
      return;
    }

    if (
      !studentForm.studentNumber.trim()
    ) {
      setMessage(
        "Enter the student's number."
      );
      return;
    }

    if (!studentForm.classId) {
      setMessage(
        "Choose a class."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      if (editingStudentId) {
        await updateDoc(
          doc(
            db,
            "students",
            editingStudentId
          ),
          {
            displayName:
              studentForm.displayName.trim(),
            studentNumber:
              studentForm.studentNumber.trim(),
            classId:
              studentForm.classId,
            active:
              studentForm.active,
            weeklyGoalsEnabled:
              studentForm.weeklyGoalsEnabled,
          }
        );

        setStudents((current) =>
          current.map((student) =>
            student.id ===
            editingStudentId
              ? {
                  ...student,
                  displayName:
                    studentForm.displayName.trim(),
                  studentNumber:
                    studentForm.studentNumber.trim(),
                  classId:
                    studentForm.classId,
                  active:
                    studentForm.active,
                  weeklyGoalsEnabled:
                    studentForm.weeklyGoalsEnabled,
                }
              : student
          )
        );

        setMessage(
          "Student updated."
        );
      } else {
        const studentRef =
          await addDoc(
            collection(
              db,
              "students"
            ),
            {
              displayName:
                studentForm.displayName.trim(),
              studentNumber:
                studentForm.studentNumber.trim(),
              classId:
                studentForm.classId,
              active: true,
              weeklyGoalsEnabled:
                studentForm.weeklyGoalsEnabled,
              createdAt:
                serverTimestamp(),
              createdBy:
                teacher.id,
            }
          );

        setStudents((current) => [
          ...current,
          {
            id: studentRef.id,
            displayName:
              studentForm.displayName.trim(),
            studentNumber:
              studentForm.studentNumber.trim(),
            classId:
              studentForm.classId,
            authUid: "",
            active: true,
            weeklyGoalsEnabled:
              studentForm.weeklyGoalsEnabled,
          },
        ]);

        setMessage(
          "Student added."
        );
      }

      setShowStudentForm(false);
      setEditingStudentId(null);

      setStudentForm(
        EMPTY_STUDENT_FORM
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't save that student."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStudentActive(
    student: Student
  ) {
    try {
      const newValue =
        !student.active;

      await updateDoc(
        doc(
          db,
          "students",
          student.id
        ),
        {
          active: newValue,
        }
      );

      setStudents((current) =>
        current.map((item) =>
          item.id === student.id
            ? {
                ...item,
                active:
                  newValue,
              }
            : item
        )
      );

      setMessage(
        newValue
          ? `${student.displayName} reactivated.`
          : `${student.displayName} deactivated.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't update that student."
      );
    }
  }

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
          Loading Class Manager...
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
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
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

            <button
              onClick={() =>
                router.push(
                  "/teacher/classes"
                )
              }
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              🏫 Classes
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
                Class Manager
              </h1>

              <p className="text-gray-600 mt-1">
                Manage classes and rosters.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">

              <button
                onClick={() =>
                  setShowCreateClass(
                    true
                  )
                }
                className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
              >
                + New Class
              </button>

              <button
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

        {message && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-6 text-blue-950 font-semibold">
            {message}
          </div>
        )}

        <section className="bg-white rounded-3xl border-2 border-blue-200 p-6 mb-6">

          <div className="flex flex-col lg:flex-row lg:items-end gap-4">

            <div className="flex-1">

              <label className="block font-bold text-blue-900 mb-2">
                Current Class
              </label>

              <select
                value={
                  selectedClassId
                }
                onChange={(e) =>
                  selectClass(
                    e.target.value
                  )
                }
                className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
              >
                {classes.length === 0 && (
                  <option value="">
                    No classes found
                  </option>
                )}

                {classes.map(
                  (classItem) => (
                    <option
                      key={
                        classItem.id
                      }
                      value={
                        classItem.id
                      }
                    >
                      {classItem.name}
                      {classItem.schoolYear
                        ? ` — ${classItem.schoolYear}`
                        : ""}
                    </option>
                  )
                )}
              </select>

            </div>

            <div className="bg-blue-50 rounded-2xl px-5 py-3">

              <p className="text-xs uppercase font-bold text-blue-700">
                Active Students
              </p>

              <p className="text-2xl font-bold text-blue-950">
                {
                  activeRoster.length
                }
              </p>

            </div>

          </div>
        </section>

        {selectedClass && (
          <section className="bg-white rounded-3xl border border-yellow-200 p-6 mb-6">

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

              <div>

                <p className="text-xs font-bold uppercase text-yellow-700">
                  Selected Class
                </p>

                <h2 className="text-2xl font-bold text-blue-950 mt-1">
                  {selectedClass.name}
                </h2>

                <p className="text-gray-600 mt-1">
                  School Year:{" "}
                  {
                    selectedClass.schoolYear
                  }
                </p>

                <p className="text-gray-600">
                  Teachers:{" "}
                  {
                    selectedClass.teacherIds.length
                  }
                </p>

              </div>

              {teacher &&
                selectedClass.ownerTeacherId ===
                  teacher.id && (
                  <div className="bg-green-50 text-green-800 rounded-xl px-4 py-2 font-bold">
                    You are the owner
                  </div>
                )}

            </div>

          </section>
        )}

        <section className="bg-white rounded-3xl border border-blue-200 p-6">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">

            <div>

              <h2 className="text-2xl font-bold text-blue-900">
                Roster
              </h2>

              <p className="text-gray-600 mt-1">
                Add, edit, move, or deactivate students.
              </p>

            </div>

            <button
              onClick={
                openAddStudent
              }
              disabled={
                !selectedClassId
              }
              className="bg-blue-900 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50"
            >
              + Add Student
            </button>

          </div>

          {activeRoster.length ===
          0 ? (
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-8 text-center text-gray-500">
              No active students in this class.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full min-w-[850px]">

                <thead>

                  <tr className="text-left border-b-2 border-blue-100">

                    <th className="p-3">
                      Student
                    </th>

                    <th className="p-3">
                      Number
                    </th>

                    <th className="p-3">
                      Goals
                    </th>

                    <th className="p-3">
                      Login
                    </th>

                    <th className="p-3">
                      Actions
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {activeRoster.map(
                    (student) => (
                      <tr
                        key={
                          student.id
                        }
                        className="border-b border-blue-50"
                      >

                        <td className="p-3">

                          <button
                            onClick={() =>
                              router.push(
                                `/teacher/students/${student.id}`
                              )
                            }
                            className="font-bold text-blue-950 underline"
                          >
                            {
                              student.displayName
                            }
                          </button>

                        </td>

                        <td className="p-3">
                          {
                            student.studentNumber ||
                            "—"
                          }
                        </td>

                        <td className="p-3">

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              student.weeklyGoalsEnabled
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {student.weeklyGoalsEnabled
                              ? "Enabled"
                              : "Disabled"}
                          </span>

                        </td>

                        <td className="p-3">

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              student.authUid
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {student.authUid
                              ? "Connected"
                              : "Not Connected"}
                          </span>

                        </td>

                        <td className="p-3">

                          <div className="flex flex-wrap gap-2">

                            <button
                              onClick={() =>
                                openEditStudent(
                                  student
                                )
                              }
                              className="bg-blue-100 text-blue-900 rounded-xl px-3 py-2 font-bold"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                toggleStudentActive(
                                  student
                                )
                              }
                              className="bg-red-50 text-red-700 rounded-xl px-3 py-2 font-bold"
                            >
                              Deactivate
                            </button>

                          </div>

                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>
          )}

          {inactiveRoster.length >
            0 && (
            <div className="mt-8">

              <h3 className="text-lg font-bold text-gray-700 mb-3">
                Inactive Students
              </h3>

              <div className="space-y-2">

                {inactiveRoster.map(
                  (student) => (
                    <div
                      key={
                        student.id
                      }
                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-50 rounded-2xl p-4"
                    >

                      <div>

                        <p className="font-bold text-gray-700">
                          {
                            student.displayName
                          }
                        </p>

                        <p className="text-sm text-gray-500">
                          Student #
                          {
                            student.studentNumber
                          }
                        </p>

                      </div>

                      <div className="flex gap-2">

                        <button
                          onClick={() =>
                            openEditStudent(
                              student
                            )
                          }
                          className="bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-gray-700"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() =>
                            toggleStudentActive(
                              student
                            )
                          }
                          className="bg-green-100 text-green-800 rounded-xl px-3 py-2 font-bold"
                        >
                          Reactivate
                        </button>

                      </div>

                    </div>
                  )
                )}

              </div>

            </div>
          )}

        </section>

        {showCreateClass && (
          <div className="mt-6 bg-white border-4 border-yellow-300 rounded-3xl p-6">

            <h2 className="text-2xl font-bold text-blue-900">
              Create New Class
            </h2>

            <div className="grid md:grid-cols-2 gap-4 mt-5">

              <div>

                <label className="block font-bold text-blue-900 mb-2">
                  Class Name
                </label>

                <input
                  value={
                    newClassName
                  }
                  onChange={(e) =>
                    setNewClassName(
                      e.target.value
                    )
                  }
                  placeholder="Example: Ms. Flory - Reading"
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />

              </div>

              <div>

                <label className="block font-bold text-blue-900 mb-2">
                  School Year
                </label>

                <input
                  value={
                    newSchoolYear
                  }
                  onChange={(e) =>
                    setNewSchoolYear(
                      e.target.value
                    )
                  }
                  placeholder="2026-2027"
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />

              </div>

            </div>

            <div className="flex flex-wrap gap-3 mt-5">

              <button
                onClick={
                  createClass
                }
                disabled={
                  saving
                }
                className="bg-yellow-400 text-blue-950 rounded-xl px-5 py-3 font-bold disabled:opacity-50"
              >
                Create Class
              </button>

              <button
                onClick={() =>
                  setShowCreateClass(
                    false
                  )
                }
                className="bg-white border-2 border-gray-200 rounded-xl px-5 py-3 font-bold text-gray-700"
              >
                Cancel
              </button>

            </div>

          </div>
        )}

        {showStudentForm && (
          <div className="mt-6 bg-white border-4 border-blue-200 rounded-3xl p-6">

            <h2 className="text-2xl font-bold text-blue-900">
              {editingStudentId
                ? "Edit Student"
                : "Add Student"}
            </h2>

            <div className="grid md:grid-cols-2 gap-4 mt-5">

              <div>

                <label className="block font-bold text-blue-900 mb-2">
                  Name
                </label>

                <input
                  value={
                    studentForm.displayName
                  }
                  onChange={(e) =>
                    setStudentForm(
                      (current) => ({
                        ...current,
                        displayName:
                          e.target.value,
                      })
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />

              </div>

              <div>

                <label className="block font-bold text-blue-900 mb-2">
                  Student Number
                </label>

                <input
                  value={
                    studentForm.studentNumber
                  }
                  onChange={(e) =>
                    setStudentForm(
                      (current) => ({
                        ...current,
                        studentNumber:
                          e.target.value,
                      })
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />

              </div>

              <div>

                <label className="block font-bold text-blue-900 mb-2">
                  Class
                </label>

                <select
                  value={
                    studentForm.classId
                  }
                  onChange={(e) =>
                    setStudentForm(
                      (current) => ({
                        ...current,
                        classId:
                          e.target.value,
                      })
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                >

                  {classes.map(
                    (classItem) => (
                      <option
                        key={
                          classItem.id
                        }
                        value={
                          classItem.id
                        }
                      >
                        {
                          classItem.name
                        }
                      </option>
                    )
                  )}

                </select>

              </div>

              <div className="flex flex-col justify-end gap-3">

                <label className="flex items-center gap-3 font-bold text-blue-900">

                  <input
                    type="checkbox"
                    checked={
                      studentForm.weeklyGoalsEnabled
                    }
                    onChange={(e) =>
                      setStudentForm(
                        (current) => ({
                          ...current,
                          weeklyGoalsEnabled:
                            e.target.checked,
                        })
                      )
                    }
                  />

                  Weekly Goals Enabled

                </label>

                {editingStudentId && (
                  <label className="flex items-center gap-3 font-bold text-blue-900">

                    <input
                      type="checkbox"
                      checked={
                        studentForm.active
                      }
                      onChange={(e) =>
                        setStudentForm(
                          (current) => ({
                            ...current,
                            active:
                              e.target.checked,
                          })
                        )
                      }
                    />

                    Active Student

                  </label>
                )}

              </div>

            </div>

            <div className="flex flex-wrap gap-3 mt-5">

              <button
                onClick={
                  saveStudent
                }
                disabled={
                  saving
                }
                className="bg-blue-900 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-50"
              >
                {editingStudentId
                  ? "Save Changes"
                  : "Add Student"}
              </button>

              <button
                onClick={() => {
                  setShowStudentForm(
                    false
                  );
                  setEditingStudentId(
                    null
                  );
                }}
                className="bg-white border-2 border-gray-200 rounded-xl px-5 py-3 font-bold text-gray-700"
              >
                Cancel
              </button>

            </div>

          </div>
        )}

      </div>
    </main>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}