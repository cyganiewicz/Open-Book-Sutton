// Who may change what. Pure functions so the rules can be tested exhaustively;
// the API layer calls these and never trusts the browser.

import { LOCKED_WHEN_APPROVED, displayYears, planYears, submissionsOpenNow, type CapitalSettings } from "./constants";

export interface Actor {
  kind: "admin" | "staff";
  id: string;
  name: string;
  email: string;
  townId: string;
  departmentIds: string[];
}

export interface ProjectForPerms {
  departmentId: string;
  requestStatus: string;
  years: { fiscalYear: string; approvedAmount: number | null }[];
}

export interface Capabilities {
  isAdmin: boolean;
  canView: boolean;
  /** may change the request's descriptive fields (minus lockedFields) */
  canEditFields: boolean;
  lockedFields: string[];
  /** fiscal years whose amounts this person may change */
  editableYears: string[];
  canSubmit: boolean;
  canResubmit: boolean;
  canWithdraw: boolean;
  /** park a request outside the active plan, and bring it back */
  canDefer: boolean;
  canReactivate: boolean;
  canDelete: boolean;
  canPostStatus: boolean;
  canUploadFiles: boolean;
  canRequestChange: boolean;
  canApprove: boolean;
  canEvaluate: boolean;
  canPublish: boolean;
  /** shown to the user when something is read-only */
  readOnlyReason: string | null;
}

export const isFunded = (p: ProjectForPerms) =>
  p.requestStatus === "approved" || p.years.some(y => y.approvedAmount !== null);

const EDITABLE_STATUSES = ["draft", "submitted", "under_review", "not_funded", "deferred", "approved"];

export function capabilitiesFor(actor: Actor | null, project: ProjectForPerms | null, settings: CapitalSettings, now = new Date()): Capabilities {
  const none: Capabilities = {
    isAdmin: false, canView: false, canEditFields: false, lockedFields: [], editableYears: [], canSubmit: false,
    canResubmit: false, canWithdraw: false, canDefer: false, canReactivate: false, canDelete: false, canPostStatus: false, canUploadFiles: false,
    canRequestChange: false, canApprove: false, canEvaluate: false, canPublish: false, readOnlyReason: null,
  };
  if (!actor) return none;
  const years = planYears(settings);

  if (actor.kind === "admin") {
    return {
      ...none, isAdmin: true, canView: true, canEditFields: true, lockedFields: [], editableYears: displayYears(settings),
      canSubmit: true, canResubmit: true, canWithdraw: true, canDefer: true, canReactivate: true, canDelete: true, canPostStatus: true,
      canUploadFiles: true, canRequestChange: false, canApprove: true, canEvaluate: true, canPublish: true,
    };
  }

  // Department heads: only their own departments
  if (!project) {
    // creating a new project: must belong to at least one department and the window must be open
    const open = submissionsOpenNow(settings, now);
    return { ...none, canView: actor.departmentIds.length > 0, canEditFields: open && actor.departmentIds.length > 0,
      editableYears: open ? years.filter(y => y > settings.adoptedFY) : [],
      readOnlyReason: open ? null : "Capital requests are closed for editing right now." };
  }
  if (!actor.departmentIds.includes(project.departmentId)) return none;

  const funded = isFunded(project);
  const open = submissionsOpenNow(settings, now);
  const statusEditable = EDITABLE_STATUSES.includes(project.requestStatus);
  const canEdit = open && statusEditable;
  const outerYears = years.filter(y => y > settings.adoptedFY);
  const editableYears = canEdit
    ? outerYears.filter(y => !project.years.some(r => r.fiscalYear === y && r.approvedAmount !== null))
    : [];

  let readOnlyReason: string | null = null;
  if (!open) readOnlyReason = "Capital requests are closed for editing. You can still post project status updates and add photos to funded projects.";
  else if (!statusEditable) readOnlyReason = project.requestStatus === "recommended"
    ? "This request has been recommended and is locked. Contact the Town Manager's office to change it."
    : "This request can no longer be edited.";
  else if (funded) readOnlyReason = "This project is funded, so its approved details are locked. You can revise outer-year requests, post status updates, and add photos and documents.";

  return {
    ...none,
    canView: true,
    canEditFields: canEdit,
    lockedFields: funded ? [...LOCKED_WHEN_APPROVED] : [],
    editableYears,
    canSubmit: open && project.requestStatus === "draft",
    canResubmit: open && project.requestStatus === "not_funded",
    canWithdraw: open && ["submitted", "under_review"].includes(project.requestStatus) && !funded,
    canDefer: open && !funded && ["draft", "submitted", "under_review", "not_funded"].includes(project.requestStatus),
    canReactivate: open && project.requestStatus === "deferred",
    canDelete: project.requestStatus === "draft" && open,
    canPostStatus: funded,
    canUploadFiles: funded || canEdit,
    canRequestChange: funded,
    readOnlyReason,
  };
}

/** Keep only the fields this actor may write. Returns the allowed patch and the names that were refused. */
export function filterFieldPatch<T extends Record<string, unknown>>(
  patch: T, caps: Capabilities, adminOnly: readonly string[]
): { allowed: Partial<T>; refused: string[] } {
  const allowed: Record<string, unknown> = {};
  const refused: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const blocked = !caps.canEditFields || caps.lockedFields.includes(k) || (!caps.isAdmin && adminOnly.includes(k));
    if (blocked) refused.push(k); else allowed[k] = v;
  }
  return { allowed: allowed as Partial<T>, refused };
}
