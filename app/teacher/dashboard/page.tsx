"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
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

const SUBJECTS = [
  "AVID",
  "ELA",
  "Math",
  "Social Studies",
  "Writing",
];

type Student = {
  id: string;
  displayName: string;
  studentNumber: string;
};

type SavedGroup = {
  id: string;
  name: string;
  studentIds: string[];
};

type PlannerItem = {
  id: string;
  title: string;
  subject: string;
  description: string;
  date: string;
  prepNotes: string;
  prepComplete: boolean;
  createStudentAssignment: boolean;
  assignmentId: string;
  audienceType: "all" | "selected" | "group" | "none";
  audienceLabel: string;
  groupId: string;
  studentCount: number;
  dueDate: string;
  archived: boolean;
};

type DayInfo = {
  name: string;
  date: Date;
  dateString: string;
};

type StatusRecord = {
  id: string;
  studentId: string;
  status: string;
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

export default function TeacherDashboard() {
  const router = useRouter();

  const [teacher, setTeacher] = useState<User | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>([]);
  const [plannerItems, setPlannerItems] = useState<PlannerItem[]>([]);
  const [supports, setSupports] = useState<Support[]>([]);
  const [supportProgress, setSupportProgress] = useState<SupportProgress[]>([]);
  const [supportUpdatingId, setSupportUpdatingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getMonday(new Date())
  );

  // Planner form
  const [showForm, setShowForm] = useState(false);
  const [editingItemId, setEditingItemId] =
    useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Math");
  const [description, setDescription] = useState("");
  const [plannerDate, setPlannerDate] = useState("");
  const [prepNotes, setPrepNotes] = useState("");
  const [prepComplete, setPrepComplete] = useState(false);

  const [createStudentAssignment, setCreateStudentAssignment] =
    useState(true);

  const [dueDate, setDueDate] = useState("");

  const [assignTo, setAssignTo] =
    useState<"all" | "selected" | "group">("all");

  const [selectedStudents, setSelectedStudents] =
    useState<string[]>([]);

  const [selectedGroupId, setSelectedGroupId] = useState("");

  // Group manager
  const [showGroups, setShowGroups] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupStudentIds, setGroupStudentIds] =
    useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] =
    useState<string | null>(null);
  const [groupMessage, setGroupMessage] = useState("");

  // Supports & rewards manager
  const [showSupports, setShowSupports] = useState(false);
  const [supportStudentId, setSupportStudentId] = useState("");
  const [supportName, setSupportName] = useState("");
  const [supportType, setSupportType] =
    useState<"dailyAllowance" | "weeklyGoal">("dailyAllowance");
  const [supportDescription, setSupportDescription] = useState("");
  const [supportTarget, setSupportTarget] = useState(1);
  const [supportReward, setSupportReward] = useState("");
  const [supportStudentCanTrack, setSupportStudentCanTrack] = useState(true);
  const [supportActive, setSupportActive] = useState(true);
  const [editingSupportId, setEditingSupportId] =
    useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState("");

  const [saving, setSaving] = useState(false);
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

          setTeacher(user);

          await loadStudents();
          await loadGroups();
          await loadPlannerItems();
          await loadSupports();
          await loadSupportProgress();
        } catch (error) {
          console.error(error);
          setMessage(
            "HawkTrack could not load the teacher dashboard."
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function loadStudents() {
    const snapshot = await getDocs(
      query(
        collection(db, "students"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedStudents: Student[] = snapshot.docs
      .filter((studentDoc) => studentDoc.data().active !== false)
      .map((studentDoc) => {
        const data = studentDoc.data();

        return {
          id: studentDoc.id,
          displayName: data.displayName || "Student",
          studentNumber: data.studentNumber || "",
        };
      })
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );

    setStudents(loadedStudents);
  }

  async function loadGroups() {
    const snapshot = await getDocs(
      query(
        collection(db, "groups"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedGroups: SavedGroup[] = snapshot.docs
      .map((groupDoc) => {
        const data = groupDoc.data();

        return {
          id: groupDoc.id,
          name: data.name || "Group",
          studentIds: Array.isArray(data.studentIds)
            ? data.studentIds
            : [],
        };
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );

    setSavedGroups(loadedGroups);
  }

  async function loadSupports() {
    const snapshot = await getDocs(
      query(
        collection(db, "supports"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedSupports: Support[] = snapshot.docs
      .map<Support>((supportDoc) => {
        const data = supportDoc.data();

        return {
          id: supportDoc.id,
          studentId: data.studentId || "",
          name: data.name || "Support",
          type:
            data.type === "weeklyGoal"
              ? "weeklyGoal"
              : "dailyAllowance",
          description: data.description || "",
          target: Number(data.target || 1),
          reward: data.reward || "",
          studentCanTrack: data.studentCanTrack !== false,
          active: data.active !== false,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    setSupports(loadedSupports);
  }

  async function loadSupportProgress() {
    const snapshot = await getDocs(
      query(
        collection(db, "supportProgress"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loadedProgress: SupportProgress[] = snapshot.docs.map(
      (progressDoc) => {
        const data = progressDoc.data();

        return {
          id: progressDoc.id,
          studentId: data.studentId || "",
          supportId: data.supportId || "",
          periodKey: data.periodKey || "",
          count: Number(data.count) || 0,
        };
      }
    );

    setSupportProgress(loadedProgress);
  }

  async function loadPlannerItems() {
    const snapshot = await getDocs(
      query(
        collection(db, "plannerItems"),
        where("classId", "==", CLASS_ID)
      )
    );

    const loaded: PlannerItem[] = snapshot.docs
      .map((itemDoc) => {
        const data = itemDoc.data();

        return {
          id: itemDoc.id,
          title: data.title || "Planner Item",
          subject: data.subject || "",
          description: data.description || "",
          date: data.date || "",
          prepNotes: data.prepNotes || "",
          prepComplete: data.prepComplete === true,
          createStudentAssignment:
            data.createStudentAssignment === true,
          assignmentId: data.assignmentId || "",
          audienceType: data.audienceType || "none",
          audienceLabel: data.audienceLabel || "",
          groupId: data.groupId || "",
          studentCount: data.studentCount || 0,
          dueDate: data.dueDate || "",
          archived: data.archived === true,
        };
      })
      .filter((item) => !item.archived);

    setPlannerItems(loaded);
  }

  const weekDays = useMemo<DayInfo[]>(() => {
    const names = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ];

    return names.map((name, index) => {
      const date = new Date(weekStart);

      date.setDate(weekStart.getDate() + index);

      return {
        name,
        date,
        dateString: formatDateForInput(date),
      };
    });
  }, [weekStart]);

  const itemsByDay = useMemo(() => {
    const result: Record<string, PlannerItem[]> = {};

    weekDays.forEach((day) => {
      result[day.dateString] = plannerItems
        .filter((item) => item.date === day.dateString)
        .sort((a, b) =>
          a.subject.localeCompare(b.subject)
        );
    });

    return result;
  }, [plannerItems, weekDays]);

  const maxRows = useMemo(() => {
    const counts = weekDays.map(
      (day) =>
        itemsByDay[day.dateString]?.length || 0
    );

    return Math.max(1, ...counts);
  }, [itemsByDay, weekDays]);

  function resetForm() {
    setEditingItemId(null);
    setTitle("");
    setSubject("Math");
    setDescription("");
    setPlannerDate("");
    setPrepNotes("");
    setPrepComplete(false);
    setCreateStudentAssignment(true);
    setDueDate("");
    setAssignTo("all");
    setSelectedStudents([]);
    setSelectedGroupId("");
    setMessage("");
  }

  function openAddForDay(dateString: string) {
    resetForm();

    setPlannerDate(dateString);
    setDueDate(dateString);
    setShowForm(true);
    setShowGroups(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openQuickAdd() {
    resetForm();

    // Default Quick Add to Monday of the week currently being viewed.
    const viewedWeekMonday = formatDateForInput(weekStart);

    setPlannerDate(viewedWeekMonday);
    setDueDate(viewedWeekMonday);
    setShowForm(true);
    setShowGroups(false);
    setShowSupports(false);
  }

  async function openEdit(item: PlannerItem) {
    resetForm();

    setEditingItemId(item.id);
    setTitle(item.title);
    setSubject(item.subject);
    setDescription(item.description);
    setPlannerDate(item.date);
    setPrepNotes(item.prepNotes);
    setPrepComplete(item.prepComplete);
    setCreateStudentAssignment(
      item.createStudentAssignment
    );
    setDueDate(item.dueDate);

    if (
      item.audienceType === "all" ||
      item.audienceType === "selected" ||
      item.audienceType === "group"
    ) {
      setAssignTo(item.audienceType);
    }

    setSelectedGroupId(item.groupId || "");

    if (item.assignmentId) {
      try {
        const statusSnapshot = await getDocs(
          query(
            collection(
              db,
              "studentAssignmentStatus"
            ),
            where(
              "assignmentId",
              "==",
              item.assignmentId
            )
          )
        );

        setSelectedStudents(
          statusSnapshot.docs.map(
            (statusDoc) =>
              statusDoc.data().studentId
          )
        );
      } catch (error) {
        console.error(error);
      }
    }

    setShowGroups(false);
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  function toggleStudent(studentId: string) {
    setSelectedStudents((current) =>
      current.includes(studentId)
        ? current.filter(
            (id) => id !== studentId
          )
        : [...current, studentId]
    );
  }

  function toggleGroupStudent(studentId: string) {
    setGroupStudentIds((current) =>
      current.includes(studentId)
        ? current.filter(
            (id) => id !== studentId
          )
        : [...current, studentId]
    );
  }

  function resetGroupForm() {
    setGroupName("");
    setGroupStudentIds([]);
    setEditingGroupId(null);
    setGroupMessage("");
  }

  async function saveGroup() {
    setGroupMessage("");

    if (!groupName.trim()) {
      setGroupMessage("Enter a group name.");
      return;
    }

    if (groupStudentIds.length === 0) {
      setGroupMessage(
        "Choose at least one student."
      );
      return;
    }

    try {
      if (editingGroupId) {
        await updateDoc(
          doc(db, "groups", editingGroupId),
          {
            name: groupName.trim(),
            studentIds: groupStudentIds,
          }
        );

        setSavedGroups((current) =>
          current
            .map((group) =>
              group.id === editingGroupId
                ? {
                    ...group,
                    name: groupName.trim(),
                    studentIds: [
                      ...groupStudentIds,
                    ],
                  }
                : group
            )
            .sort((a, b) =>
              a.name.localeCompare(b.name)
            )
        );

        setGroupMessage("Group updated!");
      } else {
        const groupRef = await addDoc(
          collection(db, "groups"),
          {
            classId: CLASS_ID,
            name: groupName.trim(),
            studentIds: groupStudentIds,
            createdBy: teacher?.uid || "",
            createdAt: serverTimestamp(),
          }
        );

        setSavedGroups((current) =>
          [
            ...current,
            {
              id: groupRef.id,
              name: groupName.trim(),
              studentIds: [
                ...groupStudentIds,
              ],
            },
          ].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );

        setGroupMessage("Group saved!");
      }

      setGroupName("");
      setGroupStudentIds([]);
      setEditingGroupId(null);
    } catch (error) {
      console.error(error);

      setGroupMessage(
        "There was a problem saving the group."
      );
    }
  }

  function editGroup(group: SavedGroup) {
    setGroupName(group.name);
    setGroupStudentIds([
      ...group.studentIds,
    ]);
    setEditingGroupId(group.id);
    setGroupMessage("");
  }

  async function deleteGroup(group: SavedGroup) {
    const okay = window.confirm(
      `Delete "${group.name}"? Existing assignments will not be changed.`
    );

    if (!okay) {
      return;
    }

    try {
      await deleteDoc(
        doc(db, "groups", group.id)
      );

      setSavedGroups((current) =>
        current.filter(
          (item) => item.id !== group.id
        )
      );

      if (
        selectedGroupId === group.id
      ) {
        setSelectedGroupId("");
      }

      if (
        editingGroupId === group.id
      ) {
        resetGroupForm();
      }
    } catch (error) {
      console.error(error);

      setGroupMessage(
        "HawkTrack couldn't delete that group."
      );
    }
  }

  function resetSupportForm() {
    setSupportStudentId("");
    setSupportName("");
    setSupportType("dailyAllowance");
    setSupportDescription("");
    setSupportTarget(1);
    setSupportReward("");
    setSupportStudentCanTrack(true);
    setSupportActive(true);
    setEditingSupportId(null);
    setSupportMessage("");
  }

  async function saveSupport() {
    setSupportMessage("");

    if (!supportStudentId) {
      setSupportMessage("Choose a student.");
      return;
    }

    if (!supportName.trim()) {
      setSupportMessage("Enter a support or reward name.");
      return;
    }

    if (!Number.isFinite(supportTarget) || supportTarget < 1) {
      setSupportMessage("Target must be at least 1.");
      return;
    }

    try {
      const supportData = {
        classId: CLASS_ID,
        studentId: supportStudentId,
        name: supportName.trim(),
        type: supportType,
        description: supportDescription.trim(),
        target: Math.floor(supportTarget),
        reward: supportReward.trim(),
        studentCanTrack: supportStudentCanTrack,
        active: supportActive,
        updatedAt: serverTimestamp(),
      };

      if (editingSupportId) {
        await updateDoc(
          doc(db, "supports", editingSupportId),
          supportData
        );

        setSupports((current) =>
          current.map((support) =>
            support.id === editingSupportId
              ? {
                  ...support,
                  ...supportData,
                  target: Math.floor(supportTarget),
                }
              : support
          )
        );

        setSupportMessage("Support updated!");
      } else {
        const supportRef = await addDoc(
          collection(db, "supports"),
          {
            ...supportData,
            createdBy: teacher?.uid || "",
            createdAt: serverTimestamp(),
          }
        );

        setSupports((current) => [
          ...current,
          {
            id: supportRef.id,
            studentId: supportStudentId,
            name: supportName.trim(),
            type: supportType,
            description: supportDescription.trim(),
            target: Math.floor(supportTarget),
            reward: supportReward.trim(),
            studentCanTrack: supportStudentCanTrack,
            active: supportActive,
          },
        ]);

        setSupportMessage("Support saved!");
      }

      setSupportStudentId("");
      setSupportName("");
      setSupportType("dailyAllowance");
      setSupportDescription("");
      setSupportTarget(1);
      setSupportReward("");
      setSupportStudentCanTrack(true);
      setSupportActive(true);
      setEditingSupportId(null);
    } catch (error) {
      console.error(error);
      setSupportMessage("There was a problem saving the support.");
    }
  }

  function editSupport(support: Support) {
    setSupportStudentId(support.studentId);
    setSupportName(support.name);
    setSupportType(support.type);
    setSupportDescription(support.description);
    setSupportTarget(support.target);
    setSupportReward(support.reward);
    setSupportStudentCanTrack(support.studentCanTrack);
    setSupportActive(support.active);
    setEditingSupportId(support.id);
    setSupportMessage("");
  }

  async function toggleSupportActive(support: Support) {
    try {
      const newValue = !support.active;

      await updateDoc(
        doc(db, "supports", support.id),
        {
          active: newValue,
          updatedAt: serverTimestamp(),
        }
      );

      setSupports((current) =>
        current.map((item) =>
          item.id === support.id
            ? { ...item, active: newValue }
            : item
        )
      );
    } catch (error) {
      console.error(error);
      setSupportMessage("HawkTrack couldn't change that support.");
    }
  }

  function getSupportPeriodKey(support: Support) {
    return support.type === "dailyAllowance"
      ? formatDateForInput(new Date())
      : formatDateForInput(getMonday(new Date()));
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

  async function changeTeacherSupportProgress(
    support: Support,
    amount: number
  ) {
    const current = getCurrentSupportProgress(support);
    const currentCount = current?.count || 0;
    const newCount = Math.max(
      0,
      Math.min(support.target, currentCount + amount)
    );

    if (newCount === currentCount) return;

    try {
      setSupportUpdatingId(support.id);
      setSupportMessage("");

      if (current) {
        await updateDoc(doc(db, "supportProgress", current.id), {
          count: newCount,
          updatedAt: serverTimestamp(),
        });

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
            studentId: support.studentId,
            classId: CLASS_ID,
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
            studentId: support.studentId,
            supportId: support.id,
            periodKey,
            count: newCount,
          },
        ]);
      }
    } catch (error) {
      console.error(error);
      setSupportMessage("HawkTrack couldn't update that student's progress.");
    } finally {
      setSupportUpdatingId(null);
    }
  }

  async function resetTeacherSupportProgress(support: Support) {
    const current = getCurrentSupportProgress(support);

    if (!current || current.count === 0) return;

    try {
      setSupportUpdatingId(support.id);
      setSupportMessage("");

      await updateDoc(doc(db, "supportProgress", current.id), {
        count: 0,
        updatedAt: serverTimestamp(),
      });

      setSupportProgress((items) =>
        items.map((item) =>
          item.id === current.id ? { ...item, count: 0 } : item
        )
      );
    } catch (error) {
      console.error(error);
      setSupportMessage("HawkTrack couldn't reset that student's progress.");
    } finally {
      setSupportUpdatingId(null);
    }
  }

  function getTargetStudents() {
    if (assignTo === "all") {
      return {
        students,
        label: "Whole Class",
        groupId: "",
      };
    }

    if (assignTo === "selected") {
      return {
        students: students.filter(
          (student) =>
            selectedStudents.includes(
              student.id
            )
        ),
        label: "Selected Students",
        groupId: "",
      };
    }

    const group = savedGroups.find(
      (savedGroup) =>
        savedGroup.id === selectedGroupId
    );

    if (!group) {
      return {
        students: [],
        label: "",
        groupId: "",
      };
    }

    return {
      students: students.filter(
        (student) =>
          group.studentIds.includes(
            student.id
          )
      ),
      label: group.name,
      groupId: group.id,
    };
  }

  async function savePlannerItem() {
    setMessage("");

    if (!teacher) {
      setMessage(
        "You must be signed in as a teacher."
      );
      return;
    }

    if (!title.trim()) {
      setMessage("Enter a title.");
      return;
    }

    if (!plannerDate) {
      setMessage(
        "Choose a day for the planner item."
      );
      return;
    }

    const target = getTargetStudents();

    if (
      createStudentAssignment &&
      !dueDate
    ) {
      setMessage("Choose a due date.");
      return;
    }

    if (
      createStudentAssignment &&
      target.students.length === 0
    ) {
      setMessage(
        assignTo === "group"
          ? "Choose a saved group."
          : "Choose at least one student."
      );
      return;
    }

    try {
      setSaving(true);

      if (editingItemId) {
        const oldItem =
          plannerItems.find(
            (item) =>
              item.id === editingItemId
          );

        if (!oldItem) {
          setMessage(
            "HawkTrack couldn't find that planner item."
          );
          return;
        }

        await updateExistingItem(
          oldItem,
          target.students,
          target.label,
          target.groupId
        );

        setMessage("Planner item updated!");
      } else {
        await createNewItem(
          target.students,
          target.label,
          target.groupId
        );

        setMessage(
          createStudentAssignment
            ? `Planner item created and assigned to ${target.students.length} student${
                target.students.length === 1
                  ? ""
                  : "s"
              }!`
            : "Teacher-only planner item created!"
        );
      }

      setTimeout(() => {
        setShowForm(false);
        resetForm();
      }, 500);
    } catch (error) {
      console.error(error);

      setMessage(
        "There was a problem saving the planner item."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createNewItem(
    targetStudents: Student[],
    audienceLabel: string,
    groupId: string
  ) {
    let assignmentId = "";

    if (createStudentAssignment) {
      const assignmentRef =
        await addDoc(
          collection(
            db,
            "assignments"
          ),
          {
            classId: CLASS_ID,
            title: title.trim(),
            subject,
            description:
              description.trim(),
            showDate: plannerDate,
            dueDate,
            archived: false,
            audienceType: assignTo,
            audienceLabel,
            groupId,
            createdBy: teacher?.uid || "",
            createdAt:
              serverTimestamp(),
          }
        );

      assignmentId =
        assignmentRef.id;

      const batch = writeBatch(db);

      targetStudents.forEach(
        (student) => {
          const statusRef = doc(
            collection(
              db,
              "studentAssignmentStatus"
            )
          );

          batch.set(statusRef, {
            classId: CLASS_ID,
            assignmentId,
            studentId: student.id,
            status: "todo",
            feedback: "",
            verifiedBy: "",
            verifiedAt: null,
            createdAt:
              serverTimestamp(),
          });
        }
      );

      await batch.commit();
    }

    const plannerRef = await addDoc(
      collection(db, "plannerItems"),
      {
        classId: CLASS_ID,
        title: title.trim(),
        subject,
        description:
          description.trim(),
        date: plannerDate,
        prepNotes:
          prepNotes.trim(),
        prepComplete,
        createStudentAssignment,
        assignmentId,
        audienceType:
          createStudentAssignment
            ? assignTo
            : "none",
        audienceLabel:
          createStudentAssignment
            ? audienceLabel
            : "Teacher Only",
        groupId:
          createStudentAssignment
            ? groupId
            : "",
        studentCount:
          createStudentAssignment
            ? targetStudents.length
            : 0,
        dueDate:
          createStudentAssignment
            ? dueDate
            : "",
        archived: false,
        createdBy:
          teacher?.uid || "",
        createdAt:
          serverTimestamp(),
      }
    );

    setPlannerItems((current) => [
      ...current,
      {
        id: plannerRef.id,
        title: title.trim(),
        subject,
        description:
          description.trim(),
        date: plannerDate,
        prepNotes:
          prepNotes.trim(),
        prepComplete,
        createStudentAssignment,
        assignmentId,
        audienceType:
          createStudentAssignment
            ? assignTo
            : "none",
        audienceLabel:
          createStudentAssignment
            ? audienceLabel
            : "Teacher Only",
        groupId:
          createStudentAssignment
            ? groupId
            : "",
        studentCount:
          createStudentAssignment
            ? targetStudents.length
            : 0,
        dueDate:
          createStudentAssignment
            ? dueDate
            : "",
        archived: false,
      },
    ]);
  }

  async function updateExistingItem(
    oldItem: PlannerItem,
    targetStudents: Student[],
    audienceLabel: string,
    groupId: string
  ) {
    let studentCount =
      oldItem.studentCount;

    // Update linked student assignment.
    if (
      oldItem.createStudentAssignment &&
      oldItem.assignmentId
    ) {
      const statusSnapshot =
        await getDocs(
          query(
            collection(
              db,
              "studentAssignmentStatus"
            ),
            where(
              "assignmentId",
              "==",
              oldItem.assignmentId
            )
          )
        );

      const statusRecords: StatusRecord[] =
        statusSnapshot.docs.map(
          (statusDoc) => ({
            id: statusDoc.id,
            studentId:
              statusDoc.data().studentId,
            status:
              statusDoc.data().status ||
              "todo",
          })
        );

      const oldStudentIds =
        statusRecords.map(
          (status) =>
            status.studentId
        );

      const newStudentIds =
        targetStudents.map(
          (student) =>
            student.id
        );

      const rosterChanged =
        !sameIds(
          oldStudentIds,
          newStudentIds
        );

      if (rosterChanged) {
        const workHasStarted =
          statusRecords.some(
            (status) =>
              status.status !== "todo"
          );

        if (workHasStarted) {
          throw new Error(
            "ROSTER_LOCKED"
          );
        }

        const batch =
          writeBatch(db);

        statusSnapshot.docs.forEach(
          (statusDoc) => {
            batch.delete(
              statusDoc.ref
            );
          }
        );

        targetStudents.forEach(
          (student) => {
            const statusRef = doc(
              collection(
                db,
                "studentAssignmentStatus"
              )
            );

            batch.set(
              statusRef,
              {
                classId: CLASS_ID,
                assignmentId:
                  oldItem.assignmentId,
                studentId:
                  student.id,
                status: "todo",
                feedback: "",
                verifiedBy: "",
                verifiedAt: null,
                createdAt:
                  serverTimestamp(),
              }
            );
          }
        );

        await batch.commit();
      }

      studentCount =
        targetStudents.length;

      await updateDoc(
        doc(
          db,
          "assignments",
          oldItem.assignmentId
        ),
        {
          title: title.trim(),
          subject,
          description:
            description.trim(),
          showDate: plannerDate,
          dueDate,
          audienceType: assignTo,
          audienceLabel,
          groupId,
          updatedAt:
            serverTimestamp(),
        }
      );
    }

    await updateDoc(
      doc(
        db,
        "plannerItems",
        oldItem.id
      ),
      {
        title: title.trim(),
        subject,
        description:
          description.trim(),
        date: plannerDate,
        prepNotes:
          prepNotes.trim(),
        prepComplete,
        dueDate:
          oldItem.createStudentAssignment
            ? dueDate
            : "",
        audienceType:
          oldItem.createStudentAssignment
            ? assignTo
            : "none",
        audienceLabel:
          oldItem.createStudentAssignment
            ? audienceLabel
            : "Teacher Only",
        groupId:
          oldItem.createStudentAssignment
            ? groupId
            : "",
        studentCount:
          oldItem.createStudentAssignment
            ? studentCount
            : 0,
        updatedAt:
          serverTimestamp(),
      }
    );

    setPlannerItems((current) =>
      current.map((item) =>
        item.id === oldItem.id
          ? {
              ...item,
              title: title.trim(),
              subject,
              description:
                description.trim(),
              date: plannerDate,
              prepNotes:
                prepNotes.trim(),
              prepComplete,
              dueDate:
                oldItem.createStudentAssignment
                  ? dueDate
                  : "",
              audienceType:
                oldItem.createStudentAssignment
                  ? assignTo
                  : "none",
              audienceLabel:
                oldItem.createStudentAssignment
                  ? audienceLabel
                  : "Teacher Only",
              groupId:
                oldItem.createStudentAssignment
                  ? groupId
                  : "",
              studentCount:
                oldItem.createStudentAssignment
                  ? studentCount
                  : 0,
            }
          : item
      )
    );
  }

  async function togglePrep(
    item: PlannerItem
  ) {
    try {
      const newValue =
        !item.prepComplete;

      await updateDoc(
        doc(
          db,
          "plannerItems",
          item.id
        ),
        {
          prepComplete: newValue,
        }
      );

      setPlannerItems((current) =>
        current.map((plannerItem) =>
          plannerItem.id === item.id
            ? {
                ...plannerItem,
                prepComplete: newValue,
              }
            : plannerItem
        )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't update the prep status."
      );
    }
  }

  async function archivePlannerItem(
    item: PlannerItem
  ) {
    const okay = window.confirm(
      `Archive "${item.title}"?`
    );

    if (!okay) {
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          "plannerItems",
          item.id
        ),
        {
          archived: true,
        }
      );

      if (item.assignmentId) {
        await updateDoc(
          doc(
            db,
            "assignments",
            item.assignmentId
          ),
          {
            archived: true,
          }
        );
      }

      setPlannerItems((current) =>
        current.filter(
          (plannerItem) =>
            plannerItem.id !==
            item.id
        )
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "HawkTrack couldn't archive that item."
      );
    }
  }

  function previousWeek() {
    const previous =
      new Date(weekStart);

    previous.setDate(
      previous.getDate() - 7
    );

    setWeekStart(previous);
  }

  function nextWeek() {
    const next =
      new Date(weekStart);

    next.setDate(
      next.getDate() + 7
    );

    setWeekStart(next);
  }

  function currentWeek() {
    setWeekStart(
      getMonday(new Date())
    );
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
          Loading Teacher Dashboard...
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
              onClick={() => router.push("/teacher/dashboard")}
              className="text-white hover:bg-blue-800 px-5 py-3 rounded-xl font-bold"
            >
              🏠 Dashboard
            </button>

            <button
              onClick={() => router.push("/teacher")}
              className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
            >
              📅 Weekly Planner
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

        <header className="bg-white border-4 border-yellow-300 rounded-3xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
                HawkTrack
              </p>

              <h1 className="text-3xl font-bold text-blue-900">
                Teacher Planner
              </h1>
            </div>

            <div className="flex flex-wrap gap-3">

              <button
                onClick={() => {
                  setShowGroups(
                    (current) =>
                      !current
                  );

                  setShowForm(false);
                  setShowSupports(false);
                }}
                className="bg-white border-2 border-blue-300 text-blue-900 px-5 py-3 rounded-xl font-bold"
              >
                Manage Groups
              </button>

              <button
                onClick={() => {
                  setShowSupports((current) => !current);
                  setShowGroups(false);
                  setShowForm(false);
                  resetSupportForm();
                }}
                className="bg-white border-2 border-amber-300 text-blue-900 px-5 py-3 rounded-xl font-bold"
              >
                Manage Supports
              </button>

              <button
                onClick={openQuickAdd}
                className="bg-yellow-400 text-blue-950 px-5 py-3 rounded-xl font-bold"
              >
                + Quick Add
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

        {showGroups && (
          <section className="bg-white border-2 border-blue-300 rounded-3xl p-6 md:p-8 mb-7">

            <div className="flex justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-blue-900">
                  Saved Groups
                </h2>

                <p className="text-gray-600 mt-1">
                  Create reusable student groups.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowGroups(false);
                  resetGroupForm();
                }}
                className="font-bold text-gray-500"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-7">

              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  Group Name
                </label>

                <input
                  value={groupName}
                  onChange={(e) =>
                    setGroupName(
                      e.target.value
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                  placeholder="Example: Math Group 1"
                />

                <p className="font-bold text-blue-900 mt-5 mb-3">
                  Students
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                  {students.map(
                    (student) => (
                      <label
                        key={
                          student.id
                        }
                        className="border border-blue-200 rounded-xl p-3 flex items-center gap-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={groupStudentIds.includes(
                            student.id
                          )}
                          onChange={() =>
                            toggleGroupStudent(
                              student.id
                            )
                          }
                        />

                        <span>
                          {
                            student.displayName
                          }
                        </span>
                      </label>
                    )
                  )}
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={saveGroup}
                    className="bg-blue-900 text-white rounded-xl px-6 py-3 font-bold"
                  >
                    {editingGroupId
                      ? "Update Group"
                      : "Save Group"}
                  </button>

                  {editingGroupId && (
                    <button
                      onClick={
                        resetGroupForm
                      }
                      className="border-2 border-gray-300 rounded-xl px-6 py-3 font-bold"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {groupMessage && (
                  <p className="mt-4 font-semibold">
                    {groupMessage}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-xl font-bold text-blue-900 mb-4">
                  Your Groups
                </h3>

                <div className="space-y-4">
                  {savedGroups.map(
                    (group) => (
                      <div
                        key={
                          group.id
                        }
                        className="border-2 border-blue-200 rounded-2xl p-4"
                      >
                        <h4 className="font-bold text-lg">
                          {
                            group.name
                          }
                        </h4>

                        <p className="text-sm text-gray-600 mt-2">
                          {students
                            .filter(
                              (
                                student
                              ) =>
                                group.studentIds.includes(
                                  student.id
                                )
                            )
                            .map(
                              (
                                student
                              ) =>
                                student.displayName
                            )
                            .join(
                              ", "
                            )}
                        </p>

                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() =>
                              editGroup(
                                group
                              )
                            }
                            className="text-blue-700 font-bold underline"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              deleteGroup(
                                group
                              )
                            }
                            className="text-red-600 font-bold underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

            </div>
          </section>
        )}

        {showSupports && (
          <section className="bg-white border-2 border-amber-300 rounded-3xl p-6 md:p-8 mb-7">

            <div className="flex justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-blue-900">
                  Supports & Rewards
                </h2>

                <p className="text-gray-600 mt-1">
                  Add individualized supports that repeat automatically each day or week.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowSupports(false);
                  resetSupportForm();
                }}
                className="font-bold text-gray-500"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid xl:grid-cols-2 gap-8">

              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  Student
                </label>

                <select
                  value={supportStudentId}
                  onChange={(e) => setSupportStudentId(e.target.value)}
                  className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                >
                  <option value="">Choose a student</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.displayName}
                    </option>
                  ))}
                </select>

                <label className="block font-bold text-blue-900 mt-5 mb-2">
                  Support / Reward Name
                </label>

                <input
                  value={supportName}
                  onChange={(e) => setSupportName(e.target.value)}
                  placeholder="Example: Sensory Walks"
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />

                <label className="block font-bold text-blue-900 mt-5 mb-2">
                  Type
                </label>

                <select
                  value={supportType}
                  onChange={(e) =>
                    setSupportType(
                      e.target.value as "dailyAllowance" | "weeklyGoal"
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                >
                  <option value="dailyAllowance">Daily Allowance</option>
                  <option value="weeklyGoal">Weekly Goal / Reward</option>
                </select>

                <label className="block font-bold text-blue-900 mt-5 mb-2">
                  {supportType === "dailyAllowance"
                    ? "How many are allowed each day?"
                    : "How many times should they complete it this week?"}
                </label>

                <input
                  type="number"
                  min={1}
                  max={20}
                  value={supportTarget}
                  onChange={(e) =>
                    setSupportTarget(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />

                <label className="block font-bold text-blue-900 mt-5 mb-2">
                  Requirement / Description
                  <span className="font-normal text-gray-500"> — optional</span>
                </label>

                <textarea
                  value={supportDescription}
                  onChange={(e) => setSupportDescription(e.target.value)}
                  placeholder={
                    supportType === "dailyAllowance"
                      ? "Example: Use when you need a movement break."
                      : "Example: Turn in your planner each school day."
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black min-h-24"
                />

                {supportType === "weeklyGoal" && (
                  <>
                    <label className="block font-bold text-blue-900 mt-5 mb-2">
                      Reward
                      <span className="font-normal text-gray-500"> — optional</span>
                    </label>

                    <input
                      value={supportReward}
                      onChange={(e) => setSupportReward(e.target.value)}
                      placeholder="Example: Pick from the prize box"
                      className="w-full border-2 border-yellow-200 rounded-xl p-3 text-black"
                    />
                  </>
                )}

                <div className="mt-5 space-y-3">
                  <label className="flex items-center gap-3 bg-blue-50 rounded-xl p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={supportStudentCanTrack}
                      onChange={(e) => setSupportStudentCanTrack(e.target.checked)}
                    />
                    <span className="font-bold text-blue-900">
                      Student can mark their own progress
                    </span>
                  </label>

                  <label className="flex items-center gap-3 bg-green-50 rounded-xl p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={supportActive}
                      onChange={(e) => setSupportActive(e.target.checked)}
                    />
                    <span className="font-bold text-blue-900">
                      Active
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-3 mt-5">
                  <button
                    onClick={saveSupport}
                    className="bg-blue-900 text-white rounded-xl px-6 py-3 font-bold"
                  >
                    {editingSupportId ? "Update Support" : "Save Support"}
                  </button>

                  {editingSupportId && (
                    <button
                      onClick={resetSupportForm}
                      className="border-2 border-gray-300 rounded-xl px-6 py-3 font-bold"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                {supportMessage && (
                  <p className="mt-4 font-semibold text-blue-900">
                    {supportMessage}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-xl font-bold text-blue-900 mb-4">
                  Current Supports
                </h3>

                {supports.length === 0 ? (
                  <div className="border-2 border-dashed border-amber-200 rounded-2xl p-6 text-center text-gray-500">
                    No supports have been added yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {supports
                      .slice()
                      .sort((a, b) => {
                        const studentA =
                          students.find((student) => student.id === a.studentId)
                            ?.displayName || "";
                        const studentB =
                          students.find((student) => student.id === b.studentId)
                            ?.displayName || "";

                        return studentA.localeCompare(studentB) ||
                          a.name.localeCompare(b.name);
                      })
                      .map((support) => {
                        const studentName =
                          students.find(
                            (student) => student.id === support.studentId
                          )?.displayName || "Student";

                        return (
                          <div
                            key={support.id}
                            className={`border-2 rounded-2xl p-4 ${
                              support.active
                                ? "border-amber-200 bg-white"
                                : "border-gray-200 bg-gray-50 opacity-70"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-blue-700">
                                  {studentName}
                                </p>

                                <h4 className="text-lg font-bold text-blue-950">
                                  {support.name}
                                </h4>

                                <p className="text-sm text-gray-600 mt-1">
                                  {support.type === "dailyAllowance"
                                    ? `${support.target} per day`
                                    : `${support.target} times per week`}
                                </p>

                                {support.description && (
                                  <p className="text-sm text-gray-600 mt-2">
                                    {support.description}
                                  </p>
                                )}

                                {support.reward && (
                                  <p className="text-sm font-semibold text-amber-800 mt-2">
                                    Reward: {support.reward}
                                  </p>
                                )}

                                <div className="flex flex-wrap gap-2 mt-3">
                                  <span className="text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-1 font-bold">
                                    {support.studentCanTrack
                                      ? "Student tracks"
                                      : "Teacher tracks"}
                                  </span>
                                  <span
                                    className={`text-xs rounded-full px-2 py-1 font-bold ${
                                      support.active
                                        ? "bg-green-100 text-green-800"
                                        : "bg-gray-200 text-gray-700"
                                    }`}
                                  >
                                    {support.active ? "Active" : "Inactive"}
                                  </span>
                                </div>
                              </div>

                              <div className="w-full sm:w-auto min-w-[250px]">
                                {(() => {
                                  const progress = getCurrentSupportProgress(support);
                                  const count = progress?.count || 0;
                                  const remaining = Math.max(0, support.target - count);
                                  const complete = count >= support.target;

                                  return (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3">
                                      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                                        {support.type === "dailyAllowance"
                                          ? "Today's Progress"
                                          : "This Week's Progress"}
                                      </p>

                                      <p className="text-lg font-bold text-blue-950 mt-1">
                                        {support.type === "dailyAllowance"
                                          ? `${count} used / ${support.target} allowed`
                                          : `${count} / ${support.target} complete`}
                                      </p>

                                      {support.type === "dailyAllowance" && (
                                        <p className="text-sm text-gray-600 mt-1">
                                          {remaining} remaining today
                                        </p>
                                      )}

                                      {complete && support.type === "weeklyGoal" && (
                                        <p className="text-sm font-bold text-green-700 mt-1">
                                          ✓ Goal reached
                                        </p>
                                      )}

                                      <div className="flex flex-wrap gap-2 mt-3">
                                        <button
                                          onClick={() => changeTeacherSupportProgress(support, -1)}
                                          disabled={count === 0 || supportUpdatingId === support.id}
                                          className="bg-white border-2 border-amber-300 text-blue-900 rounded-lg px-3 py-2 font-bold disabled:opacity-40"
                                        >
                                          −1
                                        </button>

                                        <button
                                          onClick={() => changeTeacherSupportProgress(support, 1)}
                                          disabled={complete || supportUpdatingId === support.id}
                                          className="bg-blue-900 text-white rounded-lg px-3 py-2 font-bold disabled:opacity-40"
                                        >
                                          +1
                                        </button>

                                        <button
                                          onClick={() => resetTeacherSupportProgress(support)}
                                          disabled={count === 0 || supportUpdatingId === support.id}
                                          className="bg-white border-2 border-gray-300 text-gray-700 rounded-lg px-3 py-2 font-bold disabled:opacity-40"
                                        >
                                          {support.type === "dailyAllowance"
                                            ? "Reset Today"
                                            : "Reset Week"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="flex flex-wrap gap-3">
                                <button
                                  onClick={() => editSupport(support)}
                                  className="text-blue-700 font-bold underline"
                                >
                                  Edit
                                </button>

                                <button
                                  onClick={() => toggleSupportActive(support)}
                                  className={`font-bold underline ${
                                    support.active ? "text-red-600" : "text-green-700"
                                  }`}
                                >
                                  {support.active ? "Deactivate" : "Reactivate"}
                                </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

            </div>
          </section>
        )}

        {showForm && (
          <section className="bg-white border-2 border-yellow-300 rounded-3xl p-6 md:p-8 mb-7">

            <div className="flex justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-blue-900">
                  {editingItemId
                    ? "Edit Planner Item"
                    : "Add Planner Item"}
                </h2>

                <p className="text-gray-600 mt-1">
                  {editingItemId
                    ? "Changes will also update the linked student assignment."
                    : "Plan for yourself and optionally create the student assignment at the same time."}
                </p>
              </div>

              <button
                onClick={closeForm}
                className="text-gray-500 font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-5">

              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  Title
                </label>

                <input
                  value={title}
                  onChange={(e) =>
                    setTitle(
                      e.target.value
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />
              </div>

              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  Subject
                </label>

                <select
                  value={subject}
                  onChange={(e) =>
                    setSubject(
                      e.target.value
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                >
                  {SUBJECTS.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <label className="block font-bold text-blue-900 mb-2">
                Description{" "}
                <span className="font-normal text-gray-500">
                  — optional
                </span>
              </label>

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                className="w-full border-2 border-blue-200 rounded-xl p-3 text-black min-h-24"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-5 mt-5">

              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  Planner Day
                </label>

                <input
                  type="date"
                  value={plannerDate}
                  onChange={(e) =>
                    setPlannerDate(
                      e.target.value
                    )
                  }
                  className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                />
              </div>

              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  Teacher Prep Notes
                </label>

                <textarea
                  value={prepNotes}
                  onChange={(e) =>
                    setPrepNotes(
                      e.target.value
                    )
                  }
                  className="w-full border-2 border-yellow-200 rounded-xl p-3 text-black min-h-24"
                />
              </div>

            </div>

            <label className="mt-5 bg-yellow-50 border border-yellow-200 rounded-2xl p-5 flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prepComplete}
                onChange={(e) =>
                  setPrepComplete(
                    e.target.checked
                  )
                }
              />

              <span className="font-bold text-blue-900">
                This item is prepped
              </span>
            </label>

            {!editingItemId && (
              <label className="mt-5 bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    createStudentAssignment
                  }
                  onChange={(e) =>
                    setCreateStudentAssignment(
                      e.target.checked
                    )
                  }
                />

                <span className="font-bold text-blue-900">
                  Create a student assignment too
                </span>
              </label>
            )}

            {createStudentAssignment && (
              <>
                <div className="mt-5">
                  <label className="block font-bold text-blue-900 mb-2">
                    Due Date
                  </label>

                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) =>
                      setDueDate(
                        e.target.value
                      )
                    }
                    className="w-full border-2 border-blue-200 rounded-xl p-3 text-black"
                  />
                </div>

                <div className="mt-6">
                  <p className="font-bold text-blue-900 mb-3">
                    Assign To
                  </p>

                  <div className="flex flex-wrap gap-3">

                    {[
                      ["all", "Whole Class"],
                      [
                        "selected",
                        "Selected Students",
                      ],
                      [
                        "group",
                        "Saved Group",
                      ],
                    ].map(
                      ([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setAssignTo(
                              value as
                                | "all"
                                | "selected"
                                | "group"
                            )
                          }
                          className={`px-5 py-3 rounded-xl border-2 font-bold ${
                            assignTo ===
                            value
                              ? "bg-blue-900 text-white border-blue-900"
                              : "bg-white text-blue-900 border-blue-200"
                          }`}
                        >
                          {label}
                        </button>
                      )
                    )}

                  </div>
                </div>

                {assignTo ===
                  "selected" && (
                  <div className="mt-5 grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {students.map(
                      (student) => (
                        <label
                          key={
                            student.id
                          }
                          className="border border-blue-200 rounded-xl p-3 flex gap-3 items-center"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(
                              student.id
                            )}
                            onChange={() =>
                              toggleStudent(
                                student.id
                              )
                            }
                          />

                          {
                            student.displayName
                          }
                        </label>
                      )
                    )}
                  </div>
                )}

                {assignTo ===
                  "group" && (
                  <div className="mt-5">
                    <select
                      value={
                        selectedGroupId
                      }
                      onChange={(e) =>
                        setSelectedGroupId(
                          e.target.value
                        )
                      }
                      className="w-full border-2 border-blue-200 rounded-xl p-3 bg-white text-black"
                    >
                      <option value="">
                        Choose a group
                      </option>

                      {savedGroups.map(
                        (group) => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}
              </>
            )}

            <button
              onClick={savePlannerItem}
              disabled={saving}
              className="mt-7 bg-yellow-400 text-blue-950 rounded-xl px-7 py-3 font-bold disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingItemId
                ? "Save Changes"
                : "Add to Planner"}
            </button>

            {message && (
              <p className="mt-5 font-semibold text-blue-900">
                {message}
              </p>
            )}

          </section>
        )}

        <section className="bg-white rounded-3xl border border-blue-200 p-5 md:p-6">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-blue-900">
                Weekly Planner
              </h2>

              <p className="text-gray-600">
                {formatWeekRange(
                  weekStart
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={
                  previousWeek
                }
                className="border-2 border-blue-200 rounded-xl px-4 py-2 font-bold"
              >
                ← Previous
              </button>

              <button
                onClick={
                  currentWeek
                }
                className="border-2 border-yellow-300 bg-yellow-50 rounded-xl px-4 py-2 font-bold"
              >
                This Week
              </button>

              <button
                onClick={
                  nextWeek
                }
                className="border-2 border-blue-200 rounded-xl px-4 py-2 font-bold"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1150px]">

              <div className="grid grid-cols-5 gap-3 mb-3">
                {weekDays.map(
                  (day) => (
                    <div
                      key={
                        day.dateString
                      }
                      className="bg-blue-900 text-white rounded-2xl p-4 text-center"
                    >
                      <p className="font-bold text-lg">
                        {day.name}
                      </p>

                      <p className="text-sm">
                        {formatShortDate(
                          day.date
                        )}
                      </p>
                    </div>
                  )
                )}
              </div>

              {Array.from({
                length: maxRows,
              }).map(
                (_, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="grid grid-cols-5 gap-3 mb-3"
                  >
                    {weekDays.map(
                      (day) => {
                        const item =
                          itemsByDay[
                            day
                              .dateString
                          ]?.[
                            rowIndex
                          ];

                        if (!item) {
                          return (
                            <div
                              key={
                                day.dateString
                              }
                              className="min-h-40 border-2 border-dashed border-blue-100 rounded-2xl"
                            />
                          );
                        }

                        return (
                          <div
                            key={
                              item.id
                            }
                            className="min-h-40 bg-white border-2 border-blue-200 rounded-2xl p-4"
                          >
                            <div className="flex flex-wrap gap-2">
                              <span className="text-xs font-bold text-blue-700">
                                {
                                  item.subject
                                }
                              </span>

                              <span
                                className={`text-xs rounded-full px-2 py-1 font-bold ${
                                  item.prepComplete
                                    ? "bg-green-100 text-green-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {item.prepComplete
                                  ? "✓ Prepped"
                                  : "Needs Prep"}
                              </span>
                            </div>

                            <h3 className="font-bold text-blue-950 mt-2">
                              {
                                item.title
                              }
                            </h3>

                            {item.createStudentAssignment && (
                              <p className="text-xs text-gray-500 mt-2">
                                {
                                  item.audienceLabel
                                }{" "}
                                • Due{" "}
                                {formatDateLabel(
                                  item.dueDate
                                )}
                              </p>
                            )}

                            {item.prepNotes && (
                              <div className="bg-yellow-50 rounded-xl p-2 mt-3 text-sm">
                                {
                                  item.prepNotes
                                }
                              </div>
                            )}

                            <label className="flex gap-2 items-center mt-4 text-sm font-bold">
                              <input
                                type="checkbox"
                                checked={
                                  item.prepComplete
                                }
                                onChange={() =>
                                  togglePrep(
                                    item
                                  )
                                }
                              />
                              Prepped
                            </label>

                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() =>
                                  openEdit(
                                    item
                                  )
                                }
                                className="text-blue-700 text-sm font-bold underline"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() =>
                                  archivePlannerItem(
                                    item
                                  )
                                }
                                className="text-red-600 text-sm font-bold underline"
                              >
                                Archive
                              </button>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )
              )}

              <div className="grid grid-cols-5 gap-3 mt-4">
                {weekDays.map(
                  (day) => (
                    <button
                      key={
                        day.dateString
                      }
                      onClick={() =>
                        openAddForDay(
                          day.dateString
                        )
                      }
                      className="border-2 border-dashed border-yellow-400 bg-yellow-50 text-blue-900 rounded-2xl p-4 font-bold"
                    >
                      + Add to{" "}
                      {day.name}
                    </button>
                  )
                )}
              </div>

            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

function sameIds(
  first: string[],
  second: string[]
) {
  if (
    first.length !== second.length
  ) {
    return false;
  }

  const firstSorted = [
    ...first,
  ].sort();

  const secondSorted = [
    ...second,
  ].sort();

  return firstSorted.every(
    (value, index) =>
      value ===
      secondSorted[index]
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

function formatDateForInput(
  date: Date
) {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(
  date: Date
) {
  return date.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    }
  );
}

function formatWeekRange(
  monday: Date
) {
  const friday =
    new Date(monday);

  friday.setDate(
    friday.getDate() + 4
  );

  return `${monday.toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
    }
  )} – ${friday.toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  )}`;
}

function formatDateLabel(
  dateString: string
) {
  if (!dateString) {
    return "";
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