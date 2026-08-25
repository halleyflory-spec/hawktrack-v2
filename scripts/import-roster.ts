import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initialRoster } from "../lib/roster";

const serviceAccountPath = path.join(
  process.env.HOME || "",
  "Downloads",
  "hawktrack-v2-firebase-adminsdk-fbsvc-3f9a1222d5.json"
);

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `Service account file not found at: ${serviceAccountPath}`
  );
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
      });

const auth = getAuth(app);

function nameToLogin(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function updateStudentEmails() {
  console.log("Updating HawkTrack student logins...");

  for (const student of initialRoster) {
    const oldEmail =
      `student${student.studentNumber}@hawktrack.local`;

    const newEmail =
      `${nameToLogin(student.displayName)}@hawktrack.local`;

    const user = await auth.getUserByEmail(oldEmail);

    await auth.updateUser(user.uid, {
      email: newEmail,
    });

    console.log(
      `${student.displayName}: ${oldEmail} → ${newEmail}`
    );
  }

  console.log("Student login update complete!");
}

updateStudentEmails()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Update failed:", error);
    process.exit(1);
  });