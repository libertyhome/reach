import { parseAddonDays } from "./pipeline";
import { isNotConvertedReason } from "./labels";
import {
  COMMERCIAL_ADDONS,
  CONTACT_METHODS,
  CURRENCIES,
  FUNDING_TYPES,
  type ContactMethod,
  type Currency,
  type FundingType,
  type Person,
} from "./types";

/**
 * Commercial-details save. Does not write detox_first or expected_detox_nights:
 * those stay on the file for Admit and the Within handoff, and this form no longer edits them.
 * Nursing & medical admission is a single day: ticked stores 1, unticked stores 0.
 */
export function buildCommercialDetailsPatch(
  formData: FormData,
): { ok: true; patch: Partial<Person> } | { ok: false; error: string } {
  const funding = String(formData.get("funding_type") ?? "").trim() as FundingType;
  const currency = String(formData.get("currency") ?? "").trim() as Currency;
  const contact = String(formData.get("contact_method") ?? "").trim() as ContactMethod;
  const pref = String(formData.get("house_preference") ?? "").trim();
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const addonPatch = Object.fromEntries(
    COMMERCIAL_ADDONS.map((item) => [item.key, formData.get(item.key) === "1" ? 1 : 0]),
  );
  const nursingOn = formData.get("addon_nursing_medical_admission") === "1";
  const detoxOvernightOn = formData.get("addon_detox_overnight") === "1";
  const detoxOvernightDays = detoxOvernightOn
    ? parseAddonDays(text("addon_detox_overnight_days"))
    : 0;
  if (detoxOvernightDays == null) {
    return { ok: false, error: "Choose a number of days from 1 to 14, or leave days unset." };
  }
  const reason = text("not_converted_reason");
  if (reason && !isNotConvertedReason(reason)) {
    return { ok: false, error: "Choose a reason for not converting from the list." };
  }

  return {
    ok: true,
    patch: {
      first_name: text("first_name"),
      last_name: text("last_name"),
      preferred_name: text("preferred_name"),
      caller_name: text("caller_name"),
      resident_name: text("resident_name"),
      email: text("email"),
      phone: text("phone"),
      contact_method: CONTACT_METHODS.includes(contact) ? contact : "",
      assigned_to_user_id: text("assigned_to_user_id"),
      counsellor_user_id: text("counsellor_user_id"),
      referral_owner_user_id: text("referral_owner_user_id"),
      referrer_name: text("referrer_name"),
      referrer_contact_person: text("referrer_contact_person"),
      referrer_phone: text("referrer_phone"),
      next_of_kin_name: text("next_of_kin_name"),
      next_of_kin_phone: text("next_of_kin_phone"),
      arp_email: text("arp_email"),
      funding_type: FUNDING_TYPES.includes(funding) ? funding : "private",
      funding_notes: text("funding_notes"),
      currency: CURRENCIES.includes(currency) ? currency : "ZAR",
      expected_arrival: text("expected_arrival"),
      admission_date: text("admission_date"),
      planned_discharge_date: text("planned_discharge_date"),
      house_preference: pref === "manor" || pref === "lodge" || pref === "either" ? pref : "",
      commercial_notes: text("commercial_notes"),
      not_converted_reason: isNotConvertedReason(reason) ? reason : "",
      assessment_details: text("assessment_details"),
      assessment_notes: text("assessment_notes"),
      ...addonPatch,
      addon_nursing_medical_admission: nursingOn ? 1 : 0,
      addon_nursing_days: nursingOn ? 1 : 0,
      addon_detox_overnight: detoxOvernightOn ? 1 : 0,
      addon_detox_overnight_days: detoxOvernightDays,
      ...(detoxOvernightOn ? {} : { addon_overnight_supervision: 0 }),
    },
  };
}
