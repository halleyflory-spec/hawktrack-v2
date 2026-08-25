"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function CheckerLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setMessage("");

    if (!username.trim() || !passcode.trim()) {
      setMessage("Enter the username and passcode.");
      return;
    }

    if (
      username.trim().toLowerCase() !== "checker" ||
      passcode.trim() !== "1510"
    ) {
      setMessage("Username or passcode is incorrect.");
      return;
    }

    try {
      setLoading(true);

      // Hidden Firebase login.
      const credential = await signInWithEmailAndPassword(
        auth,
        "checker@hawktrack.local",
        "Checker1510"
      );

      const checkerSnapshot = await getDoc(
        doc(db, "checkers", credential.user.uid)
      );

      if (
        !checkerSnapshot.exists() ||
        checkerSnapshot.data().active !== true ||
        checkerSnapshot.data().role !== "checker"
      ) {
        await signOut(auth);
        setMessage("This account does not have checker access.");
        return;
      }

      router.push("/checker");
    } catch (error) {
      console.error(error);
      setMessage("HawkTrack couldn't sign in the checker.");
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
            Checker Login
          </h1>

          <p className="text-gray-600 mt-2">
            Assignment checking station
          </p>
        </div>

        <label className="block font-bold text-blue-900 mb-2">
          Username
        </label>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="checker"
          autoCapitalize="none"
          className="w-full border-2 border-blue-200 rounded-xl p-3 mb-5 text-black"
        />

        <label className="block font-bold text-blue-900 mb-2">
          Passcode
        </label>

        <input
          type="password"
          inputMode="numeric"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="••••"
          maxLength={4}
          className="w-full border-2 border-blue-200 rounded-xl p-3 mb-6 text-black"
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
          {loading ? "Opening..." : "Open Checker"}
        </button>

        {message && (
          <p className="text-center mt-5 font-semibold text-red-600">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}