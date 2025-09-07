import admin from "firebase-admin";

const app = admin.initializeApp({ projectId: "gad-family-us" });
const db = admin.firestore();

const fid = "family_1";
const ownerUid = "owner_123";
const childUid = "child_001";

await db.collection("families").doc(fid).set({
  ownerUid, name: "GAD Family"
});

await db.collection("families").doc(fid).collection("members").doc(childUid).set({
  dob: "2010-05-12",
  age: 14,
  isAdult: false,
  ageVerifiedByOwner: true,
  geoEnabled: true,
  displayName: "Daughter"
});

await db.collection("users").doc(ownerUid).set({
  familyId: fid,
  displayName: "Dad",
  fcmTokens: []
});

await db.collection("users").doc(childUid).set({
  familyId: fid,
  displayName: "Daughter",
  fcmTokens: []
});

console.log("Seed done");
process.exit(0);
