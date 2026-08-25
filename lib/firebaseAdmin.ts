import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {
  getAuth,
} from "firebase-admin/auth";

import {
  getFirestore,
} from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID;

const clientEmail =
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

const privateKey =
  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

if (!projectId) {
  throw new Error(
    "Missing FIREBASE_ADMIN_PROJECT_ID"
  );
}

if (!clientEmail) {
  throw new Error(
    "Missing FIREBASE_ADMIN_CLIENT_EMAIL"
  );
}

if (!privateKey) {
  throw new Error(
    "Missing FIREBASE_ADMIN_PRIVATE_KEY"
  );
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

export const adminAuth =
  getAuth(adminApp);

export const adminDb =
  getFirestore(adminApp);