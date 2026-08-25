"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Home() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function nameToLogin(studentName: string) {
    return studentName
      .toLowerCase()
      .trim()
      .replace(/\./g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleLogin() {
    setMessage("");

    const cleanName = name.trim();
    const cleanPin = pin.trim();

    if (!cleanName || !cleanPin) {
      setMessage("Enter your name and PIN.");
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      setMessage("Your PIN should be 4 numbers.");
      return;
    }

    try {
      setLoading(true);

      const loginName = nameToLogin(cleanName);

      const hiddenEmail =
        `${loginName}@hawktrack.local`;

      const hiddenPassword =
        `Hawk!${cleanPin}`;

      await signInWithEmailAndPassword(
        auth,
        hiddenEmail,
        hiddenPassword
      );

      router.push("/student");
    } catch (error) {
      console.error(error);
      setMessage("Your name or PIN is incorrect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8 border-4 border-yellow-300">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-900">
            HawkTrack
          </h1>

          <p className="text-gray-600 mt-2">
            Keep track. Get it done. Go Hawks!
          </p>
        </div>

        <label className="block font-semibold mb-2 text-blue-900">
          Your Name
        </label>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Example: Bennett"
          className="w-full border-2 border-blue-200 rounded-xl p-3 mb-5 text-black"
        />

        <label className="block font-semibold mb-2 text-blue-900">
          4-Digit PIN
        </label>

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
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
          {loading ? "Opening..." : "Open My HawkTrack"}
        </button>

        {message && (
          <p className="text-center mt-5 font-medium text-red-600">
            {message}
          </p>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Forgot your PIN? Ask Ms. Flory.
        </p>

      </div>
    </main>
  );
}