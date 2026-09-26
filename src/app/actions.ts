"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { undoEvent } from "@/lib/audit";
import { authProvider } from "@/lib/auth-mode";
import { getCurrentUser, login } from "@/lib/auth";
import { demoLoginEnabled } from "@/lib/demo-login";
import {
  LOGIN_GENERIC_ERROR,
  LOGIN_RATE_LIMIT_ERROR,
  clearLoginFailures,
  clientIp,
  isLoginRateLimited,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { safeNext } from "@/lib/safe-next";
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
  parseAddonDays,
  parseDetoxDays,
} from "@/lib/pipeline";
import { PIPELINE_STAGES, isCurrentLeadSource, isLeadSource, isNotConvertedReason } from "@/lib/labels";
import {
  COMMERCIAL_ADDONS,
  COMMERCIAL_CHECKLIST,
  CONTACT_METHODS,
  CURRENCIES,
  DOCUMENT_KINDS,
  FUNDING_TYPES,
  HOUSES,
  TRANSFER_EXTENSION_STATUSES,
  type ContactMethod,
  type Currency,
  type DocumentKind,
  type FundingType,
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

function actorLabel(name: string) {
  const first = name.trim().split(/\s+/)[0] || name;
  return first;
}

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const email = formString(formData, "email");
  const password = formString(formData, "password");
  const nextPath = safeNext(formString(formData, "next"));
  const demoHints = authProvider() === "demo" && demoLoginEnabled();
  const ip = clientIp(await headers());
  if (isLoginRateLimited(ip, email)) {
    return { error: LOGIN_RATE_LIMIT_ERROR };
  }
  try {
    const result = await login(email, password);
    if (!result.ok) {
      if (result.reason === "password_disabled") {
        return { error: "Password sign-in is turned off. Use Sign in with Microsoft." };
      }
      if (result.reason === "breakglass_only") {
        return {
          error: "Password sign-in is only for Vincent and Morgane while Microsoft and passwords are both on. Use Sign in with Microsoft.",
        };
      }
      if (result.reason === "not_configured") {
        return { error: "Microsoft sign-in is not configured." };
      }
      recordLoginFailure(ip, email);
      return {
        error: demoHints ? "Check the email and password. Demo password is liberty." : LOGIN_GENERIC_ERROR,
      };
    }
    clearLoginFailures(ip, email);
  } catch {
    return {
      error: demoHints
        ? "Sign-in could not finish. Try again — demo password is liberty."
        : "Sign-in could not finish. Try again.",
    };
  }
  redirect(nextPath);
}

export async function logoutAction() {
  redirect("/api/auth/logout");
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
  const funding = formString(formData, "funding_type") as FundingType;
  const currency = formString(formData, "currency") as Currency;
  const contact = formString(formData, "contact_method") as ContactMethod;
  const pref = formString(formData, "house_preference");
  const addonPatch = Object.fromEntries(
    COMMERCIAL_ADDONS.map((item) => [item.key, formData.get(item.key) === "1" ? 1 : 0]),
  );
  const nursingOn = formData.get("addon_nursing_medical_admission") === "1";
  const detoxOvernightOn = formData.get("addon_detox_overnight") === "1";
  const nursingDays = nursingOn ? parseAddonDays(formString(formData, "addon_nursing_days")) : 0;
  const detoxOvernightDays = detoxOvernightOn ? parseAddonDays(formString(formData, "addon_detox_overnight_days")) : 0;
  if (nursingDays == null || detoxOvernightDays == null) {
    redirect(`/people/${id}?error=${encodeURIComponent("Choose a number of days from 1 to 14, or leave days unset.")}`);
  }
  const reason = formString(formData, "not_converted_reason");
  if (reason && !isNotConvertedReason(reason)) {
    redirect(`/people/${id}?error=${encodeURIComponent("Choose a reason for not converting from the list.")}`);
  }
  const detoxOn = formData.get("detox_first") === "1";
  let detoxDays = 0;
  if (detoxOn) {
    const parsed = parseDetoxDays(formString(formData, "expected_detox_nights"));
    if (parsed == null) {
      redirect(`/people/${id}?error=${encodeURIComponent("Choose how many detox days (1–5).")}`);
    }
    detoxDays = parsed;
  }
  const result = applyPersonPatch(
    id,
    {
      first_name: formString(formData, "first_name"),
      last_name: formString(formData, "last_name"),
      preferred_name: formString(formData, "preferred_name"),
      caller_name: formString(formData, "caller_name"),
      resident_name: formString(formData, "resident_name"),
      email: formString(formData, "email"),
      phone: formString(formData, "phone"),
      contact_method: CONTACT_METHODS.includes(contact) ? contact : "",
      assigned_to_user_id: formString(formData, "assigned_to_user_id"),
      counsellor_user_id: formString(formData, "counsellor_user_id"),
      referral_owner_user_id: formString(formData, "referral_owner_user_id"),
      referrer_name: formString(formData, "referrer_name"),
      referrer_contact_person: formString(formData, "referrer_contact_person"),
      referrer_phone: formString(formData, "referrer_phone"),
      next_of_kin_name: formString(formData, "next_of_kin_name"),
      next_of_kin_phone: formString(formData, "next_of_kin_phone"),
      arp_email: formString(formData, "arp_email"),
      funding_type: FUNDING_TYPES.includes(funding) ? funding : "private",
      funding_notes: formString(formData, "funding_notes"),
      currency: CURRENCIES.includes(currency) ? currency : "ZAR",
      expected_arrival: formString(formData, "expected_arrival"),
      admission_date: formString(formData, "admission_date"),
      planned_discharge_date: formString(formData, "planned_discharge_date"),
      house_preference: pref === "manor" || pref === "lodge" || pref === "either" ? pref : "",
      commercial_notes: formString(formData, "commercial_notes"),
      not_converted_reason: isNotConvertedReason(reason) ? reason : "",
      assessment_details: formString(formData, "assessment_details"),
      assessment_notes: formString(formData, "assessment_notes"),
      ...addonPatch,
      addon_nursing_medical_admission: nursingOn ? 1 : 0,
      addon_nursing_days: nursingDays,
      addon_detox_overnight: detoxOvernightOn ? 1 : 0,
      addon_detox_overnight_days: detoxOvernightDays,
      ...(detoxOvernightOn ? {} : { addon_overnight_supervision: 0 }),
      detox_first: detoxOn ? 1 : 0,
      expected_detox_nights: detoxDays,
    },
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
