/**
 * User equipment photo upload — mirrors mobile `userEquipment.ts`.
 * Storage path: users/{uid}/equipment/{equipmentId}/photo_*
 */
import {
  getStorageInstance,
  ref,
  uploadBytes,
  getDownloadURL,
} from "@/lib/firebase";
import { deleteObject } from "firebase/storage";

export async function uploadUserEquipmentPhoto(
  uid: string,
  equipmentId: string,
  file: File,
  mimeType = "image/jpeg"
): Promise<{ photoUrl: string; photoPath: string }> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Storage unavailable");

  const ext = mimeType.includes("png") ? "png" : "jpg";
  const storagePath = `users/${uid}/equipment/${equipmentId}/photo_${Date.now()}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mimeType });
  const photoUrl = await getDownloadURL(storageRef);
  return { photoUrl, photoPath: storagePath };
}

export async function removeUserEquipmentPhoto(photoPath: string): Promise<void> {
  const storage = getStorageInstance();
  if (!storage || !photoPath) return;
  try {
    await deleteObject(ref(storage, photoPath));
  } catch {
    /* ignore missing files */
  }
}
