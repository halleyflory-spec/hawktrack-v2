import { NextResponse } from "next/server";
import {
  FieldValue,
} from "firebase-admin/firestore";
import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

export async function POST(
  request: Request
) {
  try {
    // ---------------------------------------
    // 1. VERIFY WHO IS MAKING THE REQUEST
    // ---------------------------------------

    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return NextResponse.json(
        {
          error:
            "You are not signed in.",
        },
        {
          status: 401,
        }
      );
    }

    const idToken =
      authorization.substring(7);

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(
          idToken
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "Your login could not be verified.",
        },
        {
          status: 401,
        }
      );
    }

    const currentTeacherUid =
      decodedToken.uid;

    // ---------------------------------------
    // 2. READ FORM DATA
    // ---------------------------------------

    const body =
      await request.json();

    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";

    const displayName =
      typeof body.displayName ===
      "string"
        ? body.displayName.trim()
        : "";

    const classId =
      typeof body.classId ===
      "string"
        ? body.classId.trim()
        : "";

    if (
      !email ||
      !displayName ||
      !classId
    ) {
      return NextResponse.json(
        {
          error:
            "Name, email, and class are required.",
        },
        {
          status: 400,
        }
      );
    }

    // ---------------------------------------
    // 3. VERIFY CURRENT USER IS A TEACHER
    // ---------------------------------------

    const currentTeacherRef =
      adminDb
        .collection(
          "teachers"
        )
        .doc(
          currentTeacherUid
        );

    const currentTeacherSnap =
      await currentTeacherRef.get();

    if (
      !currentTeacherSnap.exists
    ) {
      return NextResponse.json(
        {
          error:
            "Your teacher account could not be found.",
        },
        {
          status: 403,
        }
      );
    }

    const currentTeacherData =
      currentTeacherSnap.data();

    if (
      currentTeacherData
        ?.active !== true ||
      currentTeacherData
        ?.role !== "teacher"
    ) {
      return NextResponse.json(
        {
          error:
            "Your teacher account is not active.",
        },
        {
          status: 403,
        }
      );
    }

    // ---------------------------------------
    // 4. VERIFY CLASS + OWNERSHIP
    // ---------------------------------------

    const classRef =
      adminDb
        .collection(
          "classes"
        )
        .doc(
          classId
        );

    const classSnap =
      await classRef.get();

    if (
      !classSnap.exists
    ) {
      return NextResponse.json(
        {
          error:
            "That class could not be found.",
        },
        {
          status: 404,
        }
      );
    }

    const classData =
      classSnap.data();

    if (
      classData
        ?.ownerTeacherId !==
      currentTeacherUid
    ) {
      return NextResponse.json(
        {
          error:
            "Only the class owner can add teachers.",
        },
        {
          status: 403,
        }
      );
    }

    // ---------------------------------------
    // 5. FIND OR CREATE FIREBASE AUTH USER
    // ---------------------------------------

    let teacherUser;

    try {
      teacherUser =
        await adminAuth.getUserByEmail(
          email
        );
    } catch (
      error: unknown
    ) {
      const firebaseError =
        error as {
          code?: string;
        };

      if (
        firebaseError.code !==
        "auth/user-not-found"
      ) {
        throw error;
      }

      teacherUser =
        await adminAuth.createUser(
          {
            email,
            displayName,
            emailVerified:
              false,
          }
        );
    }

    const teacherUid =
      teacherUser.uid;

    // ---------------------------------------
    // 6. CREATE / UPDATE TEACHER PROFILE
    // ---------------------------------------

    const teacherRef =
      adminDb
        .collection(
          "teachers"
        )
        .doc(
          teacherUid
        );

    const teacherSnap =
      await teacherRef.get();

    if (
      teacherSnap.exists
    ) {
      const existingData =
        teacherSnap.data();

      if (
        existingData?.role &&
        existingData.role !==
          "teacher"
      ) {
        return NextResponse.json(
          {
            error:
              "That email already belongs to a non-teacher HawkTrack account.",
          },
          {
            status: 409,
          }
        );
      }

      await teacherRef.set(
        {
          displayName,
          role:
            "teacher",
          active:
            true,

          classIds:
            FieldValue.arrayUnion(
              classId
            ),
        },
        {
          merge: true,
        }
      );

      if (
        !existingData
          ?.defaultClassId
      ) {
        await teacherRef.set(
          {
            defaultClassId:
              classId,
          },
          {
            merge: true,
          }
        );
      }
    } else {
      await teacherRef.set(
        {
          displayName,
          role:
            "teacher",
          active:
            true,

          classIds: [
            classId,
          ],

          defaultClassId:
            classId,

          createdAt:
            FieldValue.serverTimestamp(),
        }
      );
    }

    // ---------------------------------------
    // 7. ADD TEACHER TO CLASS
    // ---------------------------------------

    await classRef.update(
      {
        teacherIds:
          FieldValue.arrayUnion(
            teacherUid
          ),
      }
    );

    // ---------------------------------------
    // 8. RETURN SUCCESS
    // ---------------------------------------

    return NextResponse.json(
      {
        success: true,

        teacher: {
          id:
            teacherUid,

          displayName,

          email:
            teacherUser.email ||
            email,
        },
      }
    );
  } catch (error) {
    console.error(
      "Create teacher error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "HawkTrack couldn't add that teacher.",
      },
      {
        status: 500,
      }
    );
  }
}