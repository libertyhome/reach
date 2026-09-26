"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { undoEvent } from "@/lib/audit";
import { getCurrentUser, login, logout } from "@/lib/auth";
import { buildCommercialDetailsPatch } from "@/lib/commercial-details";
import { sendPersonToWithin } from "@/lib/within-send";
import { deletePersonDocument, savePersonDocument } from "@/lib/documents";
import { getPerson } from "@/lib/people";
import {
  archivePerson,
  assignHouse,
  confirmAdmit,
  createEnquiry,
  moveStage,
  saveRoomPreference,
  updateLeadSource,
  applyPersonPatch,
} from "@/lib/pipeline";
import { PIPELINE_STAGES, isCurrentLeadSource, isLeadSource, isNotConvertedReason } from "@/lib/labels";
import {
  COMMERCIAL_CHECKLIST,
  CONTACT_METHODS,
  DOCUMENT_KINDS,
  HOUSES,
  TRANSFER_EXTENSION_STATUSES,
  type ContactMethod,
  type DocumentKind,
  type House,
  type RoomPrivacy,
  type Stage,
  type TransferExtensionStatus,
} from "@/lib/types";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function afterChange(personId: string, eventId: string, fallback = `/people/${personId}`) {
  revalidatePath("/");
  redirect(`${fallback}?undo=${eventId}`);
}

function safeNext(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/login")) {
    return "/enquiries";
  }
  return value;
}

function actorLabel(name: string) {
  const first = name.trim().split(/\s+/)[0] || name;
  return first;
}

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const email = formString(formData, "email");
  const password = formString(formData, "password");
  const nextPath = safeNext(formString(formData, "next"));
  try {
    const user = await login(email, password);
    if (!user) return { error: "Check the email and password. Demo password is liberty." };
  } catch {
    return { error: "Sign-in could not finish. Try again — demo password is liberty." };
  }
  redirect(nextPath);
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function createEnquiryAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const source = formString(formData, "lead_source");
  if (!isCurrentLeadSource(source)) {
    redirect(`/enquiries/new?error=${encodeURIComponent("Choose a lead source.")}`);
  }
  const contact = formString(formData, "contact_method") as ContactMethod;
  const { person, event } = createEnquiry(
    {
      first_name: formString(formData, "first_name"),
      last_name: formString(formData, "last_name"),
      preferred_name: formString(formData, "preferred_name"),
      caller_name: formString(formData, "caller_name"),
      resident_name: formString(formData, "resident_name"),
      email: formString(formData, "email"),
      phone: formString(formData, "phone"),
      lead_source: source,
      lead_source_note: formString(formData, "lead_source_note"),
      lead_source_who: formString(formData, "lead_source_who"),
      contact_method: CONTACT_METHODS.includes(contact) ? contact : "phone",
      assigned_to_user_id: formString(formData, "assigned_to_user_id") || user.id,
      referral_owner_user_id: formString(formData, "referral_owner_user_id") || user.id,
      referrer_name: formString(formData, "referrer_name"),
      referrer_contact_person: formString(formData, "referrer_contact_person"),
      referrer_phone: formString(formData, "referrer_phone"),
      commercial_notes: formString(formData, "commercial_notes"),
    },
    user,
  );
  afterChange(person.id, event.id, "/enquiries");
}

export async function updateFieldsAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const built = buildCommercialDetailsPatch(formData);
  if (!built.ok) redirect(`/people/${id}?error=${encodeURIComponent(built.error)}`);
  const result = applyPersonPatch(
    id,
    built.patch,
    user,
    "field_edit",
    `Updated commercial details — ${actorLabel(user.name)}`,
  );
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function updateLeadSourceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const source = formString(formData, "lead_source");
  if (!isLeadSource(source)) {
    redirect(`/people/${id}?error=${encodeURIComponent("Choose a lead source.")}`);
  }
  const result = updateLeadSource(
    id,
    source,
    formString(formData, "lead_source_note"),
    user,
    formString(formData, "lead_source_who"),
  );
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function updateChecklistAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const box = (key: string) => (formData.get(key) === "1" ? 1 : 0);
  const checklistPatch = Object.fromEntries(COMMERCIAL_CHECKLIST.map((item) => [item.key, box(item.key)]));
  const result = applyPersonPatch(
    id,
    checklistPatch,
    user,
    "field_edit",
    `Updated admissions checklist — ${actorLabel(user.name)}`,
  );
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function updateTransferExtensionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const statusRaw = formString(formData, "transfer_extension_status") as TransferExtensionStatus;
  const status = TRANSFER_EXTENSION_STATUSES.includes(statusRaw) ? statusRaw : "";
  const result = applyPersonPatch(
    id,
    {
      transfer_extension_status: status,
      transfer_extension_notes: formString(formData, "transfer_extension_notes"),
    },
    user,
    "field_edit",
    `Updated transfers & extensions — ${actorLabel(user.name)}`,
  );
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function moveStageAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const stage = formString(formData, "stage") as Stage;
  if (!PIPELINE_STAGES.includes(stage)) {
    redirect(`/people/${id}?error=${encodeURIComponent("Unknown stage.")}`);
  }
  const result = moveStage(id, stage, user);
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function assignHouseAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const mode = formString(formData, "mode");
  const privacyRaw = formString(formData, "room_privacy");
  const roomPrivacy: RoomPrivacy =
    privacyRaw === "shared" || privacyRaw === "private" ? privacyRaw : "";

  if (mode === "preference") {
    const prefRaw = formString(formData, "house_preference");
    const housePreference =
      prefRaw === "manor" || prefRaw === "lodge" || prefRaw === "either" ? prefRaw : "";
    const result = saveRoomPreference(
      id,
      housePreference,
      formString(formData, "preferred_room_id"),
      roomPrivacy,
      user,
    );
    if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
    afterChange(id, result.event.id);
  }

  const houseRaw = formString(formData, "house");
  const house = HOUSES.includes(houseRaw as House) ? (houseRaw as House) : "";
  const result = assignHouse(id, house, formString(formData, "room_id"), user, roomPrivacy);
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function archiveAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const person = getPerson(id);
  const reason = formString(formData, "not_converted_reason");
  if (person && person.stage !== "resident" && !isNotConvertedReason(reason)) {
    redirect(`/people/${id}?error=${encodeURIComponent("Choose a reason for not converting.")}`);
  }
  const result = archivePerson(id, user, reason);
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  afterChange(id, result.event.id);
}

export async function confirmAdmitAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const result = confirmAdmit(id, formString(formData, "room_id"), formString(formData, "admission_kind"), user, {
    manorPhase: formString(formData, "manor_phase"),
    counsellorUserId: formString(formData, "counsellor_user_id"),
    admissionDate: formString(formData, "admission_date"),
    plannedDischargeDate: formString(formData, "planned_discharge_date"),
    detoxFirst: formString(formData, "detox_first"),
    expectedDetoxNights: formString(formData, "expected_detox_nights"),
  });
  if (!result.ok) redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  const house = result.person.house === "lodge" ? "lodge" : "manor";
  afterChange(id, result.event.id, `/admit/ipad?house=${house}&focus=${id}`);
}

export async function uploadDocumentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const kindRaw = formString(formData, "kind") as DocumentKind;
  const kind = DOCUMENT_KINDS.includes(kindRaw) ? kindRaw : "other";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/people/${id}?error=${encodeURIComponent("Choose a file to upload.")}`);
  }
  if (file.size > 8 * 1024 * 1024) {
    redirect(`/people/${id}?error=${encodeURIComponent("File must be under 8MB.")}`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  savePersonDocument({
    personId: id,
    kind,
    title: formString(formData, "title") || file.name,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    forWithin: formData.get("for_within") === "1",
    uploadedBy: user.id,
  });
  const result = applyPersonPatch(
    id,
    {},
    user,
    "field_edit",
    `Uploaded document for Within handoff — ${actorLabel(user.name)}`,
  );
  // Touch updated_at via a no-op is awkward; write a light commercial_notes-safe audit by patching nothing fails assert? empty patch is ok
  if (!result.ok) {
    revalidatePath(`/people/${id}`);
    redirect(`/people/${id}?notice=${encodeURIComponent("Document saved.")}`);
  }
  // Empty patch still updates updated_at - actually applyPersonPatch with {} is fine
  afterChange(id, result.event.id);
}

export async function deleteDocumentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const docId = formString(formData, "documentId");
  const removed = deletePersonDocument(docId);
  if (!removed.ok) redirect(`/people/${id}?error=${encodeURIComponent(removed.error)}`);
  const result = applyPersonPatch(
    id,
    {},
    user,
    "field_edit",
    `Removed document — ${actorLabel(user.name)}`,
  );
  if (!result.ok) {
    revalidatePath(`/people/${id}`);
    redirect(`/people/${id}`);
  }
  afterChange(id, result.event.id);
}

export async function sendToWithinAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formString(formData, "id");
  const result = await sendPersonToWithin(id, user);
  revalidatePath(`/people/${id}`);
  revalidatePath("/admit");
  if (!result.ok) {
    redirect(`/people/${id}?error=${encodeURIComponent(result.error)}`);
  }
  const notice =
    result.outcome === "already_admitted"
      ? "Already admitted in Within"
      : result.outcome === "updated"
        ? "Updated in Within. Still awaiting admission."
        : "Sent to Within, awaiting admission.";
  redirect(`/people/${id}?notice=${encodeURIComponent(notice)}`);
}

export async function undoAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const eventId = formString(formData, "eventId");
  const result = undoEvent(eventId, user.id);
  if (!result.ok) {
    const personId = getPerson(formString(formData, "id"))?.id;
    redirect(personId ? `/people/${personId}?error=${encodeURIComponent(result.error)}` : "/enquiries");
  }
  revalidatePath("/");
  const person = result.person;
  const dest =
    person.stage === "resident" && person.house === "lodge"
      ? "/lodge"
      : person.stage === "resident"
        ? "/manor"
        : person.stage === "next_steps"
          ? "/next-steps"
          : person.stage === "approval"
            ? "/approval"
            : person.stage === "admit"
              ? "/admit"
              : person.stage === "archived"
                ? `/people/${person.id}`
                : "/enquiries";
  redirect(`${dest}?notice=${encodeURIComponent("Undid the last change.")}&focus=${person.id}`);
}
