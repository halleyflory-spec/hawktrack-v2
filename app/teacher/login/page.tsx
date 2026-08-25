"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function TeacherLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // Make sure this account is actually a teacher.
      const teacherRef = doc(
        db,
        "teachers",
        credential.user.uid
      );

      const teacherSnapshot = await getDoc(teacherRef);

      if (!teacherSnapshot.exists()) {
        await signOut(auth);
        setMessage("This account does not have teacher access.");
        return;
      }

      const teacherData = teacherSnapshot.data();

      if (
        teacherData.active !== true ||
        teacherData.role !== "teacher"
      ) {
        await signOut(auth);
        setMessage("This account does not have teacher access.");
        return;
      }

      router.push("/teacher");
    } catch (error) {
      console.error(error);
      setMessage("Email or password is incorrect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8 border-4 border-yellow-300">

        <div className="text-center mb-8">
          <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
            HawkTrack
          </p>

          <h1 className="text-3xl font-bold text-blue-900 mt-1">
            Teacher Login
          </h1>

          <p className="text-gray-600 mt-2">
            Teacher dashboard access
          </p>
        </div>

        <label className="block font-semibold mb-2 text-blue-900">
          Email
        </label>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border-2 border-blue-200 rounded-xl p-3 mb-5 text-black"
          placeholder="Teacher email"
        />

        <label className="block font-semibold mb-2 text-blue-900">
          Password
        </label>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-2 border-blue-200 rounded-xl p-3 mb-6 text-black"
          placeholder="Password"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleLogin();
            }
          }}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-900 text-white rounded-xl p-3 font-bold disabled:opacity-50"
        >
          {loading ? "Signing In..." : "Open Teacher Dashboard"}
        </button>

        {message && (
          <p className="text-center mt-5 font-medium text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}