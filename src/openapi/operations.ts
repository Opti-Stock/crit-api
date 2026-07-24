import type { OpenApiOperation } from "./openapi.js";

const op = (method: OpenApiOperation["method"], path: string, summary: string, tag: string, roles?: string[]): OpenApiOperation => ({ method, path, summary, tag, roles });

export const mainOperations: OpenApiOperation[] = [
  op("post", "/api/auth/login", "Authenticate an operational user", "Auth", []), op("post", "/api/auth/logout", "Close the operational session", "Auth", []), op("get", "/api/auth/me", "Read the current session", "Auth"),
  ...["patients", "collaborators", "clinics", "rooms"].flatMap((resource) => [op("get", `/api/${resource}`, `List ${resource}`, resource), op("get", `/api/${resource}/{id}`, `Get ${resource} item`, resource)]),
  op("get", "/api/calendar/appointment-types", "List appointment types", "Calendar"),
  ...["appointments", "attendance", "medical-notes", "handoff-notes", "notifications"].flatMap((resource) => [op("get", `/api/${resource}`, `List ${resource}`, resource), op("get", `/api/${resource}/{id}`, `Get ${resource} item`, resource)]),
  op("post", "/api/appointments", "Create an appointment", "Appointments", ["recepcion", "coordinador"]), op("patch", "/api/appointments/{id}", "Update an appointment", "Appointments", ["recepcion", "coordinador"]),
  op("post", "/api/attendance", "Register attendance", "Attendance", ["medico", "terapeuta"]), op("patch", "/api/attendance/{id}", "Update attendance", "Attendance", ["medico", "terapeuta"]),
  op("post", "/api/medical-notes", "Create a medical note", "Medical notes", ["medico", "terapeuta"]), op("patch", "/api/medical-notes/{id}", "Update a medical note", "Medical notes", ["medico", "terapeuta"]),
  op("post", "/api/handoff-notes", "Create a handoff note", "Handoff notes", ["personal_acompanamiento"]), op("patch", "/api/handoff-notes/{id}/read", "Mark a handoff note as read", "Handoff notes"),
  op("post", "/api/notifications", "Create an internal notification", "Notifications", ["admin", "direccion"]), op("patch", "/api/notifications/{id}/read", "Mark notification as read", "Notifications"), op("patch", "/api/notifications/{id}/unread", "Mark notification as unread", "Notifications"),
  op("get", "/api/realtime/events", "Stream operational events", "Realtime")
  ,op("post", "/api/patients/{patientId}/note-summaries", "Request a note-history summary", "AI assistance")
  ,op("get", "/api/patients/{patientId}/note-summaries/latest", "Read the latest note-history summary", "AI assistance")
  ,op("get", "/api/note-summaries/{summaryId}", "Read a note-history summary", "AI assistance")
  ,op("post", "/api/patients/{patientId}/ai-questions", "Ask an evidence-backed history question", "AI assistance")
  ,op("get", "/api/ai-interactions/{interactionId}", "Read an AI interaction", "AI assistance")
  ,op("get", "/api/patients/{patientId}/ai-interactions", "List protected AI interactions", "AI assistance")
  ,op("post", "/api/ai-interactions/{interactionId}/feedback", "Rate an AI interaction", "AI assistance")
];

export const adminOperations: OpenApiOperation[] = [
  op("get", "/admin/roles", "List roles", "Roles", ["admin", "direccion"]),
  ...["users", "clinics", "patients", "rooms", "appointment-types", "collaborators"].flatMap((resource) => [op("get", `/admin/${resource}`, `List ${resource}`, resource, ["admin", "direccion"]), op("post", `/admin/${resource}`, `Create ${resource} item`, resource, ["admin", "direccion"]), op("patch", `/admin/${resource}/{id}`, `Update ${resource} item`, resource, ["admin", "direccion"])]),
  op("delete", "/admin/users/{id}", "Deactivate a user", "Users", ["admin", "direccion"]), op("post", "/admin/users/{id}/restore", "Restore a user", "Users", ["admin", "direccion"]), op("put", "/admin/users/{id}/roles", "Replace user roles", "Users", ["admin", "direccion"]), op("put", "/admin/users/{id}/clinic-access", "Replace clinic access", "Users", ["admin", "direccion"]), op("put", "/admin/users/{id}/password", "Replace user password", "Users", ["admin", "direccion"]),
  op("get", "/admin/audit-logs", "List sanitized audit events", "Audit", ["admin", "direccion"])
];

export const checkinOperations: OpenApiOperation[] = [
  op("get", "/checkin/appointments", "List check-in appointments", "Check-in"), op("get", "/checkin/appointments/{id}", "Get check-in appointment", "Check-in"), op("post", "/checkin/appointments/{id}/check-in", "Check in an appointment", "Check-in"), op("post", "/checkin/scan", "Scan a check-in code", "Check-in")
];

export const platformOperations: OpenApiOperation[] = [
  op("post", "/super-admin/auth/login", "Authenticate platform administrator", "Platform auth", []), op("post", "/super-admin/auth/logout", "Close platform session", "Platform auth", []), op("get", "/super-admin/auth/me", "Read platform session", "Platform auth"), op("get", "/super-admin/tenants", "List CRIT tenants", "Tenants"), op("post", "/super-admin/tenants", "Create a CRIT tenant", "Tenants"), op("get", "/super-admin/tenants/{id}", "Get a CRIT tenant", "Tenants"), op("patch", "/super-admin/tenants/{id}", "Update a CRIT tenant", "Tenants"), op("post", "/super-admin/tenants/{id}/admin-users", "Create the first tenant administrator", "Tenants")
];
